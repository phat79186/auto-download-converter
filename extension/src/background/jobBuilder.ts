import type { ConversionRule } from "../rules/types.js";
import { renderFilenameTemplate, sanitizeWindowsFilename, resolveCollision } from "../rules/filenameTemplate.js";
import { extractBaseName } from "./downloadWatcher.js";

function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(0, idx) : ".";
}
function joinPath(dir: string, name: string, sep: string): string {
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export interface BuiltJobPaths {
  skipped: boolean;
  outputDir?: string;
  outputFilename?: string;
  outputPath?: string;
}

/**
 * Computes where the converted file should be written. `exists` is an injected
 * async predicate (backed by the native host's statFile in production) so this
 * stays pure and unit-testable.
 */
export async function buildJobPaths(
  sourcePath: string,
  rule: ConversionRule,
  exists: (path: string) => Promise<boolean>
): Promise<BuiltJobPaths> {
  const sep = sourcePath.includes("\\") ? "\\" : "/";
  const sourceDir = dirname(sourcePath);
  const baseName = extractBaseName(sourcePath);

  let targetDir: string;
  if (rule.outputLocation === "same-folder") {
    targetDir = sourceDir;
  } else if (rule.outputLocation === "dedicated-folder") {
    targetDir = joinPath(sourceDir, rule.dedicatedFolderName || "Converted", sep);
  } else {
    targetDir = joinPath(joinPath(sourceDir, "Converted", sep), rule.targetFormat.toUpperCase(), sep);
  }

  const desiredName = sanitizeWindowsFilename(renderFilenameTemplate(rule.filenameTemplate, { name: baseName, extension: rule.targetFormat }));
  const desiredPath = joinPath(targetDir, desiredName, sep);

  if (rule.overwriteBehavior === "overwrite") {
    return { skipped: false, outputDir: targetDir, outputFilename: desiredName, outputPath: desiredPath };
  }

  if (rule.overwriteBehavior === "skip") {
    if (await exists(desiredPath)) return { skipped: true };
    return { skipped: false, outputDir: targetDir, outputFilename: desiredName, outputPath: desiredPath };
  }

  const finalPath = await resolveCollision(desiredPath, exists);
  const finalName = finalPath.split(/[\\/]/).pop() as string;
  return { skipped: false, outputDir: targetDir, outputFilename: finalName, outputPath: finalPath };
}
