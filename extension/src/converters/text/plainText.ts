import { rasterizeBlocksToPdf, type TextBlock } from "../pdf/textRasterizer.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text -> a minimal, valid HTML document (content escaped, whitespace preserved). */
export function textToHtml(text: string, title = "Document"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>body{font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5}</style>
</head>
<body>${escapeHtml(text)}</body>
</html>
`;
}

/**
 * Plain text -> Markdown. Since plain text has no structure to infer, this wraps
 * the content as literal paragraphs and backslash-escapes characters that would
 * otherwise be re-interpreted as Markdown syntax (so the visible result still
 * matches the original text when rendered).
 */
export function textToMarkdown(text: string): string {
  const escaped = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      let l = line.replace(/([*_`\[\]\\])/g, "\\$1");
      if (/^\s*#/.test(l)) l = l.replace(/^(\s*)#/, "$1\\#");
      if (/^\s*[-+]\s/.test(l)) l = l.replace(/^(\s*)([-+])/, "$1\\$2");
      if (/^\s*>/.test(l)) l = l.replace(/^(\s*)>/, "$1\\>");
      return l;
    })
    .join("\n");
  return escaped + (escaped.endsWith("\n") ? "" : "\n");
}

/** Very simple, dependency-free HTML tag stripper for HTML -> TXT (browser-only path;
 *  the native-host Pandoc/LibreOffice path gives higher-fidelity extraction when installed). */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(h[1-6]|div|tr|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Browser-only: rasterizes plain text as a real PDF (word-wrapped, paginated, full Unicode support). */
export async function textToPdf(text: string): Promise<Uint8Array> {
  const blocks: TextBlock[] = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .flatMap((para): TextBlock[] => [{ type: "paragraph", text: para }, { type: "blank" }]);
  return rasterizeBlocksToPdf(blocks.length ? blocks : [{ type: "paragraph", text: "" }]);
}
