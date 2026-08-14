import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { textToHtml, textToMarkdown, htmlToText } from "../src/converters/text/plainText.js";
import { parseMarkdown } from "../src/converters/text/markdown.js";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");
const SAMPLE_TXT = fs.readFileSync(path.join(FIXTURES, "sample.txt"), "utf-8");
const SAMPLE_HTML = fs.readFileSync(path.join(FIXTURES, "sample.html"), "utf-8");

describe("textToHtml", () => {
  it("produces valid HTML with the original text content escaped and preserved", () => {
    const html = textToHtml("line one\nline two & <tag>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("line one\nline two &amp; &lt;tag&gt;");
  });
});

describe("textToMarkdown", () => {
  it("escapes markdown-significant characters so plain text renders literally", () => {
    const md = textToMarkdown("* not a bullet\n# not a heading\nplain line");
    const blocks = parseMarkdown(md);
    // After round-tripping through the markdown parser, the escaped chars should
    // appear as literal characters, not be interpreted as list/heading syntax.
    expect(blocks.some((b) => b.type === "heading")).toBe(false);
    expect(blocks.every((b) => b.type !== "list")).toBe(true);
  });

  it("preserves the real sample.txt content", () => {
    const md = textToMarkdown(SAMPLE_TXT);
    expect(md.replace(/\\/g, "")).toContain("Auto Download Converter");
  });
});

describe("htmlToText", () => {
  it("extracts real readable text from the sample.html fixture", () => {
    const text = htmlToText(SAMPLE_HTML);
    expect(text).toContain("Sample HTML");
    expect(text).toContain("bold");
    expect(text).toContain("- one");
    expect(text).not.toContain("<h1>");
    expect(text).not.toContain("<body>");
  });

  it("strips <script> and <style> content entirely rather than dumping raw JS/CSS as text", () => {
    const text = htmlToText("<html><head><style>.x{color:red}</style></head><body><script>alert(1)</script>Hello</body></html>");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("alert(1)");
    expect(text).toContain("Hello");
  });
});
