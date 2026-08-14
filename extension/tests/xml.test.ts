import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { parseXml, prettyPrintXml, xmlToHtml, xmlToText, InvalidXmlError } from "../src/converters/data/xmlConverters.js";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");
const SAMPLE_XML = fs.readFileSync(path.join(FIXTURES, "sample.xml"), "utf-8");

describe("parseXml", () => {
  it("parses the real sample.xml fixture into the expected element tree", () => {
    const { root } = parseXml(SAMPLE_XML);
    expect(root.tag).toBe("catalog");
    const books = root.children.filter((c) => "tag" in c);
    expect(books.length).toBe(2);
  });

  it("throws InvalidXmlError on mismatched tags instead of silently producing garbage", () => {
    expect(() => parseXml("<a><b></a></b>")).toThrow(InvalidXmlError);
  });

  it("parses attributes correctly", () => {
    const { root } = parseXml('<root a="1" b="two words"><child/></root>');
    expect(root.attrs).toEqual([["a", "1"], ["b", "two words"]]);
  });
});

describe("prettyPrintXml", () => {
  it("produces output that is itself valid XML per Python's xml.etree (independent parser)", () => {
    const pretty = prettyPrintXml(SAMPLE_XML);
    const dir = fs.mkdtempSync(fs.mkdtempSync.length ? "/tmp/adc-xml-XXXXXX".replace("XXXXXX", "") : "/tmp");
    const file = path.join("/tmp", `adc-pretty-${Date.now()}.xml`);
    fs.writeFileSync(file, pretty);
    const script = `
import xml.etree.ElementTree as ET
tree = ET.parse(r"${file}")
root = tree.getroot()
assert root.tag == "catalog"
titles = [b.find("title").text for b in root.findall("book")]
assert "Sample Book" in titles, titles
assert "Another Book" in titles, titles
print("OK")
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result).toMatch(/^OK/);
  });

  it("re-indents already-compact XML into a readable multi-line form", () => {
    const pretty = prettyPrintXml("<a><b>1</b><c>2</c></a>");
    expect(pretty.split("\n").length).toBeGreaterThan(2);
  });
});

describe("xmlToText / xmlToHtml", () => {
  it("xmlToText returns pretty-printed XML", () => {
    expect(xmlToText(SAMPLE_XML)).toContain("<title>Sample Book</title>");
  });

  it("xmlToHtml escapes content and wraps it in a real HTML document", () => {
    const html = xmlToHtml("<a>1 &lt; 2</a>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("&amp;lt;");
  });
});
