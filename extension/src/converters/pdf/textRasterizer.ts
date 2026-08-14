import { buildPdfFromJpegPages, type PdfPageImage } from "./pdfWriter.js";

export type TextBlock =
  | { type: "heading1" | "heading2" | "paragraph" | "code" | "bullet"; text: string }
  | { type: "blank" };

export interface RasterizeOptions {
  /** Page size in pixels at `dpi`. Defaults to US Letter @ 150dpi. */
  pageWidthPx?: number;
  pageHeightPx?: number;
  dpi?: number;
  marginPx?: number;
  fontFamily?: string;
  jpegQuality?: number;
}

const DEFAULTS: Required<RasterizeOptions> = {
  pageWidthPx: 1275, // 8.5in * 150dpi
  pageHeightPx: 1650, // 11in * 150dpi
  dpi: 150,
  marginPx: 100,
  // Generic sans-serif so the OS/browser picks a font with the glyphs it needs
  // (Latin Extended for Vietnamese, etc.) instead of forcing one specific font.
  fontFamily: "sans-serif",
  jpegQuality: 0.92,
};

interface Line {
  text: string;
  fontPx: number;
  bold: boolean;
  mono: boolean;
  indentPx: number;
  gapAfterPx: number;
}

function wrapLine(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (text.length === 0) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const pushHardWrap = (word: string) => {
    // A single word wider than the whole line (long URL, etc.) - break by character.
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (ctx.measureText(test).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = test;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width > maxWidth) {
      current = pushHardWrap(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function layoutBlocks(ctx: OffscreenCanvasRenderingContext2D, blocks: TextBlock[], maxWidth: number): Line[] {
  const lines: Line[] = [];
  for (const block of blocks) {
    if (block.type === "blank") {
      lines.push({ text: "", fontPx: 16, bold: false, mono: false, indentPx: 0, gapAfterPx: 8 });
      continue;
    }
    const isHeading1 = block.type === "heading1";
    const isHeading2 = block.type === "heading2";
    const isCode = block.type === "code";
    const isBullet = block.type === "bullet";

    const fontPx = isHeading1 ? 28 : isHeading2 ? 22 : 16;
    const bold = isHeading1 || isHeading2;
    const mono = isCode;
    const indentPx = isBullet ? 28 : 0;

    ctx.font = `${bold ? "bold " : ""}${fontPx}px ${mono ? "monospace" : DEFAULTS.fontFamily}`;
    const prefix = isBullet ? "\u2022  " : "";
    const rawLines = block.text.split("\n");
    for (const raw of rawLines) {
      const wrapped = wrapLine(ctx, prefix + raw, maxWidth - indentPx);
      for (const w of wrapped) {
        lines.push({ text: w, fontPx, bold, mono, indentPx, gapAfterPx: 0 });
      }
    }
    lines.push({ text: "", fontPx: 16, bold: false, mono: false, indentPx: 0, gapAfterPx: isHeading1 || isHeading2 ? 10 : 6 });
  }
  return lines;
}

async function canvasToJpegBytes(canvas: OffscreenCanvas, quality: number): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Renders a sequence of text blocks into one or more full-page JPEGs (via a real
 * browser canvas + font engine, so any script/Unicode the browser can display is
 * rendered correctly) and wraps them into a PDF.
 *
 * NOTE: requires OffscreenCanvas + CanvasRenderingContext2D, available in MV3
 * extension service workers. This function cannot run under plain Node.js.
 */
export async function rasterizeBlocksToPdf(blocks: TextBlock[], opts: RasterizeOptions = {}): Promise<Uint8Array> {
  const o = { ...DEFAULTS, ...opts };
  const maxWidth = o.pageWidthPx - o.marginPx * 2;

  // Measure using a throwaway canvas first so layout doesn't depend on page painting.
  const measureCanvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
  const measureCtx = measureCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const lines = layoutBlocks(measureCtx, blocks, maxWidth);

  const pages: PdfPageImage[] = [];
  let canvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
  let ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const startNewPage = () => {
    canvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
    ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, o.pageWidthPx, o.pageHeightPx);
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "alphabetic";
  };
  startNewPage();

  let cursorY = o.marginPx;
  const bottomLimit = o.pageHeightPx - o.marginPx;

  for (const line of lines) {
    const lineHeight = Math.round(line.fontPx * 1.4);
    if (cursorY + lineHeight > bottomLimit) {
      pages.push({ jpegBytes: await canvasToJpegBytes(canvas, o.jpegQuality), dpi: o.dpi });
      startNewPage();
      cursorY = o.marginPx;
    }
    if (line.text.length > 0) {
      ctx.font = `${line.bold ? "bold " : ""}${line.fontPx}px ${line.mono ? "monospace" : o.fontFamily}`;
      ctx.fillText(line.text, o.marginPx + line.indentPx, cursorY + line.fontPx);
    }
    cursorY += lineHeight + line.gapAfterPx;
  }

  pages.push({ jpegBytes: await canvasToJpegBytes(canvas, o.jpegQuality), dpi: o.dpi });

  return buildPdfFromJpegPages(pages);
}

export interface TableRasterizeOptions extends RasterizeOptions {
  columnWidthsPx?: number[];
}

/** Renders tabular data (used by CSV -> PDF) as a real ruled table, paginating and repeating the header row. */
export async function rasterizeTableToPdf(
  headers: string[],
  rows: string[][],
  opts: TableRasterizeOptions = {}
): Promise<Uint8Array> {
  const o = { ...DEFAULTS, ...opts };
  const maxWidth = o.pageWidthPx - o.marginPx * 2;
  const fontPx = 13;
  const rowHeight = 26;
  const cellPad = 8;

  const measureCanvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
  const measureCtx = measureCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  measureCtx.font = `${fontPx}px ${o.fontFamily}`;

  const colCount = headers.length;
  const naturalWidths = headers.map((h, i) => {
    let max = measureCtx.measureText(h).width;
    for (const row of rows) {
      const cell = row[i] ?? "";
      max = Math.max(max, measureCtx.measureText(cell).width);
    }
    return max + cellPad * 2;
  });
  const naturalTotal = naturalWidths.reduce((a, b) => a + b, 0);
  const scale = naturalTotal > maxWidth ? maxWidth / naturalTotal : 1;
  const colWidths = o.columnWidthsPx ?? naturalWidths.map((w) => Math.max(40, w * scale));

  const pages: PdfPageImage[] = [];
  let canvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
  let ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

  const drawRow = (cells: string[], y: number, bold: boolean) => {
    let x = o.marginPx;
    ctx.font = `${bold ? "bold " : ""}${fontPx}px ${o.fontFamily}`;
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 1;
    for (let i = 0; i < colCount; i++) {
      const w = colWidths[i] ?? 60;
      const text = cells[i] ?? "";
      const truncated = ctx.measureText(text).width > w - cellPad * 2 ? clipToWidth(ctx, text, w - cellPad * 2) : text;
      ctx.fillStyle = "#000000";
      ctx.fillText(truncated, x + cellPad, y + rowHeight - 9);
      ctx.strokeRect(x, y, w, rowHeight);
      x += w;
    }
  };

  const startNewPage = () => {
    canvas = new OffscreenCanvas(o.pageWidthPx, o.pageHeightPx);
    ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, o.pageWidthPx, o.pageHeightPx);
  };

  startNewPage();
  let y = o.marginPx;
  drawRow(headers, y, true);
  y += rowHeight;

  for (const row of rows) {
    if (y + rowHeight > o.pageHeightPx - o.marginPx) {
      pages.push({ jpegBytes: await canvasToJpegBytes(canvas, o.jpegQuality), dpi: o.dpi });
      startNewPage();
      y = o.marginPx;
      drawRow(headers, y, true);
      y += rowHeight;
    }
    drawRow(row, y, false);
    y += rowHeight;
  }

  pages.push({ jpegBytes: await canvasToJpegBytes(canvas, o.jpegQuality), dpi: o.dpi });
  return buildPdfFromJpegPages(pages);
}

function clipToWidth(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string {
  const ellipsis = "\u2026";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ellipsis;
}
