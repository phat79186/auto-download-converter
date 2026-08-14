export interface DownloadItemInfo {
  id: number;
  filename: string; // full local path, as reported by chrome.downloads
  mime: string | null;
  fileSize: number;
  state: "in_progress" | "interrupted" | "complete";
  danger: string; // chrome.downloads.DangerType
  exists: boolean;
}

export function extractExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function extractBaseName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export type SkipReason =
  | "not-complete"
  | "flagged-dangerous"
  | "zero-byte"
  | "file-missing"
  | "no-extension"
  | "monitoring-disabled";

export interface DownloadEvaluation {
  process: boolean;
  skipReason?: SkipReason;
}

/**
 * Pure decision function: should this completed (or completing) download be
 * considered for conversion? Kept separate from the chrome.downloads.onChanged
 * listener itself so this logic is unit-testable without a real browser.
 */
export function evaluateDownload(item: DownloadItemInfo, monitoringEnabled: boolean): DownloadEvaluation {
  if (!monitoringEnabled) return { process: false, skipReason: "monitoring-disabled" };
  if (item.state !== "complete") return { process: false, skipReason: "not-complete" };
  if (item.danger !== "accepted" && item.danger !== "safe") return { process: false, skipReason: "flagged-dangerous" };
  if (!item.exists) return { process: false, skipReason: "file-missing" };
  if (item.fileSize === 0) return { process: false, skipReason: "zero-byte" };
  if (!extractExtension(item.filename)) return { process: false, skipReason: "no-extension" };
  return { process: true };
}
