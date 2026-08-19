import { ChromeLocalStore } from "../storage/keyValueStore.js";
import { SettingsStore } from "../storage/settingsStore.js";
import { RulesStore } from "../storage/rulesStore.js";
import { QueueStore } from "../queue/queueStore.js";
import { HistoryStore } from "../storage/historyStore.js";
import { createProductionNativeClient } from "./nativeMessagingClient.js";
import { QueueProcessor, type ConversionBackend } from "../queue/queueProcessor.js";
import { runBrowserConversion } from "../converters/browserConvert.js";
import { evaluateDownload, extractExtension } from "./downloadWatcher.js";
import { matchRule, type DownloadFileInfo } from "../rules/types.js";
import { buildJobPaths } from "./jobBuilder.js";
import { computeAllowedRoots } from "./allowedRoots.js";
import { createJob, jobToHistoryEntry } from "../queue/types.js";
import { findConversion, CONVERSION_REGISTRY } from "../converters/registry.js";
import { arrayBufferToBase64 } from "../shared/base64.js";

const store = new ChromeLocalStore();
const settingsStore = new SettingsStore(store);
const rulesStore = new RulesStore(store);
const queueStore = new QueueStore(store);
const historyStore = new HistoryStore(store);
const nativeClient = createProductionNativeClient();

function notify(opts: { title: string; message: string; isError: boolean }): void {
  chrome.notifications.create({
    type: "basic",
    iconUrl: opts.isError ? "icons/icon-error-128.png" : "icons/icon-128.png",
    title: opts.title,
    message: opts.message,
    priority: opts.isError ? 2 : 0,
  });
}

const backend: ConversionBackend = {
  convertNative: (params) => nativeClient.convert(params),
  readFile: (path, roots) => nativeClient.readFile(path, roots),
  writeFile: (path, data, roots, overwrite) => nativeClient.writeFile(path, data, roots, overwrite),
  deleteFile: (path, roots, downloadId) => {
    if (downloadId !== null && typeof chrome !== "undefined" && chrome.downloads?.removeFile) {
      return new Promise<void>((resolve, reject) => {
        chrome.downloads.removeFile(downloadId, () => {
          if (chrome.runtime.lastError) {
            // Fall back to native host deletion if downloads API fails (e.g. not in downloads folder)
            nativeClient.deleteFile(path, roots).then(resolve, reject);
          } else {
            resolve();
          }
        });
      });
    }
    return nativeClient.deleteFile(path, roots);
  },
};

/**
 * Download IDs this extension itself created via triggerBrowserDownload(), so
 * handleCompletedDownload() can ignore them - otherwise a converted output landing
 * back in the watched folder could in principle be picked up as a new "download to
 * convert" and reprocessed. In-memory only (cleared on service worker restart), which
 * is fine because the whole trigger-download -> onChanged-complete cycle normally
 * finishes well within one service worker lifetime.
 */
const ownDownloadIds = new Set<number>();

/**
 * Saves converted bytes via a REAL chrome.downloads.download() call (not a silent
 * native-host disk write) so the result shows up correctly in the browser's Downloads
 * list/shelf - this is what was missing before. Only used for browser-native
 * conversions (text/data/image), where outputs are small enough to pass as a data: URL.
 */
const triggerBrowserDownload: TriggerBrowserDownloadFn = (params) => {
  return new Promise((resolve, reject) => {
    const url = `data:${params.mimeType};base64,${arrayBufferToBase64(params.bytes)}`;

    chrome.downloads.download({ url, filename: params.filename, conflictAction: "overwrite", saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        reject(new Error(chrome.runtime.lastError?.message ?? "chrome.downloads.download failed to start"));
        return;
      }
      ownDownloadIds.add(downloadId);

      const timeout = setTimeout(() => {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error("Timed out waiting for the save-to-Downloads step to complete"));
      }, 30000);

      const listener = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== downloadId) return;
        if (delta.state?.current === "complete") {
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          chrome.downloads.search({ id: downloadId }).then((items) => {
            resolve({ sizeBytes: items[0]?.fileSize ?? 0, downloadId });
          });
        } else if (delta.state?.current === "interrupted") {
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error("The save-to-Downloads step was interrupted"));
        }
      };
      chrome.downloads.onChanged.addListener(listener);
    });
  });
};

