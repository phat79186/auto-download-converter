/** RFC 4180-compliant CSV parser: handles quoted fields, embedded commas/newlines, and "" escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // last field/row (if the file doesn't end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop a single trailing wholly-empty row (common artifact of a trailing newline).
  if (rows.length && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === "") {
    rows.pop();
  }

  return rows;
}

function needsQuoting(field: string): boolean {
  return /[",\n]/.test(field);
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((f) => (needsQuoting(f) ? `"${f.replace(/"/g, '""')}"` : f))
        .join(",")
    )
    .join("\r\n");
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsvWithHeader(text: string): ParsedCsv {
  const all = parseCsv(text);
  const headers = all[0] ?? [];
  return { headers, rows: all.slice(1) };
}
