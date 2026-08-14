import { send, escapeHtml } from "../api.js";

interface EngineInfo {
  engine: "ffmpeg" | "pandoc" | "libreoffice";
  installed: boolean;
  version: string | null;
  path: string | null;
  error?: string;
}
interface EnginesResult {
  connected: boolean;
  engines: EngineInfo[];
  error?: string;
}
interface Settings {
  engineConfiguredPaths: Partial<Record<"ffmpeg" | "pandoc" | "libreoffice", string>>;
}

const CAPABILITY_MATRIX: Array<{ pair: string; needs: string }> = [
  { pair: "TXT / MD / CSV / JSON / XML \u2192 PDF, HTML, DOCX, RTF, XLSX, TXT, MD, CSV", needs: "None (built-in)" },
  { pair: "JPG / PNG / WEBP / BMP / GIF \u2194 PNG / JPG / WEBP, Images \u2192 PDF", needs: "None (built-in)" },
  { pair: "MP3 \u2194 WAV, MP3 \u2192 OGG, WAV \u2192 OGG, M4A \u2192 MP3, FLAC \u2192 MP3", needs: "FFmpeg" },
  { pair: "MP4/MOV/MKV/WEBM \u2192 MP3/WAV (extract audio), MP4 \u2194 WEBM, MOV/MKV \u2192 MP4", needs: "FFmpeg" },
  { pair: "DOCX / RTF / ODT / HTML \u2192 PDF", needs: "LibreOffice" },
  { pair: "DOCX / RTF / ODT \u2192 TXT / HTML, MD \u2192 DOCX", needs: "Pandoc (falls back to LibreOffice for TXT/HTML)" },
];

export async function renderEngines(root: HTMLElement): Promise<void> {
  root.innerHTML = `<h1>Engines</h1><p class="view-subtitle">Checking native host&hellip;</p>`;

  const [result, settings] = await Promise.all([
    send<EnginesResult>({ type: "getEngines" }),
    send<Settings>({ type: "getSettings" }),
  ]);

  root.innerHTML = `
    <h1>Engines</h1>
    <p class="view-subtitle">
      ${
        result.connected
          ? `<span class="badge badge-success">\u25cf Native host connected</span>`
          : `<span class="badge badge-fail">\u25cb Native host not detected</span>`
      }
    </p>

    ${
      !result.connected
        ? `<div class="card">
            <strong>Native host isn't installed or isn't responding.</strong>
            <p class="field-hint">Audio, video, and Office-document conversions require the native host (a small local helper that runs FFmpeg/Pandoc/LibreOffice for you). Text/data/image conversions still work without it via the popup's manual "Convert a file now" tool.
            See <span class="mono">docs/NATIVE_HOST_INSTALL.md</span> in the project for setup steps.</p>
          </div>`
        : `<div class="card">
            <h2>Detected engines</h2>
            <table>
              <thead><tr><th>Engine</th><th>Status</th><th>Version</th><th>Path</th><th>Configure</th></tr></thead>
              <tbody>${result.engines.map((e) => engineRow(e, settings.engineConfiguredPaths[e.engine])).join("")}</tbody>
            </table>
          </div>`
    }

    <div class="card">
      <h2>Capability matrix</h2>
      <table>
        <thead><tr><th>Conversions</th><th>Requires</th></tr></thead>
        <tbody>${CAPABILITY_MATRIX.map((c) => `<tr><td>${c.pair}</td><td class="mono">${c.needs}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>(".save-path").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const engine = btn.dataset.engine as "ffmpeg" | "pandoc" | "libreoffice";
      const input = root.querySelector<HTMLInputElement>(`.path-input[data-engine="${engine}"]`)!;
      const current = await send<Settings>({ type: "getSettings" });
      const patch = { engineConfiguredPaths: { ...current.engineConfiguredPaths, [engine]: input.value || undefined } };
      await send({ type: "updateSettings", patch });
      void renderEngines(root);
    });
  });
}

function engineRow(e: EngineInfo, configuredPath: string | undefined): string {
  const status = e.installed ? `<span class="badge badge-success">\u2713 Installed</span>` : `<span class="badge badge-fail">\u2717 Not detected</span>`;
  return `<tr>
    <td style="text-transform:capitalize">${escapeHtml(e.engine)}</td>
    <td>${status}</td>
    <td class="mono">${e.version ? escapeHtml(e.version) : "\u2013"}</td>
    <td class="mono">${e.path ? escapeHtml(e.path) : "\u2013"}</td>
    <td>
      <div style="display:flex;gap:6px">
        <input type="text" class="path-input" data-engine="${e.engine}" placeholder="custom path (optional)" value="${escapeHtml(configuredPath ?? "")}" style="font-family:var(--mono);font-size:11.5px;background:var(--bg-raised);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 8px;width:180px">
        <button class="btn btn-sm save-path" data-engine="${e.engine}">Save</button>
      </div>
    </td>
  </tr>`;
}
