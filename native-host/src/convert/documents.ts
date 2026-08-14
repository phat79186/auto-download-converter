import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DOCUMENT_OPERATIONS } from "../security/documentOperations.js";
import { runLibreOfficeConvert } from "../engines/libreoffice.js";
import { runPandocConvert } from "../engines/pandoc.js";
import { detectEngine } from "../engines/detect.js";
import { assertPdfSignature, assertZipSignature, assertNonEmptyText, OutputValidationError } from "../security/outputValidation.js";
import { tempSiblingPath } from "../security/tempPath.js";
import type { EngineName } from "../types.js";

export interface DocumentConvertResult {
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  error?: string;
  stderrTail?: string;
  engineUsed?: EngineName;
}

function validateByExtension(filePath: string, ext: string): void {
  const e = ext.toLowerCase();
  if (e === "pdf") return assertPdfSignature(filePath);
  if (e === "docx" || e === "odt") return assertZipSignature(filePath);
  if (e === "txt" || e === "html" || e === "htm") return assertNonEmptyText(filePath);
  // Unknown extension: fall back to a basic non-empty check.
  assertNonEmptyText(filePath);
}

export async function convertDocument(
  operation: string,
  inputPath: string,
  outputPath: string,
  configuredPaths: Partial<Record<EngineName, string>> | undefined,
  timeoutMs = 120_000
): Promise<DocumentConvertResult> {
  const spec = DOCUMENT_OPERATIONS[operation];
  if (!spec) {
    return { ok: false, error: `Unsupported document operation: ${operation}` };
  }

  const outExt = path.extname(outputPath).replace(/^\./, "");
  const tmpOutputPath = tempSiblingPath(outputPath);

  for (const candidate of spec.candidates) {
    const info = await detectEngine(candidate.engine, configuredPaths?.[candidate.engine]);
    if (!info.installed || !info.path) continue;

    try {
      if (candidate.engine === "libreoffice") {
        const tempOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-lo-"));
        try {
          const result = await runLibreOfficeConvert(info.path, inputPath, tempOutDir, candidate.targetFormat, timeoutMs);
          if (!result.ok || !result.producedPath) {
            return { ok: false, error: "LibreOffice did not produce an output file", stderrTail: result.stderrTail, engineUsed: "libreoffice" };
          }
          fs.copyFileSync(result.producedPath, tmpOutputPath);
        } finally {
          fs.rm(tempOutDir, { recursive: true, force: true }, () => {});
        }
      } else {
        const result = await runPandocConvert(info.path, inputPath, tmpOutputPath, candidate.fromFormat, candidate.toFormat, timeoutMs);
        if (!result.ok) {
          return { ok: false, error: "Pandoc did not produce an output file", stderrTail: result.stderrTail, engineUsed: "pandoc" };
        }
      }

      validateByExtension(tmpOutputPath, outExt);
      fs.renameSync(tmpOutputPath, outputPath);
      const size = fs.statSync(outputPath).size;
      return { ok: true, outputPath, outputSizeBytes: size, engineUsed: candidate.engine };
    } catch (err) {
      cleanupTmp(tmpOutputPath);
      const message = err instanceof OutputValidationError
        ? `Conversion ran but produced an invalid file: ${err.message}`
        : (err as Error).message;
      return { ok: false, error: message, engineUsed: candidate.engine };
    }
  }

  return {
    ok: false,
    error: `No installed engine can perform "${operation}". Requires one of: ${spec.candidates.map((c) => c.engine).join(", ")}.`,
  };
}

function cleanupTmp(tmpPath: string) {
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch {
    /* best effort */
  }
}
