export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: InlineSpan[][] }
  | { type: "code"; text: string }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "hr" };

/** Parses inline markdown formatting: **bold**, *italic*, `code`, [text](url). */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  // Order matters: code spans first (their contents must not be re-parsed), then links, then bold, then italic.
  const tokenRe = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) spans.push({ text: linkMatch[1] as string, link: linkMatch[2] as string });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else {
      spans.push({ text: token.slice(1, -1), italic: true });
    }
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex) });
  }
  return spans.length ? spans : [{ text: "" }];
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as string;

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test((lines[i] as string).trim())) {
        codeLines.push(lines[i] as string);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length as 1 | 2 | 3;
      blocks.push({ type: "heading", level, spans: parseInline(headingMatch[2]!.trim()) });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] as string)) {
        quoteLines.push((lines[i] as string).replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", spans: parseInline(quoteLines.join(" ")) });
      continue;
    }

    // List (unordered - / * / +, or ordered 1.)
    const bulletMatch = /^[-*+]\s+(.*)$/.exec(line);
    const orderedMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (bulletMatch || orderedMatch) {
      const ordered = !!orderedMatch;
      const items: InlineSpan[][] = [];
      while (i < lines.length) {
        const l = lines[i] as string;
        const b = /^[-*+]\s+(.*)$/.exec(l);
        const o = /^\d+\.\s+(.*)$/.exec(l);
        if (ordered && o) {
          items.push(parseInline(o[1]!));
          i++;
        } else if (!ordered && b) {
          items.push(parseInline(b[1]!));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: consume until blank line or a line that starts a new block type
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] as string).trim() !== "" &&
      !/^```/.test((lines[i] as string).trim()) &&
      !/^(#{1,3})\s+/.test(lines[i] as string) &&
      !/^[-*+]\s+/.test(lines[i] as string) &&
      !/^\d+\.\s+/.test(lines[i] as string) &&
      !/^>\s?/.test(lines[i] as string)
    ) {
      paraLines.push(lines[i] as string);
      i++;
    }
    blocks.push({ type: "paragraph", spans: parseInline(paraLines.join(" ").trim()) });
  }

  return blocks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function spansToHtml(spans: InlineSpan[]): string {
  return spans
    .map((s) => {
      let t = escapeHtml(s.text);
      if (s.code) t = `<code>${t}</code>`;
      if (s.bold) t = `<strong>${t}</strong>`;
      if (s.italic) t = `<em>${t}</em>`;
      if (s.link) t = `<a href="${escapeHtml(s.link)}">${t}</a>`;
      return t;
    })
    .join("");
}

function spansToText(spans: InlineSpan[]): string {
  return spans.map((s) => s.text).join("");
}

export function markdownToHtml(source: string, title = "Document"): string {
  const blocks = parseMarkdown(source);
  const body: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        body.push(`<h${b.level}>${spansToHtml(b.spans)}</h${b.level}>`);
        break;
      case "paragraph":
        body.push(`<p>${spansToHtml(b.spans)}</p>`);
        break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        const items = b.items.map((it) => `<li>${spansToHtml(it)}</li>`).join("");
        body.push(`<${tag}>${items}</${tag}>`);
        break;
      }
      case "code":
        body.push(`<pre><code>${escapeHtml(b.text)}</code></pre>`);
        break;
      case "quote":
        body.push(`<blockquote>${spansToHtml(b.spans)}</blockquote>`);
        break;
      case "hr":
        body.push("<hr>");
        break;
    }
  }
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${escapeHtml(
    title
  )}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a}code{background:#f2f2f2;padding:0 4px;border-radius:3px}pre code{display:block;padding:12px;overflow-x:auto}blockquote{border-left:4px solid #ccc;margin:0;padding-left:1rem;color:#555}</style>\n</head>\n<body>\n${body.join(
    "\n"
  )}\n</body>\n</html>\n`;
}

export function markdownToPlainText(source: string): string {
  const blocks = parseMarkdown(source);
  const lines: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        lines.push(spansToText(b.spans).toUpperCase());
        lines.push("");
        break;
      case "paragraph":
        lines.push(spansToText(b.spans));
        lines.push("");
        break;
      case "list":
        b.items.forEach((it, idx) => {
          const prefix = b.ordered ? `${idx + 1}. ` : "- ";
          lines.push(prefix + spansToText(it));
        });
        lines.push("");
        break;
      case "code":
        lines.push(...b.text.split("\n"));
        lines.push("");
        break;
      case "quote":
        lines.push("> " + spansToText(b.spans));
        lines.push("");
        break;
      case "hr":
        lines.push("---");
        lines.push("");
        break;
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Block-level structure for the canvas PDF rasterizer. Inline emphasis (bold/italic/links)
 *  is flattened to plain text here - only block structure (headings/lists/code) is preserved
 *  in the rasterized PDF. This is a documented simplification, not a silent failure. */
export function markdownToPdfBlocks(
  source: string
): Array<{ type: "heading1" | "heading2" | "paragraph" | "code" | "bullet"; text: string } | { type: "blank" }> {
  const blocks = parseMarkdown(source);
  const out: Array<{ type: "heading1" | "heading2" | "paragraph" | "code" | "bullet"; text: string } | { type: "blank" }> = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        out.push({ type: b.level === 1 ? "heading1" : "heading2", text: spansToText(b.spans) });
        break;
      case "paragraph":
        out.push({ type: "paragraph", text: spansToText(b.spans) });
        out.push({ type: "blank" });
        break;
      case "list":
        for (const it of b.items) out.push({ type: "bullet", text: spansToText(it) });
        out.push({ type: "blank" });
        break;
      case "code":
        out.push({ type: "code", text: b.text });
        out.push({ type: "blank" });
        break;
      case "quote":
        out.push({ type: "paragraph", text: "\u201C" + spansToText(b.spans) + "\u201D" });
        out.push({ type: "blank" });
        break;
      case "hr":
        out.push({ type: "blank" });
        break;
    }
  }
  return out;
}

/** Browser-only: renders a Markdown document as a real, paginated PDF (headings/lists/code preserved). */
export async function markdownToPdf(source: string): Promise<Uint8Array> {
  const { rasterizeBlocksToPdf } = await import("../pdf/textRasterizer.js");
  return rasterizeBlocksToPdf(markdownToPdfBlocks(source));
}
