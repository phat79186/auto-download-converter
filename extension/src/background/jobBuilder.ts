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
  /**
   * Path relative to the SOURCE file's own directory (forward-slash separated,
   * e.g. "Converted/PDF/report.pdf"). Used to trigger a real chrome.downloads.download()
   * for browser-native conversions so the result shows up in the browser's Downloads
   * list/shelf. This assumes the source file's directory is the browser's default
   * Downloads directory (true for the common case; if the user saved that particular
   * download to a custom location, the file is still written correctly at outputPath,
   * it just may not additionally register as a new Downloads entry).
   */
  relativeSubpath?: string;
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
  let relativeDir: string; // forward-slash, relative to sourceDir - used for chrome.downloads.download()
  if (rule.outputLocation === "same-folder") {
    targetDir = sourceDir;
    relativeDir = "";
  } else if (rule.outputLocation === "dedicated-folder") {
    const folder = rule.dedicatedFolderName || "Converted";
    targetDir = joinPath(sourceDir, folder, sep);
    relativeDir = folder;
  } else {
    const folder = `Converted/${rule.targetFormat.toUpperCase()}`;
    targetDir = joinPath(joinPath(sourceDir, "Converted", sep), rule.targetFormat.toUpperCase(), sep);
    relativeDir = folder;
  }

  const desiredName = sanitizeWindowsFilename(renderFilenameTemplate(rule.filenameTemplate, { name: baseName, extension: rule.targetFormat }));
  const desiredPath = joinPath(targetDir, desiredName, sep);
  const toRelativeSubpath = (filename: string) => (relativeDir ? `${relativeDir}/${filename}` : filename);

  if (rule.overwriteBehavior === "overwrite") {
    return { skipped: false, outputDir: targetDir, outputFilename: desiredName, outputPath: desiredPath, relativeSubpath: toRelativeSubpath(desiredName) };
  }

  if (rule.overwriteBehavior === "skip") {
    if (await exists(desiredPath)) return { skipped: true };
    return { skipped: false, outputDir: targetDir, outputFilename: desiredName, outputPath: desiredPath, relativeSubpath: toRelativeSubpath(desiredName) };
  }

  const finalPath = await resolveCollision(desiredPath, exists);
  const finalName = finalPath.split(/[\\/]/).pop() as string;
  return { skipped: false, outputDir: targetDir, outputFilename: finalName, outputPath: finalPath, relativeSubpath: toRelativeSubpath(finalName) };
}