const processor = new QueueProcessor(queueStore, historyStore, backend, runBrowserConversion, triggerBrowserDownload, notify);

let activeCount = 0;
let pumpScheduled = false;

async function pump(): Promise<void> {
  if (pumpScheduled) return;
  pumpScheduled = true;
  try {
    const settings = await settingsStore.get();
    while (activeCount < settings.maxConcurrentConversions) {
      const next = await queueStore.nextQueued();
      if (!next) break;
      activeCount++;
      // Mark it processing immediately so a second pump() call in the same tick can't double-pick it.
      await queueStore.update(next.id, { status: "processing" });
      const roots = computeAllowedRoots(next.sourcePath, null);
      void processor
        .processJob(next, {
          allowedRoots: roots,
          deleteOriginal: next.deleteOriginalRequested,
          overwrite: true, // collisions are already resolved into a unique outputPath at enqueue time
          notifyOnSuccess: settings.notifyOnSuccess,
          notifyOnFailure: settings.notifyOnFailure,
        })
        .finally(() => {
          activeCount--;
          void pump();
        });
    }
  } finally {
    pumpScheduled = false;
  }
}

async function statExists(path: string): Promise<boolean> {
  try {
    const result = await nativeClient.statFile(path, computeAllowedRoots(path, null));
    return result.exists;
  } catch {
    return false; // native host unavailable - don't block queuing on an unknowable check
  }
}

async function handleCompletedDownload(downloadId: number): Promise<void> {
  if (ownDownloadIds.has(downloadId)) {
    // This is a file WE just saved via triggerBrowserDownload() (the conversion output
    // itself), not a new file to convert - ignore it, or every conversion would try to
    // re-trigger itself indefinitely.
    ownDownloadIds.delete(downloadId);
    return;
  }

  const items = await chrome.downloads.search({ id: downloadId });
  const item = items[0];
  if (!item || !item.filename) return;

  const settings = await settingsStore.get();
  const evaluation = evaluateDownload(
    {
      id: item.id,
      filename: item.filename,
      mime: item.mime ?? null,
      fileSize: item.fileSize ?? 0,
      state: item.state as "in_progress" | "interrupted" | "complete",
      danger: item.danger,
      exists: item.exists,
    },
    settings.monitoringEnabled
  );
  if (!evaluation.process) return;

  const ext = extractExtension(item.filename);
  const fileInfo: DownloadFileInfo = { filename: item.filename, extension: ext, mimeType: item.mime ?? null, sizeBytes: item.fileSize ?? 0 };
  const rules = await rulesStore.list();
  const rule = matchRule(fileInfo, rules);
  if (!rule) return;

  // If the file is already in the target format, skip conversion.
  if (ext.toLowerCase() === rule.targetFormat.toLowerCase()) {
    return;
  }

  const descriptor = findConversion(ext, rule.targetFormat);
  if (!descriptor) {
    if (rule.notifyOnFailure) {
      notify({ title: "No converter available", message: `${item.filename}: "${ext} -> ${rule.targetFormat}" is not supported.`, isError: true });
    }
    return;
  }

  const paths = await buildJobPaths(item.filename, rule, statExists);
  if (paths.skipped) {
    notify({ title: "Skipped (output already exists)", message: item.filename, isError: false });
    return;
  }

  const job = createJob({
    id: crypto.randomUUID(),
    downloadId: item.id,
    ruleId: rule.id,
    conversionId: descriptor.id,
    sourceFilename: item.filename.split(/[\\/]/).pop() as string,
    sourcePath: item.filename,
    sourceExt: ext,
    targetExt: rule.targetFormat,
    outputFilename: paths.outputFilename ?? null,
    outputPath: paths.outputPath ?? null,
    relativeSubpath: paths.relativeSubpath ?? null,
    deleteOriginalRequested: rule.deleteOriginal,
    status: rule.automaticConversion ? "queued" : "waiting",
  });

  await queueStore.enqueue(job);
  if (rule.automaticConversion) void pump();
}

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === "complete") {
    void handleCompletedDownload(delta.id);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    const interrupted = await queueStore.markStaleProcessingAsInterrupted();
    for (const job of interrupted) await historyStore.add(jobToHistoryEntry(job));
    void pump();
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const interrupted = await queueStore.markStaleProcessingAsInterrupted();
    for (const job of interrupted) await historyStore.add(jobToHistoryEntry(job));
  })();
});

