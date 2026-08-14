import * as XLSX from "xlsx";
import { parseCsvWithHeader } from "./csv.js";
import { rasterizeTableToPdf } from "../pdf/textRasterizer.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function csvToHtml(csvText: string, title = "Data"): string {
  const { headers, rows } = parseCsvWithHeader(csvText);
  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
th{background:#f2f2f2}
tr:nth-child(even){background:#fafafa}
</style>
</head>
<body>
<table>
<thead>${thead}</thead>
<tbody>${tbody}</tbody>
</table>
</body>
</html>
`;
}

/** Real .xlsx workbook via SheetJS (the community/js-xlsx library), not a renamed CSV. */
export function csvToXlsx(csvText: string): Uint8Array {
  const { headers, rows } = parseCsvWithHeader(csvText);
  const aoa = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out as ArrayBuffer);
}

/** Browser-only: rasterizes the CSV as a real ruled table PDF (requires OffscreenCanvas). */
export async function csvToPdf(csvText: string): Promise<Uint8Array> {
  const { headers, rows } = parseCsvWithHeader(csvText);
  return rasterizeTableToPdf(headers, rows);
}
