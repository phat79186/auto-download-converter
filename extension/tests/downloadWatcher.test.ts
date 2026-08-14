import { describe, it, expect } from "vitest";
import { evaluateDownload, extractExtension, extractBaseName, type DownloadItemInfo } from "../src/background/downloadWatcher.js";

function item(overrides: Partial<DownloadItemInfo> = {}): DownloadItemInfo {
  return {
    id: 1,
    filename: "C:\\Users\\me\\Downloads\\report.txt",
    mime: "text/plain",
    fileSize: 1000,
    state: "complete",
    danger: "safe",
    exists: true,
    ...overrides,
  };
}

describe("extractExtension", () => {
  it("extracts the lowercase extension from a Windows path", () => {
    expect(extractExtension("C:\\Users\\me\\Downloads\\Report.PDF")).toBe("pdf");
  });
  it("extracts the extension from a POSIX path", () => {
    expect(extractExtension("/home/me/Downloads/video.mp4")).toBe("mp4");
  });
  it("returns empty string for a file with no extension", () => {
    expect(extractExtension("/home/me/Downloads/README")).toBe("");
  });
});

describe("extractBaseName", () => {
  it("strips directory and extension", () => {
    expect(extractBaseName("C:\\Downloads\\report.final.txt")).toBe("report.final");
  });
});

describe("evaluateDownload", () => {
  it("processes a normal completed, safe, non-empty file with an extension", () => {
    expect(evaluateDownload(item(), true)).toEqual({ process: true });
  });

  it("skips when monitoring is disabled, before checking anything else", () => {
    expect(evaluateDownload(item({ state: "in_progress" }), false).skipReason).toBe("monitoring-disabled");
  });

  it("does not process a download that is still in progress (no .crdownload processing)", () => {
    expect(evaluateDownload(item({ state: "in_progress" }), true)).toEqual({ process: false, skipReason: "not-complete" });
  });

  it("does not process an interrupted download", () => {
    expect(evaluateDownload(item({ state: "interrupted" }), true).skipReason).toBe("not-complete");
  });

  it("does not process a file flagged as dangerous/malicious", () => {
    expect(evaluateDownload(item({ danger: "dangerous" }), true).skipReason).toBe("flagged-dangerous");
  });

  it("does not process a zero-byte file", () => {
    expect(evaluateDownload(item({ fileSize: 0 }), true).skipReason).toBe("zero-byte");
  });

  it("does not process a file that no longer exists on disk (e.g. user deleted it)", () => {
    expect(evaluateDownload(item({ exists: false }), true).skipReason).toBe("file-missing");
  });

  it("does not process a file with no extension (nothing to match a rule against)", () => {
    expect(evaluateDownload(item({ filename: "/home/me/Downloads/README" }), true).skipReason).toBe("no-extension");
  });
});