// ---- Tab Media URL Caching (for catching HLS .m3u8 and stream URLs dynamically) ----
const tabMediaCache = new Map<number, string[]>();

if (typeof chrome !== "undefined" && chrome.webRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = details.url;
      if (url.includes(".m3u8") || url.includes(".mp4") || url.includes(".webm") || url.includes(".mkv")) {
        const tabId = details.tabId;
        if (tabId > 0) {
          if (!tabMediaCache.has(tabId)) {
            tabMediaCache.set(tabId, []);
          }
          const cache = tabMediaCache.get(tabId)!;
          if (!cache.includes(url)) {
            cache.push(url);
          }
        }
      }
    },
    { urls: ["<all_urls>"] }
  );

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabMediaCache.delete(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
      tabMediaCache.delete(tabId);
    }
  });
}

// ---- Messaging with popup/options UI ----
type UiMessage =
  | { type: "getDashboard" }
  | { type: "getRules" }
  | { type: "addRule"; rule: Record<string, unknown> }
  | { type: "updateRule"; id: string; patch: Record<string, unknown> }
  | { type: "removeRule"; id: string }
  | { type: "getQueue" }
  | { type: "retryJob"; id: string }
  | { type: "cancelJob"; id: string }
  | { type: "removeJob"; id: string }
  | { type: "clearFinishedJobs" }
  | { type: "getHistory"; limit?: number }
  | { type: "clearHistory" }
  | { type: "getSettings" }
  | { type: "updateSettings"; patch: Record<string, unknown> }
  | { type: "getEngines" }
  | { type: "pingNativeHost" }
  | { type: "getConversionRegistry" }
  | { type: "convertFileNow"; filename: string; base64Data: string; conversionId: string }
  | { type: "downloadYoutubeFromContent"; url: string; referer?: string; title?: string }
  | { type: "downloadDirectFromContent"; url: string; title: string }
  | { type: "getTabMediaUrls" };

