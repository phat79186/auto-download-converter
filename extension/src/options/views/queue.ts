import { send, escapeHtml, formatBytes } from "../api.js";
import type { ConversionJob } from "../../queue/types.js";

export async function renderQueue(root: HTMLElement): Promise<void> {
  const jobs = await send<ConversionJob[]>({ type: "getQueue" });
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt);

  root.innerHTML = `
    <h1>Queue</h1>
    <p class="view-subtitle">Current and recent conversion jobs. Conversions run in the background - this page won't freeze while they work.</p>
    <div class="toolbar">
      <span></span>
      <button class="btn" id="clearFinished">Clear finished</button>
    </div>
    <div class="card">
      ${
        sorted.length === 0
          ? `<div class="empty-state"><strong>Queue is empty</strong>Downloads that match a rule will appear here.</div>`
          : `<table>
              <thead><tr><th>File</th><th>Convert</th><th>Status</th><th>Size</th><th></th></tr></thead>
              <tbody>${sorted.map(jobRow).join("")}</tbody>
            </table>`
      }
    </div>
  `;

  root.querySelector("#clearFinished")?.addEventListener("click", async () => {
    await send({ type: "clearFinishedJobs" });
    void renderQueue(root);
  });
  wireJobActions(root);
}

function jobRow(j: ConversionJob): string {
  return `<tr>
    <td class="mono">${escapeHtml(j.sourceFilename)}</td>
    <td class="mono">${escapeHtml(j.sourceExt)} \u2192 ${escapeHtml(j.targetExt)}</td>
    <td>${statusCell(j)}</td>
    <td class="mono">${formatBytes(j.outputSizeBytes)}</td>
    <td>${actionsCell(j)}</td>
  </tr>`;
}

function statusCell(j: ConversionJob): string {
  const map: Record<string, string> = {
    queued: "badge-neutral",
    waiting: "badge-neutral",
    processing: "badge-warn",
    completed: "badge-success",
    failed: "badge-fail",
    cancelled: "badge-neutral",
    interrupted: "badge-fail",
  };
  const label = j.status === "processing" ? "Processing\u2026" : j.status[0]!.toUpperCase() + j.status.slice(1);
  let out = `<span class="badge ${map[j.status] ?? "badge-neutral"}">${label}</span>`;
  if (j.status === "failed" && j.error) out += `<div class="field-hint" style="margin-top:4px;max-width:260px">${escapeHtml(j.error)}</div>`;
  return out;
}

function actionsCell(j: ConversionJob): string {
  const buttons: string[] = [];
  if (j.status === "failed" || j.status === "cancelled" || j.status === "interrupted") {
    buttons.push(`<button class="btn btn-sm retry-job" data-id="${j.id}">Retry</button>`);
  }
  if (j.status === "queued" || j.status === "waiting" || j.status === "processing") {
    buttons.push(`<button class="btn btn-sm danger cancel-job" data-id="${j.id}">Cancel</button>`);
  }
  buttons.push(`<button class="btn btn-sm remove-job" data-id="${j.id}">Remove</button>`);
  return buttons.join(" ");
}

function wireJobActions(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>(".retry-job").forEach((el) =>
    el.addEventListener("click", async () => {
      await send({ type: "retryJob", id: el.dataset.id });
      void renderQueue(root);
    })
  );
  root.querySelectorAll<HTMLButtonElement>(".cancel-job").forEach((el) =>
    el.addEventListener("click", async () => {
      await send({ type: "cancelJob", id: el.dataset.id });
      void renderQueue(root);
    })
  );
  root.querySelectorAll<HTMLButtonElement>(".remove-job").forEach((el) =>
    el.addEventListener("click", async () => {
      await send({ type: "removeJob", id: el.dataset.id });
      void renderQueue(root);
    })
  );
}
