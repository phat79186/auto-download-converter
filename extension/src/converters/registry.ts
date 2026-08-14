import type { ConversionDescriptor } from "./types.js";

/**
 * ConversionRegistry: the single source of truth for every conversion this
 * extension can (or cannot) perform. The UI (rule creation dropdowns, the
 * Engines/capability matrix page) reads this list directly - it must never
 * show an option that isn't in here, and everything in here must actually work.
 */
export const CONVERSION_REGISTRY: ConversionDescriptor[] = [
  // ---- Text (browser-native, no install required) ----
  { id: "txt->pdf", sourceExt: "txt", targetExt: "pdf", label: "TXT to PDF", category: "text", browserCompatible: true, requiresNativeHost: false },
  { id: "txt->html", sourceExt: "txt", targetExt: "html", label: "TXT to HTML", category: "text", browserCompatible: true, requiresNativeHost: false },
  { id: "txt->md", sourceExt: "txt", targetExt: "md", label: "TXT to Markdown", category: "text", browserCompatible: true, requiresNativeHost: false, notes: "Plain text has no structure to infer; content is preserved verbatim with markdown-syntax characters escaped." },
  { id: "txt->docx", sourceExt: "txt", targetExt: "docx", label: "TXT to DOCX", category: "text", browserCompatible: true, requiresNativeHost: false },
  { id: "txt->rtf", sourceExt: "txt", targetExt: "rtf", label: "TXT to RTF", category: "text", browserCompatible: true, requiresNativeHost: false },

  { id: "md->pdf", sourceExt: "md", targetExt: "pdf", label: "Markdown to PDF", category: "text", browserCompatible: true, requiresNativeHost: false, notes: "Block structure (headings/lists/code) is preserved; inline bold/italic/links are flattened to plain text in the rasterized PDF." },
  { id: "md->html", sourceExt: "md", targetExt: "html", label: "Markdown to HTML", category: "text", browserCompatible: true, requiresNativeHost: false },
  { id: "md->txt", sourceExt: "md", targetExt: "txt", label: "Markdown to TXT", category: "text", browserCompatible: true, requiresNativeHost: false },
  { id: "md->docx", sourceExt: "md", targetExt: "docx", label: "Markdown to DOCX", category: "text", browserCompatible: false, requiresNativeHost: true, requiredEngine: "pandoc" },

  { id: "csv->pdf", sourceExt: "csv", targetExt: "pdf", label: "CSV to PDF", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "csv->xlsx", sourceExt: "csv", targetExt: "xlsx", label: "CSV to XLSX", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "csv->html", sourceExt: "csv", targetExt: "html", label: "CSV to HTML", category: "data", browserCompatible: true, requiresNativeHost: false },

  { id: "json->txt", sourceExt: "json", targetExt: "txt", label: "JSON to TXT", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "json->html", sourceExt: "json", targetExt: "html", label: "JSON to HTML", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "json->csv", sourceExt: "json", targetExt: "csv", label: "JSON to CSV", category: "data", browserCompatible: true, requiresNativeHost: false, notes: "Works best for a flat array of objects. Nested objects/arrays are preserved as a JSON string inside their cell rather than expanded into more columns." },
  { id: "json->pdf", sourceExt: "json", targetExt: "pdf", label: "JSON to PDF", category: "data", browserCompatible: true, requiresNativeHost: false },

  { id: "xml->txt", sourceExt: "xml", targetExt: "txt", label: "XML to TXT (pretty-printed)", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "xml->html", sourceExt: "xml", targetExt: "html", label: "XML to HTML", category: "data", browserCompatible: true, requiresNativeHost: false },
  { id: "xml->pdf", sourceExt: "xml", targetExt: "pdf", label: "XML to PDF", category: "data", browserCompatible: true, requiresNativeHost: false },

  // ---- Images (browser-native via OffscreenCanvas) ----
  { id: "jpg->png", sourceExt: "jpg", targetExt: "png", label: "JPG to PNG", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "jpeg->png", sourceExt: "jpeg", targetExt: "png", label: "JPEG to PNG", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "png->jpg", sourceExt: "png", targetExt: "jpg", label: "PNG to JPG", category: "image", browserCompatible: true, requiresNativeHost: false, notes: "Transparency is flattened onto a white background (JPEG has no alpha channel)." },
  { id: "webp->png", sourceExt: "webp", targetExt: "png", label: "WEBP to PNG", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "png->webp", sourceExt: "png", targetExt: "webp", label: "PNG to WEBP", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "jpg->webp", sourceExt: "jpg", targetExt: "webp", label: "JPG to WEBP", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "bmp->png", sourceExt: "bmp", targetExt: "png", label: "BMP to PNG", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "gif->png", sourceExt: "gif", targetExt: "png", label: "GIF to PNG", category: "image", browserCompatible: true, requiresNativeHost: false, notes: "Animated GIFs: only the first frame is converted (standard browser image-decoding behavior)." },
  { id: "jpg->pdf", sourceExt: "jpg", targetExt: "pdf", label: "JPG/Image(s) to PDF", category: "image", browserCompatible: true, requiresNativeHost: false, notes: "Select multiple files in the queue to merge them into one multi-page PDF." },
  { id: "png->pdf", sourceExt: "png", targetExt: "pdf", label: "PNG/Image(s) to PDF", category: "image", browserCompatible: true, requiresNativeHost: false, notes: "Select multiple files in the queue to merge them into one multi-page PDF." },
  { id: "webp->pdf", sourceExt: "webp", targetExt: "pdf", label: "WEBP to PDF", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "bmp->pdf", sourceExt: "bmp", targetExt: "pdf", label: "BMP to PDF", category: "image", browserCompatible: true, requiresNativeHost: false },
  { id: "gif->pdf", sourceExt: "gif", targetExt: "pdf", label: "GIF to PDF", category: "image", browserCompatible: true, requiresNativeHost: false },

  // ---- Audio (requires FFmpeg via native host) ----
  { id: "mp3->wav", sourceExt: "mp3", targetExt: "wav", label: "MP3 to WAV", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "wav->mp3", sourceExt: "wav", targetExt: "mp3", label: "WAV to MP3", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mp3->ogg", sourceExt: "mp3", targetExt: "ogg", label: "MP3 to OGG", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "wav->ogg", sourceExt: "wav", targetExt: "ogg", label: "WAV to OGG", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "m4a->mp3", sourceExt: "m4a", targetExt: "mp3", label: "M4A to MP3", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "flac->mp3", sourceExt: "flac", targetExt: "mp3", label: "FLAC to MP3", category: "audio", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },

  // ---- Video (requires FFmpeg via native host) ----
  { id: "mp4->mp3", sourceExt: "mp4", targetExt: "mp3", label: "MP4 to MP3 (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mp4->wav", sourceExt: "mp4", targetExt: "wav", label: "MP4 to WAV (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mp4->webm", sourceExt: "mp4", targetExt: "webm", label: "MP4 to WEBM", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "webm->mp4", sourceExt: "webm", targetExt: "mp4", label: "WEBM to MP4", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mov->mp4", sourceExt: "mov", targetExt: "mp4", label: "MOV to MP4", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mkv->mp4", sourceExt: "mkv", targetExt: "mp4", label: "MKV to MP4", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mov->mp3", sourceExt: "mov", targetExt: "mp3", label: "MOV to MP3 (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mov->wav", sourceExt: "mov", targetExt: "wav", label: "MOV to WAV (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mkv->mp3", sourceExt: "mkv", targetExt: "mp3", label: "MKV to MP3 (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "mkv->wav", sourceExt: "mkv", targetExt: "wav", label: "MKV to WAV (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },
  { id: "webm->mp3", sourceExt: "webm", targetExt: "mp3", label: "WEBM to MP3 (extract audio)", category: "video", browserCompatible: false, requiresNativeHost: true, requiredEngine: "ffmpeg" },

  // ---- Documents (requires LibreOffice and/or Pandoc via native host) ----
  { id: "html->pdf", sourceExt: "html", targetExt: "pdf", label: "HTML to PDF", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "libreoffice", notes: "Full CSS layout fidelity via LibreOffice." },
  { id: "html->txt", sourceExt: "html", targetExt: "txt", label: "HTML to TXT", category: "document", browserCompatible: true, requiresNativeHost: false, notes: "Works offline via a built-in tag stripper. If Pandoc is installed, higher-fidelity extraction can be used instead." },
  { id: "docx->pdf", sourceExt: "docx", targetExt: "pdf", label: "DOCX to PDF", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "libreoffice" },
  { id: "docx->txt", sourceExt: "docx", targetExt: "txt", label: "DOCX to TXT", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "pandoc" },
  { id: "docx->html", sourceExt: "docx", targetExt: "html", label: "DOCX to HTML", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "pandoc" },
  { id: "rtf->pdf", sourceExt: "rtf", targetExt: "pdf", label: "RTF to PDF", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "libreoffice" },
  { id: "rtf->txt", sourceExt: "rtf", targetExt: "txt", label: "RTF to TXT", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "pandoc" },
  { id: "odt->pdf", sourceExt: "odt", targetExt: "pdf", label: "ODT to PDF", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "libreoffice" },
  { id: "odt->txt", sourceExt: "odt", targetExt: "txt", label: "ODT to TXT", category: "document", browserCompatible: false, requiresNativeHost: true, requiredEngine: "pandoc" },

  // ---- YouTube (requires yt-dlp via native host) ----
  { id: "youtube->mp4", sourceExt: "youtube", targetExt: "mp4", label: "YouTube to MP4 Video", category: "video", browserCompatible: false, requiresNativeHost: true },
  { id: "youtube->mp3", sourceExt: "youtube", targetExt: "mp3", label: "YouTube to MP3 Audio", category: "audio", browserCompatible: false, requiresNativeHost: true },
];

export function findConversion(sourceExt: string, targetExt: string): ConversionDescriptor | undefined {
  const s = sourceExt.toLowerCase().replace(/^\./, "");
  const t = targetExt.toLowerCase().replace(/^\./, "");
  return CONVERSION_REGISTRY.find((c) => c.sourceExt === s && c.targetExt === t);
}

export function conversionsForSource(sourceExt: string): ConversionDescriptor[] {
  const s = sourceExt.toLowerCase().replace(/^\./, "");
  if (s.startsWith("[") && s.endsWith("]")) {
    const category = s.slice(1, -1);
    const categories = category === "images"
      ? ["image"]
      : category === "documents"
        ? ["document", "text"]
        : [category];
    const descriptors = CONVERSION_REGISTRY.filter((c) => categories.includes(c.category));
    const uniqueTargets = new Map<string, ConversionDescriptor>();
    for (const d of descriptors) {
      if (!uniqueTargets.has(d.targetExt)) {
        uniqueTargets.set(d.targetExt, {
          id: `${s}->${d.targetExt}`,
          sourceExt: sourceExt,
          targetExt: d.targetExt,
          label: `Convert to ${d.targetExt.toUpperCase()}`,
          category: d.category,
          browserCompatible: d.browserCompatible,
          requiresNativeHost: d.requiresNativeHost,
          requiredEngine: d.requiredEngine,
        });
      }
    }
    return Array.from(uniqueTargets.values());
  }
  return CONVERSION_REGISTRY.filter((c) => c.sourceExt === s);
}

export function allSourceExtensions(): string[] {
  return [...new Set(CONVERSION_REGISTRY.map((c) => c.sourceExt))].sort();
}
