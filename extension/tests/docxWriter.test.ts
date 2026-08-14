import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { buildDocx, textToDocx } from "../src/converters/docx/docxWriter.js";

function tmpFile(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-docx-test-"));
  return path.join(dir, name);
}

describe("buildDocx", () => {
  it("produces a real .docx that python-docx (an independent library) can open and read back correctly", () => {
    const bytes = buildDocx([
      { text: "Title Heading", heading: 1 },
      { text: "This is a normal paragraph with some content." },
      { text: "Bold paragraph", bold: true },
      { text: "Line one\nLine two via line break" },
    ]);
    const file = tmpFile("out.docx");
    fs.writeFileSync(file, bytes);

    const script = `
import docx
d = docx.Document(r"${file}")
paras = [p.text for p in d.paragraphs]
assert "Title Heading" in paras, paras
assert any("normal paragraph" in p for p in paras), paras
assert any("Bold paragraph" in p for p in paras), paras
assert any("Line one" in p and "Line two" in p for p in paras), paras
print("OK", len(paras))
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result).toMatch(/^OK/);
  });

  it("is a valid ZIP (PK signature) as required for OOXML", () => {
    const bytes = buildDocx([{ text: "hi" }]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("round-trips real Vietnamese/Unicode text correctly", () => {
    const vietnamese = "Xin chào, đây là tiếng Việt có dấu: ăn uống, trường học, số 123.";
    const bytes = textToDocx(vietnamese);
    const file = tmpFile("vn.docx");
    fs.writeFileSync(file, bytes);
    const script = `
import docx
d = docx.Document(r"${file}")
text = "\\n".join(p.text for p in d.paragraphs)
assert "Xin chào" in text, text
assert "trường học" in text, text
print("OK")
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result).toMatch(/^OK/);
  });

  it("escapes XML-special characters so the document isn't corrupted", () => {
    const bytes = textToDocx('Text with <tags> & "quotes" & special chars');
    const file = tmpFile("escaped.docx");
    fs.writeFileSync(file, bytes);
    const script = `
import docx
d = docx.Document(r"${file}")
text = "\\n".join(p.text for p in d.paragraphs)
assert "<tags>" in text, text
assert '"quotes"' in text, text
print("OK")
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result).toMatch(/^OK/);
  });

  it("can also be opened by LibreOffice (independent, non-Python validation) and converted to PDF", () => {
    const bytes = textToDocx("LibreOffice round-trip test paragraph.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-docx-lo-"));
    const file = path.join(dir, "in.docx");
    fs.writeFileSync(file, bytes);
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", dir, file], { timeout: 30000 });
    const pdfPath = path.join(dir, "in.pdf");
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.readFileSync(pdfPath).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
