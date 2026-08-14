import { toCsv } from "./csv.js";
import { rasterizeBlocksToPdf, type TextBlock } from "../pdf/textRasterizer.js";

export class InvalidJsonError extends Error {}

export function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new InvalidJsonError(`Input is not valid JSON: ${(err as Error).message}`);
  }
}

export function jsonToText(text: string): string {
  const value = parseJsonSafe(text);
  return JSON.stringify(value, null, 2) + "\n";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderJsonNode(value: unknown): string {
  if (value === null) return `<span class="jv-null">null</span>`;
  if (typeof value === "boolean") return `<span class="jv-bool">${value}</span>`;
  if (typeof value === "number") return `<span class="jv-num">${value}</span>`;
  if (typeof value === "string") return `<span class="jv-str">"${escapeHtml(value)}"</span>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `<li>${renderJsonNode(v)}</li>`).join("");
    return `<ul class="jv-array">${items}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const items = entries
      .map(([k, v]) => `<li><span class="jv-key">${escapeHtml(k)}</span>: ${renderJsonNode(v)}</li>`)
      .join("");
    return `<ul class="jv-object">${items}</ul>`;
  }
  return escapeHtml(String(value));
}

export function jsonToHtml(text: string, title = "JSON"): string {
  const value = parseJsonSafe(text);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:ui-monospace,Consolas,monospace;margin:2rem;font-size:14px}
ul{list-style:none;margin:0;padding-left:1.25rem;border-left:1px dotted #ccc}
.jv-key{color:#0b5fa5;font-weight:600}
.jv-str{color:#1a7f37}
.jv-num{color:#8250df}
.jv-bool{color:#cf222e}
.jv-null{color:#6e7781;font-style:italic}
</style>
</head>
<body>
${renderJsonNode(value)}
</body>
</html>
`;
}

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Flattens JSON into CSV. Supports:
 *  - an array of flat(ish) objects -> one row per object, columns = union of keys
 *  - a single object -> one row
 * Nested objects/arrays within a row are JSON-stringified into their cell (documented,
 * not a silent data loss - the data is preserved, just not exploded into more columns).
 */
export function jsonToCsv(text: string): string {
  const value = parseJsonSafe(text);
  const records: Record<string, unknown>[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v }))
    : [typeof value === "object" && value !== null ? (value as Record<string, unknown>) : { value }];

  const columns: string[] = [];
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const rows = records.map((rec) => columns.map((c) => flattenValue(rec[c])));
  return toCsv([columns, ...rows]);
}

/** Browser-only: pretty-printed JSON rendered as a monospace code block PDF (requires OffscreenCanvas). */
export async function jsonToPdf(text: string): Promise<Uint8Array> {
  const pretty = jsonToText(text);
  const blocks: TextBlock[] = [{ type: "code", text: pretty }];
  return rasterizeBlocksToPdf(blocks);
}