chrome.runtime.onMessage.addListener((message: UiMessage, sender, sendResponse) => {
  if (sender.tab && sender.tab.id) {
    (message as any).tabId = sender.tab.id;
  }
  void (async () => {
    try {
      sendResponse({ ok: true, data: await routeMessage(message) });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();
  return true; // keep the message channel open for the async response
});

async function routeMessage(message: UiMessage): Promise<unknown> {
  switch (message.type) {
    case "getDashboard": {
      const [queue, todayStats, monitoring] = await Promise.all([queueStore.list(), historyStore.statsToday(), settingsStore.get()]);
      return {
        monitoringEnabled: monitoring.monitoringEnabled,
        queueCount: queue.filter((j) => j.status === "queued" || j.status === "processing" || j.status === "waiting").length,
        conversionsToday: todayStats.total,
        successfulToday: todayStats.successful,
        failedToday: todayStats.failed,
        recentHistory: await historyStore.list(10),
      };
    }
    case "getRules":
      return rulesStore.list();
    case "addRule":
      return rulesStore.add(message.rule);
    case "updateRule":
      return rulesStore.update(message.id, message.patch);
    case "removeRule":
      await rulesStore.remove(message.id);
      return { ok: true };
    case "getQueue":
      return queueStore.list();
    case "retryJob":
      await processor.retry(message.id);
      void pump();
      return { ok: true };
    case "cancelJob":
      await processor.cancel(message.id);
      return { ok: true };
    case "removeJob":
      await queueStore.remove(message.id);
      return { ok: true };
    case "clearFinishedJobs":
      await queueStore.clearFinished();
      return { ok: true };
    case "getHistory":
      return historyStore.list(message.limit);
    case "clearHistory":
      await historyStore.clear();
      return { ok: true };
    case "getSettings":
      return settingsStore.get();
    case "updateSettings":
      return settingsStore.update(message.patch);
    case "getEngines": {
      const settings = await settingsStore.get();
      try {
        return { connected: true, engines: await nativeClient.detectEngines(settings.engineConfiguredPaths) };
      } catch (err) {
        return { connected: false, engines: [], error: (err as Error).message };
      }
    }
    case "pingNativeHost":
      return { connected: await nativeClient.ping() };
    case "getConversionRegistry":
      return CONVERSION_REGISTRY;
    case "convertFileNow": {
      // Manual mode: user picked a file via <input type=file> in the popup (works even
      // without the native host installed, for browser-native conversions only).
      const bytes = Uint8Array.from(atob(message.base64Data), (c) => c.charCodeAt(0)).buffer;
      const result = await runBrowserConversion(message.conversionId, bytes);
      const outBytes = new Uint8Array(result.bytes);
      let binary = "";
      for (let i = 0; i < outBytes.length; i++) binary += String.fromCharCode(outBytes[i]!);
      return { base64Data: btoa(binary), mimeType: result.mimeType };
    }
    case "downloadYoutubeFromContent": {
      void handleYoutubeDownload(message.url, message.referer, message.title);
      return { ok: true };
    }
    case "downloadDirectFromContent": {
      const safeTitle = message.title.replace(/[<>:"/\\|?*]/g, "_").trim();
      const ext = message.url.split(/[#?]/)[0].split(".").pop() || "mp4";
      const filename = `${safeTitle}.${ext}`;
      chrome.downloads.download({ url: message.url, filename, saveAs: false });
      return { ok: true };
    }
    case "getTabMediaUrls": {
      const tabId = (message as any).tabId;
      return tabId ? (tabMediaCache.get(tabId) || []) : [];
    }
    default:
      throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
  }
}

async function getBaseDownloadsDir(): Promise<string> {
  return new Promise<string>((resolve) => {
    if (typeof chrome !== "undefined" && chrome.downloads) {
      chrome.downloads.search({ limit: 5, orderBy: ["-startTime"] }, (items) => {
        if (items) {
          for (const item of items) {
            if (item.filename) {
              const p = item.filename;
              const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
              if (idx >= 0) {
                const dir = p.slice(0, idx);
                if (!dir.includes("AppData") && !dir.includes("Temp")) {
                  resolve(dir);
                  return;
                }
              }
            }
          }
        }
        resolve("C:\\Users\\User\\Downloads");
      });
    } else {
      resolve("C:\\Users\\User\\Downloads");
    }
  });
}

async function handleYoutubeDownload(url: string, referer?: string, title?: string): Promise<void> {
  const baseDir = await getBaseDownloadsDir();
  
  let sourceName = "YouTube Video";
  if (url.includes("facebook.com") || url.includes("fb.watch")) {
    sourceName = "Facebook Video";
  } else if (url.includes("tiktok.com")) {
    sourceName = "TikTok Video";
  } else if (url.includes("instagram.com")) {
    sourceName = "Instagram Video";
  } else if (url.includes("twitter.com") || url.includes("x.com")) {
    sourceName = "Twitter Video";
  } else if (url.includes("reddit.com")) {
    sourceName = "Reddit Video";
  } else if (url.includes("vimeo.com")) {
    sourceName = "Vimeo Video";
  } else if (url.includes("twitch.tv")) {
    sourceName = "Twitch Video";
  } else {
    try {
      const hostname = new URL(url).hostname;
      sourceName = hostname.replace("www.", "") + " Video";
    } catch {
      sourceName = "Web Video";
    }
  }

  const fileInfo: DownloadFileInfo = {
    filename: "youtube_video.youtube",
    extension: "youtube",
    mimeType: "video/youtube",
    sizeBytes: 0
  };
  
  const rules = await rulesStore.list();
  const rule = matchRule(fileInfo, rules);
  
  let targetFormat: "mp4" | "mp3" = "mp4";
  let outputLocation: "same-folder" | "dedicated-folder" | "per-format-folder" = "same-folder";
  let dedicatedFolderName = "Converted";
  
  if (rule) {
    if (rule.targetFormat === "mp3") {
      targetFormat = "mp3";
    }
    outputLocation = rule.outputLocation;
    dedicatedFolderName = rule.dedicatedFolderName || "Converted";
  }

  const sep = baseDir.includes("\\") ? "\\" : "/";
  let targetDir = baseDir;
  if (outputLocation === "dedicated-folder") {
    targetDir = baseDir.endsWith(sep) ? baseDir + dedicatedFolderName : baseDir + sep + dedicatedFolderName;
  } else if (outputLocation === "per-format-folder") {
    const parent = baseDir.endsWith(sep) ? baseDir + "Converted" : baseDir + sep + "Converted";
    targetDir = parent + sep + targetFormat.toUpperCase();
  }

  const jobId = crypto.randomUUID();
  const job = createJob({
    id: jobId,
    downloadId: null,
    ruleId: rule?.id ?? null,
    conversionId: `youtube->${targetFormat}`,
    sourceFilename: sourceName,
    sourcePath: url,
    sourceExt: "youtube",
    targetExt: targetFormat,
    outputFilename: null,
    outputPath: null,
    deleteOriginalRequested: false,
    status: "processing"
  });
  
  job.status = "processing";
  job.message = `Initializing ${sourceName} download...`;
  await queueStore.enqueue(job);
  notify({ title: `${sourceName} Download Started`, message: "Downloading video via yt-dlp...", isError: false });

  const notifyOnSuccess = rule?.notifyOnSuccess ?? true;
  const notifyOnFailure = rule?.notifyOnFailure ?? true;

  try {
    const settings = await settingsStore.get();
    const roots = [targetDir, baseDir];
    
    const res = await nativeClient.downloadYoutube({
      jobId,
      url,
      referer,
      title,
      targetFormat,
      outputDir: targetDir,
      allowedRoots: roots,
      configuredPaths: settings.engineConfiguredPaths
    });
    
    if (res.ok && res.outputPath) {
      const finalFilename = res.outputPath.split(/[\\/]/).pop() || "youtube_video";
      const finalTitle = finalFilename.replace(/\.[^.]+$/, "");
      job.status = "completed";
      job.outputPath = res.outputPath;
      job.outputFilename = finalFilename;
      job.sourceFilename = finalTitle;
      job.outputSizeBytes = res.outputSizeBytes ?? 0;
      job.message = "Success";
      await queueStore.update(jobId, {
        status: "completed",
        outputPath: res.outputPath,
        outputFilename: finalFilename,
        sourceFilename: finalTitle,
        outputSizeBytes: res.outputSizeBytes ?? 0,
        message: "Success"
      });
      
      const historyEntry = jobToHistoryEntry(job);
      await historyStore.add(historyEntry);
      
      if (notifyOnSuccess) {
        notify({ title: `${sourceName} Download Success`, message: finalFilename, isError: false });
      }
    } else {
      throw new Error(res.error ?? "Unknown error during download");
    }
  } catch (err) {
    const errMsg = (err as Error).message;
    job.status = "failed";
    job.message = errMsg;
    job.error = errMsg;
    await queueStore.update(jobId, { status: "failed", message: errMsg, error: errMsg });
    
    const historyEntry = jobToHistoryEntry(job);
    await historyStore.add(historyEntry);
    
    if (notifyOnFailure) {
      notify({ title: `${sourceName} Download Failed`, message: errMsg, isError: true });
    }
  }
}

function registerContextMenus(): void {
  if (typeof chrome !== "undefined" && chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "download-youtube",
        title: "Download Video via Auto Download Converter",
        contexts: ["page", "link"],
        documentUrlPatterns: [
          "*://*.youtube.com/*", "*://youtu.be/*",
          "*://*.facebook.com/*", "*://fb.watch/*",
          "*://*.tiktok.com/*",
          "*://*.instagram.com/*",
          "*://*.x.com/*", "*://*.twitter.com/*",
          "*://*.reddit.com/*",
          "*://*.vimeo.com/*",
          "*://*.twitch.tv/*"
        ]
      }, () => {
        if (chrome.runtime.lastError) {
          // ignore
        }
      });
    });
  }
}

if (typeof chrome !== "undefined" && chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "download-youtube") {
      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (url) {
        void handleYoutubeDownload(url);
      }
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

// Kick off recovery + queue processing once at service worker startup (covers the
// case where the worker was woken by an event other than onStartup/onInstalled).
void (async () => {
  await queueStore.markStaleProcessingAsInterrupted();
  void pump();
})();
