import { CONVERSION_REGISTRY, conversionsForSource } from "../converters/registry.js";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

interface DashboardData {
  monitoringEnabled: boolean;
  queueCount: number;
  conversionsToday: number;
  successfulToday: number;
  failedToday: number;
  recentHistory: Array<{ sourceFilename: string; status: string; outputFilename: string | null }>;
}

async function send<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as { ok: boolean; data?: T; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? "Unknown error");
  return response.data as T;
}

async function loadDashboard(): Promise<void> {
  const data = await send<DashboardData>({ type: "getDashboard" });

  const dot = $("monitorDot");
  const label = $("monitorLabel");
  dot.classList.toggle("on", data.monitoringEnabled);
  dot.classList.toggle("off", !data.monitoringEnabled);
  label.textContent = data.monitoringEnabled ? "Monitoring downloads" : "Monitoring paused";

  $("statToday").textContent = String(data.conversionsToday);
  $("statQueue").textContent = String(data.queueCount);
  $("statSuccess").textContent = String(data.successfulToday);
  $("statFailed").textContent = String(data.failedToday);

  const list = $("recentList");
  if (data.recentHistory.length === 0) {
    list.innerHTML = `<li class="empty">No conversions yet</li>`;
  } else {
    list.innerHTML = data.recentHistory
      .slice(0, 6)
      .map((h) => {
        const ok = h.status === "completed";
        return `<li><span class="name">${escapeHtml(h.sourceFilename)}</span><span class="${ok ? "status-ok" : "status-fail"}">${ok ? "\u2713" : "\u2715"}</span></li>`;
      })
      .join("");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function toggleMonitoring(): Promise<void> {
  const settings = await send<{ monitoringEnabled: boolean }>({ type: "getSettings" });
  await send({ type: "updateSettings", patch: { monitoringEnabled: !settings.monitoringEnabled } });
  await loadDashboard();
}

function setupManualConvert(): void {
  const fileInput = $<HTMLInputElement>("manualFile");
  const targetSelect = $<HTMLSelectElement>("manualTarget");
  const convertBtn = $<HTMLButtonElement>("manualConvertBtn");
  const status = $("manualStatus");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    targetSelect.innerHTML = "";
    if (!file) {
      targetSelect.disabled = true;
      convertBtn.disabled = true;
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allOptions = conversionsForSource(ext);
    const options = allOptions.filter((c) => c.browserCompatible);
    if (allOptions.length === 0) {
      // Nothing converts FROM this extension at all, in this or any other mode -
      // installing the native host would not help, so don't suggest it.
      status.textContent = `Converting from .${ext} isn't supported in this version. See docs/CAPABILITY_MATRIX.md.`;
      status.className = "manual-status fail";
      targetSelect.disabled = true;
      convertBtn.disabled = true;
      return;
    }
    if (options.length === 0) {
      // Conversions exist for this extension, but all of them require the native host
      // (e.g. .mp4 needs FFmpeg, .docx needs LibreOffice/Pandoc).
      status.textContent = `.${ext} conversions require the native host (FFmpeg/LibreOffice/Pandoc). Install it for more options - see docs/NATIVE_HOST_INSTALL.md.`;
      status.className = "manual-status fail";
      targetSelect.disabled = true;
      convertBtn.disabled = true;
      return;
    }
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      targetSelect.appendChild(el);
    }
    targetSelect.disabled = false;
    convertBtn.disabled = false;
    status.textContent = "";
  });

  convertBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    convertBtn.disabled = true;
    status.className = "manual-status";
    status.textContent = "Converting\u2026";
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const base64Data = btoa(binary);
      const conversionId = targetSelect.value;
      const result = await send<{ base64Data: string; mimeType: string }>({
        type: "convertFileNow",
        filename: file.name,
        base64Data,
        conversionId,
      });

      const descriptor = CONVERSION_REGISTRY.find((c) => c.id === conversionId);
      const outName = file.name.replace(/\.[^.]+$/, "") + "." + (descriptor?.targetExt ?? "out");
      const dataUrl = `data:${result.mimeType};base64,${result.base64Data}`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      status.textContent = `Done \u2192 ${outName}`;
      status.className = "manual-status ok";
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = "manual-status fail";
    } finally {
      convertBtn.disabled = false;
    }
  });
}

$("monitorToggle").addEventListener("click", () => void toggleMonitoring());
$("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("openQueue").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("openRules").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("openHistory").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("openEngines").addEventListener("click", () => chrome.runtime.openOptionsPage());

setupManualConvert();
void loadDashboard();
