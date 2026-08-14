import { readJpegDimensions, InvalidJpegError } from "./jpeg.js";

export interface PdfPageImage {
  jpegBytes: Uint8Array;
  /** Pixels-per-inch the image was rendered/scanned at, used to compute the PDF page size in points. */
  dpi?: number;
}

export class PdfBuildError extends Error {}

function encLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Reads the JPEG SOF segment's component count (1=Gray, 3=YCbCr/RGB, 4=CMYK) to pick the right PDF ColorSpace. */
function readJpegComponents(bytes: Uint8Array): number {
  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] as number;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segLen = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof) {
      return bytes[offset + 9] as number;
    }
    if (marker === 0xda) break;
    offset += 2 + segLen;
  }
  return 3; // sane default: RGB
}

/**
 * Builds a valid PDF where each page is a single full-bleed embedded JPEG.
 * Used both for "Images -> PDF" (the JPEGs are the user's actual photos) and for
 * text/CSV/JSON/XML "-> PDF" (the JPEGs are rasterized text pages, produced by
 * textRasterizer.ts, so real Unicode/Vietnamese text renders via the browser's own
 * font engine instead of a hand-rolled Latin-1-only vector font).
 */
export function buildPdfFromJpegPages(pages: PdfPageImage[]): Uint8Array {
  if (pages.length === 0) {
    throw new PdfBuildError("Cannot build a PDF with zero pages");
  }

  const POINTS_PER_INCH = 72;
  const numPages = pages.length;
  // Object numbering: 1=Catalog, 2=Pages. Then per page i (0-indexed): 3+3i=Page, 4+3i=Contents, 5+3i=Image
  const catalogNum = 1;
  const pagesNum = 2;
  const pageObjNums = Array.from({ length: numPages }, (_, i) => 3 + 3 * i);
  const contentObjNums = Array.from({ length: numPages }, (_, i) => 4 + 3 * i);
  const imageObjNums = Array.from({ length: numPages }, (_, i) => 5 + 3 * i);
  const totalObjects = 2 + numPages * 3;

  const pieces: Uint8Array[] = [];
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let cursor = 0;

  function write(bytes: Uint8Array) {
    pieces.push(bytes);
    cursor += bytes.length;
  }
  function writeStr(s: string) {
    write(encLatin1(s));
  }
  function beginObj(num: number) {
    offsets[num] = cursor;
    writeStr(`${num} 0 obj\n`);
  }
  function endObj() {
    writeStr("endobj\n");
  }

  writeStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"); // binary marker comment, standard convention

  beginObj(catalogNum);
  writeStr(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>\n`);
  endObj();

  beginObj(pagesNum);
  writeStr(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${numPages} >>\n`);
  endObj();

  for (let i = 0; i < numPages; i++) {
    const page = pages[i]!;
    let dims;
    try {
      dims = readJpegDimensions(page.jpegBytes);
    } catch (err) {
      throw new PdfBuildError(`Page ${i + 1}: ${err instanceof InvalidJpegError ? err.message : String(err)}`);
    }
    const dpi = page.dpi ?? 150;
    const widthPt = (dims.width / dpi) * POINTS_PER_INCH;
    const heightPt = (dims.height / dpi) * POINTS_PER_INCH;
    const components = readJpegComponents(page.jpegBytes);
    const colorSpace = components === 1 ? "DeviceGray" : components === 4 ? "DeviceCMYK" : "DeviceRGB";

    const pageNum = pageObjNums[i]!;
    const contentNum = contentObjNums[i]!;
    const imageNum = imageObjNums[i]!;

    beginObj(pageNum);
    writeStr(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`
    );
    endObj();

    const content = `q\n${widthPt.toFixed(2)} 0 0 ${heightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encLatin1(content);
    beginObj(contentNum);
    writeStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
    write(contentBytes);
    writeStr("\nendstream\n");
    endObj();

    beginObj(imageNum);
    writeStr(
      `<< /Type /XObject /Subtype /Image /Width ${dims.width} /Height ${dims.height} ` +
        `/ColorSpace /${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
    );
    write(page.jpegBytes);
    writeStr("\nendstream\n");
    endObj();
  }

  const xrefOffset = cursor;
  writeStr(`xref\n0 ${totalObjects + 1}\n`);
  writeStr("0000000000 65535 f \n");
  for (let n = 1; n <= totalObjects; n++) {
    writeStr(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  }
  writeStr(`trailer\n<< /Size ${totalObjects + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return concat(pieces);
}
