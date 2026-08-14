import { send, escapeHtml } from "../api.js";

interface DashboardData {
  monitoringEnabled: boolean;
  queueCount: number;
  conversionsToday: number;
  successfulToday: number;
  failedToday: number;
  recentHistory: Array<{ sourceFilename: string; outputFilename: string | null; status: string; error: string | null; completedAt: number }>;
}

export async function renderDashboard(root: HTMLElement): Promise<void> {
  const data = await send<DashboardData>({ type: "getDashboard" });

  root.innerHTML = `
    <h1>Dashboard</h1>
    <p class="view-subtitle">
      <span class="badge ${data.monitoringEnabled ? "badge-success" : "badge-neutral"}">
        ${data.monitoringEnabled ? "\u25cf Monitoring downloads" : "\u25cb Monitoring paused"}
      </span>
    </p>

    <div class="stat-row">
      <div class="stat-box"><div class="num">${data.conversionsToday}</div><div class="label">Conversions today</div></div>
      <div class="stat-box"><div class="num">${data.queueCount}</div><div class="label">In queue</div></div>
      <div class="stat-box success"><div class="num">${data.successfulToday}</div><div class="label">Successful</div></div>
      <div class="stat-box fail"><div class="num">${data.failedToday}</div><div class="label">Failed</div></div>
    </div>

    <div class="card">
      <h2>Recent activity</h2>
      ${
        data.recentHistory.length === 0
          ? `<div class="empty-state"><strong>No conversions yet</strong>Create a rule and download a matching file to see activity here.</div>`
          : `<table>
              <thead><tr><th>File</th><th>Result</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                ${data.recentHistory
                  .map(
                    (h) => `<tr>
                      <td class="mono">${escapeHtml(h.sourceFilename)}</td>
                      <td class="mono">${h.outputFilename ? escapeHtml(h.outputFilename) : "\u2013"}</td>
                      <td>${statusBadge(h.status)}</td>
                      <td>${new Date(h.completedAt).toLocaleTimeString()}</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    </div>
  `;
}

function statusBadge(status: string): string {
  if (status === "completed") return `<span class="badge badge-success">Completed</span>`;
  if (status === "failed") return `<span class="badge badge-fail">Failed</span>`;
  if (status === "interrupted") return `<span class="badge badge-warn">Interrupted</span>`;
  return `<span class="badge badge-neutral">${escapeHtml(status)}</span>`;
}
