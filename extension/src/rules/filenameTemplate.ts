export interface TemplateContext {
  /** Original filename, without extension. */
  name: string;
  /** Target extension, without leading dot. */
  extension: string;
  now?: Date;
  counter?: number;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatTime(d: Date): string {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Renders a filename template. Supported variables:
 *   {name} {extension} {date} {time} {datetime} {timestamp} {counter}
 * Unknown {variables} are left as-is (visible, not silently dropped) so a typo
 * in a rule is obvious rather than producing a mysteriously wrong filename.
 */
export function renderFilenameTemplate(template: string, ctx: TemplateContext): string {
  const now = ctx.now ?? new Date();
  const vars: Record<string, string> = {
    name: ctx.name,
    extension: ctx.extension,
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)}_${formatTime(now)}`,
    timestamp: String(Math.floor(now.getTime() / 1000)),
    counter: ctx.counter !== undefined ? String(ctx.counter) : "",
  };

  let result = template.replace(/\{(\w+)\}/g, (full, key: string) => (key in vars ? (vars[key] as string) : full));

  if (!result.toLowerCase().endsWith(`.${ctx.extension.toLowerCase()}`)) {
    result += `.${ctx.extension}`;
  }
  return result;
}

const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Mirrors the native host's sanitizeFilename so browser-side previews match what actually lands on disk. */
export function sanitizeWindowsFilename(raw: string): string {
  let name = raw.replace(/[\\/]/g, "_");
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[<>:"|?*\x00-\x1f]/g, "_");
  name = name.replace(/[. ]+$/g, "");
  const stem = name.split(".")[0]?.toUpperCase();
  if (stem && WINDOWS_RESERVED.has(stem)) name = `_${name}`;
  if (name.length === 0) name = "converted_file";
  if (new TextEncoder().encode(name).length > 200) {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot) : "";
    const base = dot >= 0 ? name.slice(0, dot) : name;
    name = base.slice(0, 200 - ext.length) + ext;
  }
  return name;
}

/**
 * Resolves filename collisions by appending " (1)", " (2)", etc. `exists` is an
 * injected async predicate so this stays pure/testable and works with whatever
 * "does this file exist" backend is available (native host fs check, or
 * chrome.downloads.search as a fallback).
 */
export async function resolveCollision(
  desiredFilename: string,
  exists: (filename: string) => Promise<boolean>,
  maxAttempts = 1000
): Promise<string> {
  if (!(await exists(desiredFilename))) return desiredFilename;

  const dot = desiredFilename.lastIndexOf(".");
  const base = dot >= 0 ? desiredFilename.slice(0, dot) : desiredFilename;
  const ext = dot >= 0 ? desiredFilename.slice(dot) : "";

  for (let n = 1; n <= maxAttempts; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not find a non-colliding filename after ${maxAttempts} attempts for "${desiredFilename}"`);
}
