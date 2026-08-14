export async function send<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as { ok: boolean; data?: T; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? "Unknown error");
  return response.data as T;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "\u2013";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
