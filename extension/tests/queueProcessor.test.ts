import { describe, it, expect, vi } from "vitest";
import { InMemoryStore } from "../src/storage/keyValueStore.js";
import { QueueStore } from "../src/queue/queueStore.js";
import { HistoryStore } from "../src/storage/historyStore.js";
import { createJob } from "../src/queue/types.js";
import { QueueProcessor, type ConversionBackend, type ConvertResult } from "../src/queue/queueProcessor.js";

function makeJob(overrides = {}) {
  return createJob({
    id: crypto.randomUUID(),
    downloadId: 1,
    ruleId: null,
    conversionId: "txt->pdf",
    sourceFilename: "report.txt",
    sourcePath: "/downloads/report.txt",
    sourceExt: "txt",
    targetExt: "pdf",
    outputFilename: "report.pdf",
    outputPath: "/downloads/report.pdf",
    relativeSubpath: "report.pdf",
    ...overrides,
  });
}

const BASE_OPTIONS = {
  allowedRoots: ["/downloads"],
  deleteOriginal: false,
  overwrite: false,
  notifyOnSuccess: true,
  notifyOnFailure: true,
};

function setup(backendOverrides: Partial<ConversionBackend> = {}, browserConvertImpl?: any, triggerDownloadImpl?: any) {
  const queueStore = new QueueStore(new InMemoryStore());
  const historyStore = new HistoryStore(new InMemoryStore());
  const notify = vi.fn();
  const backend: ConversionBackend = {
    convertNative: vi.fn(async (): Promise<ConvertResult> => ({ ok: true, outputSizeBytes: 1234, engineUsed: "ffmpeg" })),
    readFile: vi.fn(async () => new TextEncoder().encode("hello").buffer),
    writeFile: vi.fn(async () => ({ path: "/downloads/report.pdf", sizeBytes: 999 })),
    deleteFile: vi.fn(async () => {}),
    ...backendOverrides,
  };
  const runBrowserConversion = browserConvertImpl ?? vi.fn(async () => ({ bytes: new ArrayBuffer(10), mimeType: "application/pdf" }));
  const triggerBrowserDownload = triggerDownloadImpl ?? vi.fn(async () => ({ sizeBytes: 999, downloadId: 42 }));
  const processor = new QueueProcessor(queueStore, historyStore, backend, runBrowserConversion, triggerBrowserDownload, notify);
  return { queueStore, historyStore, notify, backend, runBrowserConversion, triggerBrowserDownload, processor };
}

