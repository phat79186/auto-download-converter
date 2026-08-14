import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/** LibreOffice `--convert-to` filter string and the file extension it produces. */
const TARGET_FILTERS: Record<string, { filter: string; ext: string }> = {
  pdf: { filter: "pdf", ext: "pdf" },
  txt: { filter: "txt:Text", ext: "txt" },
  html: { filter: "html", ext: "html" },
};

export type LibreOfficeTarget = keyof typeof TARGET_FILTERS;

export interface LibreOfficeRunResult {
  ok: boolean;
  producedPath?: string;
  stderrTail: string;
}

/**
 * Runs `soffice --headless --convert-to <format> --outdir <dir> <input>` in an
 * isolated user profile (so concurrent conversions don't fight over LibreOffice's
 * profile lock) and returns the path LibreOffice wrote its output to.
 */
export async function runLibreOfficeConvert(
  sofficePath: string,
  inputPath: string,
  outDir: string,
  target: LibreOfficeTarget,
  timeoutMs: number
): Promise<LibreOfficeRunResult> {
  const spec = TARGET_FILTERS[target];
  if (!spec) throw new Error(`Unsupported LibreOffice target format: ${target}`);

  const profileDir = path.join(os.tmpdir(), `adc-soffice-${randomUUID()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const profileUri = process.platform === "win32"
    ? `file:///${profileDir.replace(/\\/g, "/")}`
    : `file://${profileDir}`;

  const args = [
    "--headless",
    "--invisible",
    "--norestore",
    "--nolockcheck",
    `-env:UserInstallation=${profileUri}`,
    "--convert-to",
    spec.filter,
    "--outdir",
    outDir,
    inputPath,
  ];

  const stderrTail = await new Promise<string>((resolve) => {
    let buf = "";
    const child = execFile(sofficePath, args, { timeout: timeoutMs, windowsHide: true }, () => {
      resolve(buf.slice(-4000));
    });
    child.stderr?.on("data", (d) => (buf += d.toString()));
    child.stdout?.on("data", (d) => (buf += d.toString()));
  });

  // Best-effort cleanup of the temp profile; failure here shouldn't fail the conversion.
  fs.rm(profileDir, { recursive: true, force: true }, () => {});

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const producedPath = path.join(outDir, `${baseName}.${spec.ext}`);

  if (!fs.existsSync(producedPath)) {
    return { ok: false, stderrTail };
  }
  const stat = fs.statSync(producedPath);
  if (stat.size === 0) {
    return { ok: false, stderrTail: stderrTail || "LibreOffice produced a zero-byte file" };
  }

  return { ok: true, producedPath, stderrTail };
}
