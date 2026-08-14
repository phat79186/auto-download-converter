import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { buildPdfFromJpegPages, PdfBuildError } from "../src/converters/pdf/pdfWriter.js";
import { readJpegDimensions, InvalidJpegError } from "../src/converters/pdf/jpeg.js";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");
const SAMPLE_JPG = fs.readFileSync(path.join(FIXTURES, "sample.jpg"));

describe("readJpegDimensions", () => {
  it("reads the real dimensions out of a real JPEG fixture", () => {
    const dims = readJpegDimensions(new Uint8Array(SAMPLE_JPG));
    // fixtures/generate.sh creates a 200x150 test image
    expect(dims.width).toBe(200);
    expect(dims.height).toBe(150);
  });

  it("throws InvalidJpegError on garbage input instead of silently returning bogus dimensions", () => {
    expect(() => readJpegDimensions(new Uint8Array([1, 2, 3, 4]))).toThrow(InvalidJpegError);
  });
});

describe("buildPdfFromJpegPages", () => {
  it("produces a PDF that pdfinfo/pypdf/pdftoppm can genuinely open and render", () => {
    const pdf = buildPdfFromJpegPages([
      { jpegBytes: new Uint8Array(SAMPLE_JPG), dpi: 150 },
      { jpegBytes: new Uint8Array(SAMPLE_JPG), dpi: 150 },
    ]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-pdf-test-"));
    const pdfPath = path.join(dir, "out.pdf");
    fs.writeFileSync(pdfPath, pdf);

    // External, independent validation - not our own code checking its own output.
    const info = execFileSync("pdfinfo", [pdfPath]).toString();
    expect(info).toMatch(/Pages:\s+2/);

    // pdftoppm actually rasterizes the PDF - this fails hard if the PDF is malformed.
    execFileSync("pdftoppm", ["-png", "-r", "30", pdfPath, path.join(dir, "render")]);
    const rendered = fs.readdirSync(dir).filter((f) => f.startsWith("render"));
    expect(rendered.length).toBe(2);
    for (const f of rendered) {
      expect(fs.statSync(path.join(dir, f)).size).toBeGreaterThan(0);
    }
  });

  it("sizes the PDF page from the JPEG's real pixel dimensions and the given DPI", () => {
    // 200x150 px @ 100 dpi -> 144pt x 108pt page
    const pdf = buildPdfFromJpegPages([{ jpegBytes: new Uint8Array(SAMPLE_JPG), dpi: 100 }]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-pdf-test-"));
    const pdfPath = path.join(dir, "out.pdf");
    fs.writeFileSync(pdfPath, pdf);
    const info = execFileSync("pdfinfo", [pdfPath]).toString();
    expect(info).toMatch(/Page size:\s+144(\.\d+)?\s*x\s*108(\.\d+)?\s*pts/);
  });

  it("refuses to build a zero-page PDF (no fake empty success)", () => {
    expect(() => buildPdfFromJpegPages([])).toThrow(PdfBuildError);
  });

  it("throws (not a silently corrupt PDF) if given non-JPEG bytes as a page", () => {
    expect(() => buildPdfFromJpegPages([{ jpegBytes: new Uint8Array([1, 2, 3]) }])).toThrow(PdfBuildError);
  });

  it("produces a valid xref table pypdf can parse strictly", () => {
    const pdf = buildPdfFromJpegPages([{ jpegBytes: new Uint8Array(SAMPLE_JPG) }]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-pdf-test-"));
    const pdfPath = path.join(dir, "out.pdf");
    fs.writeFileSync(pdfPath, pdf);
    const script = `
import pypdf
r = pypdf.PdfReader(r"${pdfPath}", strict=True)
assert len(r.pages) == 1
page = r.pages[0]
img_count = len(page.images)
assert img_count == 1, f"expected 1 image, got {img_count}"
print("OK")
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result.trim()).toBe("OK");
  });
});
