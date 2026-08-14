import { send, escapeHtml, formatBytes, formatDate } from "../api.js";
import type { HistoryEntry } from "../../queue/types.js";

export async function renderHistory(root: HTMLElement): Promise<void> {
  const entries = await send<HistoryEntry[]>({ type: "getHistory", limit: 200 });

  root.innerHTML = `
    <h1>History</h1>
    <p class="view-subtitle">Completed and failed conversions (most recent first). Stored locally only.</p>
    <div class="toolbar">
      <span></span>
      <button class="btn danger" id="clearHistory">Clear history</button>
    </div>
    <div class="card">
      ${
        entries.length === 0
          ? `<div class="empty-state"><strong>No history yet</strong></div>`
          : `<table>
              <thead><tr><th>File</th><th>Output</th><th>Status</th><th>Engine</th><th>Size</th><th>Duration</th><th>When</th></tr></thead>
              <tbody>${entries.map(row).join("")}</tbody>
            </table>`
      }
    </div>
  `;

  root.querySelector("#clearHistory")?.addEventListener("click", async () => {
    if (!confirm("Clear all conversion history? This cannot be undone.")) return;
    await send({ type: "clearHistory" });
    void renderHistory(root);
  });
}

function row(h: HistoryEntry): string {
  const badge =
    h.status === "completed"
      ? `<span class="badge badge-success">Completed</span>`
      : h.status === "cancelled"
        ? `<span class="badge badge-neutral">Cancelled</span>`
        : `<span class="badge badge-fail">${h.status === "interrupted" ? "Interrupted" : "Failed"}</span>`;
  return `<tr>
    <td class="mono">${escapeHtml(h.sourceFilename)}</td>
    <td class="mono">${h.outputFilename ? escapeHtml(h.outputFilename) : "\u2013"}</td>
    <td>${badge}${h.error ? `<div class="field-hint" style="margin-top:4px;max-width:260px">${escapeHtml(h.error)}</div>` : ""}</td>
    <td class="mono">${h.engineUsed ? escapeHtml(h.engineUsed) : "\u2013"}</td>
    <td class="mono">${formatBytes(h.outputSizeBytes)}</td>
    <td class="mono">${h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : "\u2013"}</td>
    <td>${formatDate(h.completedAt)}</td>
  </tr>`;
}