describe("QueueProcessor - browser-native conversions", () => {
  it("reads via native host, converts in JS, saves via a real chrome.downloads.download() (triggerBrowserDownload), and marks the job completed", async () => {
    const { processor, queueStore, backend, triggerBrowserDownload } = setup();
    const job = makeJob();
    await queueStore.enqueue(job);

    const result = await processor.processJob(job, BASE_OPTIONS);

    expect(result.status).toBe("completed");
    expect(backend.readFile).toHaveBeenCalledWith("/downloads/report.txt", ["/downloads"]);
    expect(backend.writeFile).not.toHaveBeenCalled(); // must NOT silently write to disk - must go through the browser
    expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "report.pdf", mimeType: "application/pdf" })
    );
    expect(result.outputSizeBytes).toBe(999);
    expect(result.engineUsed).toBe("browser");
  });

  it("fails cleanly if the job is missing relativeSubpath instead of silently writing somewhere unexpected", async () => {
    const { processor, queueStore } = setup();
    const job = makeJob({ relativeSubpath: null });
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/relativeSubpath/);
  });

  it("records a history entry on success", async () => {
    const { processor, queueStore, historyStore } = setup();
    const job = makeJob();
    await queueStore.enqueue(job);
    await processor.processJob(job, BASE_OPTIONS);
    const history = await historyStore.list();
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe("completed");
  });

  it("sends a success notification when notifyOnSuccess is true", async () => {
    const { processor, queueStore, notify } = setup();
    const job = makeJob();
    await queueStore.enqueue(job);
    await processor.processJob(job, BASE_OPTIONS);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
  });

  it("treats a zero-byte saved download as a FAILURE, never a fake success", async () => {
    const { processor, queueStore, historyStore } = setup(
      {},
      undefined,
      vi.fn(async () => ({ sizeBytes: 0, downloadId: 1 }))
    );
    const job = makeJob();
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/no usable output/);
    const history = await historyStore.list();
    expect(history[0]?.status).toBe("failed");
  });

  it("propagates a chrome.downloads failure (e.g. interrupted) as a job failure, not a fake success", async () => {
    const { processor, queueStore } = setup(
      {},
      undefined,
      vi.fn(async () => {
        throw new Error("The save-to-Downloads step was interrupted");
      })
    );
    const job = makeJob();
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("interrupted");
  });

  it("propagates a readFile error as a job failure with a clear message, not a silent success", async () => {
    const { processor, queueStore } = setup({
      readFile: vi.fn(async () => {
        throw new Error("Input file does not exist");
      }),
    });
    const job = makeJob();
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Input file does not exist");
  });

  it("deletes the original when deleteOriginal is true, and only after a successful conversion", async () => {
    const { processor, queueStore, backend } = setup();
    const job = makeJob();
    await queueStore.enqueue(job);
    await processor.processJob(job, { ...BASE_OPTIONS, deleteOriginal: true });
    expect(backend.deleteFile).toHaveBeenCalledWith("/downloads/report.txt", ["/downloads"], 1);
  });

  it("does NOT delete the original if the conversion failed", async () => {
    const { processor, queueStore, backend } = setup(
      {},
      undefined,
      vi.fn(async () => {
        throw new Error("disk full");
      })
    );
    const job = makeJob();
    await queueStore.enqueue(job);
    await processor.processJob(job, { ...BASE_OPTIONS, deleteOriginal: true });
    expect(backend.deleteFile).not.toHaveBeenCalled();
  });

  it("a delete-original failure does not turn a successful conversion into a failed job", async () => {
    const { processor, queueStore } = setup();
    const job = makeJob();
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, { ...BASE_OPTIONS, deleteOriginal: true });
    expect(result.status).toBe("completed");
  });
});

describe("QueueProcessor - native-host (ffmpeg/pandoc/libreoffice) conversions", () => {
  it("routes to convertNative and never touches readFile/writeFile for a video conversion", async () => {
    const { processor, queueStore, backend } = setup();
    const job = makeJob({ conversionId: "mp4->mp3", sourceExt: "mp4", targetExt: "mp3", sourceFilename: "clip.mp4", sourcePath: "/downloads/clip.mp4", outputFilename: "clip.mp3", outputPath: "/downloads/clip.mp3" });
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("completed");
    expect(backend.convertNative).toHaveBeenCalled();
    expect(backend.readFile).not.toHaveBeenCalled();
    expect(backend.writeFile).not.toHaveBeenCalled();
  });

  it("reports a clean failure (with the host's error message) when FFmpeg is missing", async () => {
    const { processor, queueStore } = setup({
      convertNative: vi.fn(async (): Promise<ConvertResult> => ({ ok: false, error: "FFmpeg was not found. Install FFmpeg or configure its path in Settings." })),
    });
    const job = makeJob({ conversionId: "mp4->mp3", sourceExt: "mp4", targetExt: "mp3", sourcePath: "/downloads/clip.mp4", outputPath: "/downloads/clip.mp3" });
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("FFmpeg was not found");
  });
});

describe("QueueProcessor - unsupported conversions", () => {
  it("fails cleanly for a conversion pair not in the registry", async () => {
    const { processor, queueStore } = setup();
    const job = makeJob({ conversionId: "xyz->abc", sourceExt: "xyz", targetExt: "abc" });
    await queueStore.enqueue(job);
    const result = await processor.processJob(job, BASE_OPTIONS);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not a supported conversion/);
  });
});

describe("QueueProcessor - retry/cancel", () => {
  it("retry resets a failed job back to queued", async () => {
    const { processor, queueStore } = setup();
    const job = makeJob({ status: "failed", error: "boom" });
    await queueStore.enqueue(job);
    await processor.retry(job.id);
    const updated = await queueStore.get(job.id);
    expect(updated?.status).toBe("queued");
    expect(updated?.error).toBeNull();
  });

  it("cancel marks a job cancelled", async () => {
    const { processor, queueStore } = setup();
    const job = makeJob({ status: "queued" });
    await queueStore.enqueue(job);
    await processor.cancel(job.id);
    expect((await queueStore.get(job.id))?.status).toBe("cancelled");
  });
});
