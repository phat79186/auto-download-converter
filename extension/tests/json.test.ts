import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { jsonToText, jsonToHtml, jsonToCsv, InvalidJsonError, parseJsonSafe } from "../src/converters/data/jsonConverters.js";
import { parseCsv } from "../src/converters/data/csv.js";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");
const SAMPLE_JSON = fs.readFileSync(path.join(FIXTURES, "sample.json"), "utf-8");

describe("jsonToText", () => {
  it("pretty-prints valid, re-parseable JSON matching the original data", () => {
    const out = jsonToText(SAMPLE_JSON);
    const reparsed = JSON.parse(out);
    expect(reparsed).toEqual(JSON.parse(SAMPLE_JSON));
    expect(out).toContain("\n  "); // actually indented, not minified
  });

  it("throws InvalidJsonError (not a fake success) on malformed JSON", () => {
    expect(() => jsonToText("{not valid json")).toThrow(InvalidJsonError);
  });
});

describe("jsonToHtml", () => {
  it("renders real nested HTML structure and escapes embedded HTML-like strings", () => {
    const html = jsonToHtml('{"note": "<script>bad()</script>", "n": 5}');
    expect(html).not.toContain("<script>bad()</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('class="jv-num"');
  });
});

describe("jsonToCsv", () => {
  it("flattens the sample.json items array into CSV rows Python's csv module parses back identically", () => {
    const parsed = JSON.parse(SAMPLE_JSON);
    const csv = jsonToCsv(JSON.stringify(parsed.items));
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["name", "age"]);
    expect(rows).toContainEqual(["Alice", "30"]);
    expect(rows).toContainEqual(["Bob", "25"]);
    expect(rows).toContainEqual(["Charlie", "35"]);
  });

  it("handles a single flat object (not wrapped in an array)", () => {
    const csv = jsonToCsv('{"a": 1, "b": "x"}');
    const rows = parseCsv(csv);
    expect(rows).toEqual([["a", "b"], ["1", "x"]]);
  });

  it("JSON-stringifies nested values into their cell rather than silently dropping data", () => {
    const csv = jsonToCsv('[{"id": 1, "meta": {"x": 1}}]');
    const rows = parseCsv(csv);
    expect(rows[1]?.[1]).toContain('"x":1');
  });
});

describe("parseJsonSafe", () => {
  it("parses valid JSON", () => {
    expect(parseJsonSafe("42")).toBe(42);
  });
});
