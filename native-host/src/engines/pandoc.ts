import { execFile } from "node:child_process";
import * as fs from "node:fs";

export interface PandocRunResult {
  ok: boolean;
  stderrTail: string;
}

/**
 * Runs `pandoc -f <from> -t <to> -o <outputPath> <inputPath>`.
 * `fromFormat`/`toFormat` must come from our own DOCUMENT_OPERATIONS table -
 * never passed through from the extension as free text.
 */
export async function runPandocConvert(
  pandocPath: string,
  inputPath: string,
  outputPath: string,
  fromFormat: string,
  toFormat: string,
  timeoutMs: number
): Promise<PandocRunResult> {
  const args = ["-f", fromFormat, "-t", toFormat, "-o", outputPath, "--", inputPath];

  const stderrTail = await new Promise<string>((resolve) => {
    let buf = "";
    const child = execFile(pandocPath, args, { timeout: timeoutMs, windowsHide: true }, () => resolve(buf.slice(-4000)));
    child.stderr?.on("data", (d) => (buf += d.toString()));
  });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    return { ok: false, stderrTail: stderrTail || "Pandoc produced no output" };
  }
  return { ok: true, stderrTail };
}
