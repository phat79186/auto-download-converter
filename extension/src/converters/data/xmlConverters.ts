export class InvalidXmlError extends Error {}

export interface XmlElement {
  tag: string;
  attrs: [string, string][];
  children: XmlNode[];
  selfClosing: boolean;
}
export type XmlNode = XmlElement | { text: string } | { comment: string };

/** A small, dependency-free XML tokenizer/parser - not a validating parser, but handles
 *  well-formed XML: elements, attributes, text, comments, CDATA, and the XML declaration. */
export function parseXml(source: string): { declaration: string | null; root: XmlElement } {
  let s = source.trim();
  let declaration: string | null = null;

  const declMatch = /^<\?xml[^?]*\?>/.exec(s);
  if (declMatch) {
    declaration = declMatch[0];
    s = s.slice(declMatch[0].length).trim();
  }

  let pos = 0;

  function skipWhitespace() {
    while (pos < s.length && /\s/.test(s[pos] as string)) pos++;
  }

  function parseComment(): { comment: string } {
    const end = s.indexOf("-->", pos);
    if (end === -1) throw new InvalidXmlError("Unterminated comment");
    const comment = s.slice(pos + 4, end);
    pos = end + 3;
    return { comment };
  }

  function parseCdata(): { text: string } {
    const end = s.indexOf("]]>", pos);
    if (end === -1) throw new InvalidXmlError("Unterminated CDATA section");
    const text = s.slice(pos + 9, end);
    pos = end + 3;
    return { text };
  }

  function parseAttrs(): [string, string][] {
    const attrs: [string, string][] = [];
    for (;;) {
      skipWhitespace();
      if (s[pos] === ">" || s[pos] === "/" || pos >= s.length) break;
      const nameMatch = /^[^\s=/>]+/.exec(s.slice(pos));
      if (!nameMatch) break;
      const name = nameMatch[0];
      pos += name.length;
      skipWhitespace();
      if (s[pos] === "=") {
        pos++;
        skipWhitespace();
        const quote = s[pos];
        if (quote !== '"' && quote !== "'") throw new InvalidXmlError(`Expected quoted attribute value for "${name}"`);
        pos++;
        const end = s.indexOf(quote, pos);
        if (end === -1) throw new InvalidXmlError(`Unterminated attribute value for "${name}"`);
        attrs.push([name, unescapeXml(s.slice(pos, end))]);
        pos = end + 1;
      } else {
        attrs.push([name, ""]);
      }
    }
    return attrs;
  }

  function parseElement(): XmlElement {
    if (s[pos] !== "<") throw new InvalidXmlError(`Expected "<" at position ${pos}`);
    pos++;
    const nameMatch = /^[^\s/>]+/.exec(s.slice(pos));
    if (!nameMatch) throw new InvalidXmlError("Expected element name");
    const tag = nameMatch[0];
    pos += tag.length;
    const attrs = parseAttrs();
    skipWhitespace();

    if (s[pos] === "/" && s[pos + 1] === ">") {
      pos += 2;
      return { tag, attrs, children: [], selfClosing: true };
    }
    if (s[pos] !== ">") throw new InvalidXmlError(`Expected ">" closing start tag <${tag}>`);
    pos++;

    const children: XmlNode[] = [];
    for (;;) {
      if (pos >= s.length) throw new InvalidXmlError(`Unexpected end of input inside <${tag}>`);
      if (s.startsWith("</", pos)) {
        const closeMatch = /^<\/([^\s>]+)\s*>/.exec(s.slice(pos));
        if (!closeMatch) throw new InvalidXmlError("Malformed closing tag");
        if (closeMatch[1] !== tag) {
          throw new InvalidXmlError(`Mismatched closing tag: expected </${tag}>, found </${closeMatch[1]}>`);
        }
        pos += closeMatch[0].length;
        break;
      }
      if (s.startsWith("<!--", pos)) {
        children.push(parseComment());
        continue;
      }
      if (s.startsWith("<![CDATA[", pos)) {
        children.push(parseCdata());
        continue;
      }
      if (s[pos] === "<") {
        children.push(parseElement());
        continue;
      }
      const textEnd = s.indexOf("<", pos);
      const raw = textEnd === -1 ? s.slice(pos) : s.slice(pos, textEnd);
      pos = textEnd === -1 ? s.length : textEnd;
      const trimmed = raw;
      if (trimmed.trim().length > 0) children.push({ text: unescapeXml(trimmed) });
    }

    return { tag, attrs, children, selfClosing: false };
  }

  skipWhitespace();
  const root = parseElement();
  return { declaration, root };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function isTextNode(n: XmlNode): n is { text: string } {
  return "text" in n;
}

export function prettyPrintXml(source: string, indent = "  "): string {
  const { declaration, root } = parseXml(source);
  const lines: string[] = [];
  if (declaration) lines.push(declaration);

  function render(el: XmlElement, depth: number) {
    const pad = indent.repeat(depth);
    const attrStr = el.attrs.map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("");
    if (el.selfClosing || el.children.length === 0) {
      lines.push(`${pad}<${el.tag}${attrStr}/>`);
      return;
    }
    const onlyText = el.children.length === 1 && isTextNode(el.children[0] as XmlNode);
    if (onlyText) {
      lines.push(`${pad}<${el.tag}${attrStr}>${escapeXml((el.children[0] as { text: string }).text)}</${el.tag}>`);
      return;
    }
    lines.push(`${pad}<${el.tag}${attrStr}>`);
    for (const child of el.children) {
      if (isTextNode(child)) {
        if (child.text.trim()) lines.push(`${indent.repeat(depth + 1)}${escapeXml(child.text.trim())}`);
      } else if ("comment" in child) {
        lines.push(`${indent.repeat(depth + 1)}<!--${child.comment}-->`);
      } else {
        render(child, depth + 1);
      }
    }
    lines.push(`${pad}</${el.tag}>`);
  }

  render(root, 0);
  return lines.join("\n") + "\n";
}

export function xmlToText(source: string): string {
  return prettyPrintXml(source);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function xmlToHtml(source: string, title = "XML"): string {
  const pretty = prettyPrintXml(source);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem}
pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:1rem;overflow-x:auto;font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.5}
</style>
</head>
<body>
<pre>${escapeHtml(pretty)}</pre>
</body>
</html>
`;
}

/** Browser-only: pretty-printed XML rendered as a monospace code block PDF (requires OffscreenCanvas). */
export async function xmlToPdf(source: string): Promise<Uint8Array> {
  const { rasterizeBlocksToPdf } = await import("../pdf/textRasterizer.js");
  const pretty = prettyPrintXml(source);
  return rasterizeBlocksToPdf([{ type: "code", text: pretty }]);
}
