import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline, markdownToHtml, markdownToPlainText, markdownToPdfBlocks } from "../src/converters/text/markdown.js";

const SAMPLE = `# Sample Document

This is a **bold** statement and this is *italic*.

## Section

- item one
- item two
- item three

Here is a [link](https://example.com) and some \`inline code\`.

\`\`\`
a code block
with two lines
\`\`\`
`;

describe("parseInline", () => {
  it("parses bold, italic, code and links correctly", () => {
    const spans = parseInline("hello **bold** and *italic* and `code` and [link](https://x.com)");
    expect(spans.some((s) => s.text === "bold" && s.bold)).toBe(true);
    expect(spans.some((s) => s.text === "italic" && s.italic)).toBe(true);
    expect(spans.some((s) => s.text === "code" && s.code)).toBe(true);
    expect(spans.some((s) => s.text === "link" && s.link === "https://x.com")).toBe(true);
  });
});

describe("parseMarkdown", () => {
  it("parses the sample document into the expected block structure", () => {
    const blocks = parseMarkdown(SAMPLE);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks.some((b) => b.type === "list" && b.items.length === 3)).toBe(true);
    expect(blocks.some((b) => b.type === "code" && b.text.includes("with two lines"))).toBe(true);
  });
});

describe("markdownToHtml", () => {
  it("produces real, well-formed HTML with escaped content and correct tags", () => {
    const html = markdownToHtml("# Title\n\nA <script>alert(1)</script> paragraph.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).not.toContain("<script>alert(1)</script>"); // must be escaped, not injected raw
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("renders lists as real <ul>/<li> elements", () => {
    const html = markdownToHtml("- a\n- b\n- c");
    expect(html).toMatch(/<ul><li>a<\/li><li>b<\/li><li>c<\/li><\/ul>/);
  });
});

describe("markdownToPlainText", () => {
  it("strips markdown syntax but keeps the content", () => {
    const text = markdownToPlainText(SAMPLE);
    expect(text).not.toContain("**");
    expect(text).not.toContain("##");
    expect(text).toContain("bold");
    expect(text).toContain("item one");
  });
});

describe("markdownToPdfBlocks", () => {
  it("maps headings/lists/code to block types the rasterizer understands", () => {
    const blocks = markdownToPdfBlocks(SAMPLE);
    expect(blocks.some((b) => "type" in b && b.type === "heading1" && "text" in b && b.text === "Sample Document")).toBe(true);
    expect(blocks.filter((b) => "type" in b && b.type === "bullet").length).toBe(3);
    expect(blocks.some((b) => "type" in b && b.type === "code")).toBe(true);
  });
});
