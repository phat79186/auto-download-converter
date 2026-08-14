import { describe, it, expect } from "vitest";
import { matchRule, validateRule, createDefaultRule, type DownloadFileInfo } from "../src/rules/types.js";
import { renderFilenameTemplate, sanitizeWindowsFilename, resolveCollision } from "../src/rules/filenameTemplate.js";

function file(overrides: Partial<DownloadFileInfo> = {}): DownloadFileInfo {
  return { filename: "test.txt", extension: "txt", mimeType: "text/plain", sizeBytes: 1000, ...overrides };
}

describe("matchRule", () => {
  it("matches a rule by extension", () => {
    const rule = createDefaultRule({ sourceExtension: "txt", targetFormat: "pdf" });
    const matched = matchRule(file({ extension: "txt" }), [rule]);
    expect(matched?.id).toBe(rule.id);
  });

  it("does not match a disabled rule", () => {
    const rule = createDefaultRule({ sourceExtension: "txt", enabled: false });
    expect(matchRule(file(), [rule])).toBeNull();
  });

  it("picks the highest-priority (lowest number) matching rule when several match", () => {
    const low = createDefaultRule({ sourceExtension: "txt", priority: 50, name: "low-num-high-prio" });
    const high = createDefaultRule({ sourceExtension: "txt", priority: 200, name: "high-num-low-prio" });
    const matched = matchRule(file(), [high, low]);
    expect(matched?.id).toBe(low.id);
  });

  it("respects maxFileSizeBytes and skips rules the file exceeds", () => {
    const small = createDefaultRule({ sourceExtension: "txt", maxFileSizeBytes: 100 });
    expect(matchRule(file({ sizeBytes: 1000 }), [small])).toBeNull();
    expect(matchRule(file({ sizeBytes: 50 }), [small])).not.toBeNull();
  });

  it("supports a wildcard source extension", () => {
    const rule = createDefaultRule({ sourceExtension: "*", targetFormat: "pdf" });
    expect(matchRule(file({ extension: "anything" }), [rule])?.id).toBe(rule.id);
  });

  it("filters by MIME pattern when specified", () => {
    const rule = createDefaultRule({ sourceExtension: "*", sourceMimePattern: "image/*" });
    expect(matchRule(file({ mimeType: "image/png" }), [rule])).not.toBeNull();
    expect(matchRule(file({ mimeType: "text/plain" }), [rule])).toBeNull();
  });

  it("matches a category like [images]", () => {
    const rule = createDefaultRule({ sourceExtension: "[images]", targetFormat: "png" });
    expect(matchRule(file({ extension: "jpg" }), [rule])?.id).toBe(rule.id);
    expect(matchRule(file({ extension: "png" }), [rule])?.id).toBe(rule.id);
    expect(matchRule(file({ extension: "txt" }), [rule])).toBeNull();
  });

  it("matches a category like [documents] (which spans document and text categories)", () => {
    const rule = createDefaultRule({ sourceExtension: "[documents]", targetFormat: "pdf" });
    expect(matchRule(file({ extension: "docx" }), [rule])?.id).toBe(rule.id);
    expect(matchRule(file({ extension: "txt" }), [rule])?.id).toBe(rule.id);
    expect(matchRule(file({ extension: "jpg" }), [rule])).toBeNull();
  });
});

describe("validateRule", () => {
  it("accepts a well-formed default rule", () => {
    expect(validateRule(createDefaultRule())).toEqual([]);
  });

  it("rejects a rule whose target format equals the source extension", () => {
    const errors = validateRule(createDefaultRule({ sourceExtension: "pdf", targetFormat: "pdf" }));
    expect(errors.some((e) => e.field === "targetFormat")).toBe(true);
  });

  it("rejects an empty rule name", () => {
    const errors = validateRule(createDefaultRule({ name: "  " }));
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("warns when the filename template has no {name} or {counter}", () => {
    const errors = validateRule(createDefaultRule({ filenameTemplate: "static.{extension}" }));
    expect(errors.some((e) => e.field === "filenameTemplate")).toBe(true);
  });

  it("accepts category source extension format [images]", () => {
    const errors = validateRule(createDefaultRule({ sourceExtension: "[images]", targetFormat: "png" }));
    expect(errors).toEqual([]);
  });
});

describe("renderFilenameTemplate", () => {
  it("substitutes {name} and {extension}", () => {
    const result = renderFilenameTemplate("{name}_converted.{extension}", { name: "report", extension: "pdf" });
    expect(result).toBe("report_converted.pdf");
  });

  it("substitutes {date} in a fixed, predictable format", () => {
    const now = new Date(2026, 0, 5); // Jan 5 2026
    const result = renderFilenameTemplate("{name}_{date}.{extension}", { name: "x", extension: "pdf", now });
    expect(result).toBe("x_2026-01-05.pdf");
  });

  it("substitutes {counter}", () => {
    const result = renderFilenameTemplate("{name}_{counter}.{extension}", { name: "x", extension: "pdf", counter: 3 });
    expect(result).toBe("x_3.pdf");
  });

  it("appends the extension if the template forgot it", () => {
    const result = renderFilenameTemplate("{name}", { name: "x", extension: "pdf" });
    expect(result).toBe("x.pdf");
  });

  it("leaves unknown variables visible rather than silently deleting them", () => {
    const result = renderFilenameTemplate("{name}_{bogus}.{extension}", { name: "x", extension: "pdf" });
    expect(result).toContain("{bogus}");
  });
});

describe("sanitizeWindowsFilename", () => {
  it("strips characters illegal on Windows", () => {
    expect(sanitizeWindowsFilename('a:b*c?d"e|f.txt')).not.toMatch(/[:*?"|]/);
  });

  it("neutralizes reserved device names", () => {
    expect(sanitizeWindowsFilename("COM1.txt").toUpperCase()).not.toBe("COM1.TXT");
  });
});

describe("resolveCollision", () => {
  it("returns the original name if it doesn't exist", async () => {
    const result = await resolveCollision("file.pdf", async () => false);
    expect(result).toBe("file.pdf");
  });

  it("appends (1), (2), ... until it finds a free name", async () => {
    const taken = new Set(["file.pdf", "file (1).pdf", "file (2).pdf"]);
    const result = await resolveCollision("file.pdf", async (name) => taken.has(name));
    expect(result).toBe("file (3).pdf");
  });
});
