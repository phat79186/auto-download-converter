import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { textToRtf } from "../src/converters/text/rtf.js";

describe("textToRtf", () => {
  it("produces a document LibreOffice can open, and round-trips plain ASCII text", () => {
    const rtf = textToRtf("Hello world.\nSecond line.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-rtf-test-"));
    const file = path.join(dir, "out.rtf");
    fs.writeFileSync(file, rtf, "latin1");
    execFileSync("soffice", ["--headless", "--convert-to", "txt:Text", "--outdir", dir, file], { timeout: 30000 });
    const txt = fs.readFileSync(path.join(dir, "out.txt"), "utf-8");
    expect(txt).toContain("Hello world.");
    expect(txt).toContain("Second line.");
  });

  it("round-trips Vietnamese text through the \\u Unicode escape mechanism", () => {
    const rtf = textToRtf("Xin chào, đây là tiếng Việt: trường học.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-rtf-vn-test-"));
    const file = path.join(dir, "out.rtf");
    fs.writeFileSync(file, rtf, "latin1");
    execFileSync("soffice", ["--headless", "--convert-to", "txt:Text:UTF8", "--outdir", dir, file], { timeout: 30000 });
    const txt = fs.readFileSync(path.join(dir, "out.txt"), "utf-8");
    expect(txt).toContain("Xin chào");
    expect(txt).toContain("trường học");
  });

  it("escapes RTF control characters (backslash and braces) in the source text", () => {
    const rtf = textToRtf("literal { brace } and \\ backslash");
    expect(rtf).toContain("\\{");
    expect(rtf).toContain("\\}");
    expect(rtf).toContain("\\\\");
  });

  it("starts with the required RTF header", () => {
    expect(textToRtf("x").startsWith("{\\rtf1")).toBe(true);
  });
});
