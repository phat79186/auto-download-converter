import { buildPdfFromJpegPages, type PdfPageImage } from "../pdf/pdfWriter.js";

export type ImageOutputFormat = "png" | "jpeg" | "webp";

export interface ImageConvertOptions {
  /** 0-1, only used for jpeg/webp. */
  quality?: number;
  /** Used to flatten transparency when converting to a format with no alpha channel (JPEG). */
  backgroundColor?: string;
}

export interface ImageConvertResult {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  mimeType: string;
}

const MIME_BY_FORMAT: Record<ImageOutputFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Decodes any browser-supported raster image (PNG/JPEG/WEBP/BMP/GIF) via
 * createImageBitmap and re-encodes it to the requested target format via
 * OffscreenCanvas.convertToBlob.
 *
 * KNOWN LIMITATION (documented, not silently hidden): createImageBitmap only
 * decodes the FIRST FRAME of an animated GIF/WEBP. Converting an animated
 * source therefore produces a single still image of frame 1, not an animation.
 * This is standard browser behavior, not a bug specific to this extension.
 *
 * Requires OffscreenCanvas + createImageBitmap, both available in MV3 service
 * workers - this cannot be exercised under plain Node.js.
 */
export async function convertImage(
  inputBytes: ArrayBuffer,
  targetFormat: ImageOutputFormat,
  options: ImageConvertOptions = {}
): Promise<ImageConvertResult> {
  const sourceBlob = new Blob([inputBytes]);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch (err) {
    throw new Error(`Could not decode the source image (unsupported or corrupted file): ${(err as Error).message}`);
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context is unavailable in this environment");

  if (targetFormat === "jpeg") {
    // JPEG has no alpha channel - flatten onto a solid background first.
    ctx.fillStyle = options.backgroundColor ?? "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const mimeType = MIME_BY_FORMAT[targetFormat];
  const outBlob = await canvas.convertToBlob({ type: mimeType, quality: options.quality ?? 0.92 });
  const bytes = await outBlob.arrayBuffer();

  if (bytes.byteLength === 0) {
    throw new Error("Image conversion produced a zero-byte result");
  }

  return { bytes, width: bitmap.width, height: bitmap.height, mimeType };
}

/** "Images -> PDF": each input image becomes one full page. Re-encodes via JPEG for embedding. */
export async function imagesToPdf(images: ArrayBuffer[], quality = 0.9): Promise<Uint8Array> {
  if (images.length === 0) throw new Error("No images provided");
  const pages: PdfPageImage[] = [];
  for (const img of images) {
    const { bytes } = await convertImage(img, "jpeg", { quality });
    pages.push({ jpegBytes: new Uint8Array(bytes), dpi: 96 });
  }
  return buildPdfFromJpegPages(pages);
}
