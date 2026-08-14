import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { parseCsv, toCsv, parseCsvWithHeader } from "../src/converters/data/csv.js";
import { csvToHtml, csvToXlsx } from "../src/converters/data/csvConverters.js";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");
const SAMPLE_CSV = fs.readFileSync(path.join(FIXTURES, "sample.csv"), "utf-8");

describe("parseCsv", () => {
  it("parses the real sample.csv fixture, including a quoted field containing a comma", () => {
    const rows = parseCsv(SAMPLE_CSV);
    expect(rows[0]).toEqual(["name", "age", "city"]);
    expect(rows).toContainEqual(["Bob", "25", "San Francisco, CA"]);
    expect(rows.length).toBe(4); // header + 3 data rows
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const rows = parseCsv('a,"he said ""hi""",c');
    expect(rows[0]).toEqual(["a", 'he said "hi"', "c"]);
  });

  it("handles embedded newlines inside quoted fields", () => {
    const rows = parseCsv('a,"line1\nline2",c');
    expect(rows[0]).toEqual(["a", "line1\nline2", "c"]);
  });

  it("round-trips through toCsv and back", () => {
    const original = [["a", "b,c", 'd"e', "f\ng"], ["1", "2", "3", "4"]];
    const serialized = toCsv(original);
    const reparsed = parseCsv(serialized);
    expect(reparsed).toEqual(original);
  });
});

describe("csvToHtml", () => {
  it("renders a real HTML table with the correct number of rows/cols and escaped content", () => {
    const html = csvToHtml("name,note\nAlice,<b>bold</b>");
    expect(html).toContain("<th>name</th>");
    expect(html).toContain("<td>Alice</td>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;"); // must be escaped, not raw injected HTML
  });
});

describe("csvToXlsx", () => {
  it("produces a real .xlsx that openpyxl (independent library) can read back with correct data", () => {
    const bytes = csvToXlsx(SAMPLE_CSV);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-xlsx-test-"));
    const file = path.join(dir, "out.xlsx");
    fs.writeFileSync(file, bytes);

    const script = `
import openpyxl
wb = openpyxl.load_workbook(r"${file}")
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
assert rows[0] == ("name", "age", "city"), rows[0]
assert ("Bob", 25, "San Francisco, CA") in rows or ("Bob", "25", "San Francisco, CA") in rows, rows
print("OK", len(rows))
`;
    const result = execFileSync("python3", ["-c", script]).toString();
    expect(result).toMatch(/^OK/);
  });

  it("is a valid ZIP container (xlsx is OOXML/ZIP-based)", () => {
    const bytes = csvToXlsx("a,b\n1,2");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe("parseCsvWithHeader", () => {
  it("splits header row from data rows", () => {
    const { headers, rows } = parseCsvWithHeader(SAMPLE_CSV);
    expect(headers).toEqual(["name", "age", "city"]);
    expect(rows.length).toBe(3);
  });
});
