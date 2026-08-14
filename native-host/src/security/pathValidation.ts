import * as path from "node:path";
import * as fs from "node:fs";

export class PathSecurityError extends Error {}

const WINDOWS_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Remove characters that are invalid in Windows (and generally unsafe) filenames. */
export function sanitizeFilename(raw: string): string {
  if (!raw || typeof raw !== "string") {
    throw new PathSecurityError("Filename must be a non-empty string");
  }

  // Strip path separators entirely - a "filename" must never smuggle a directory change.
  let name = raw.replace(/[\\/]/g, "_");

  // Windows-forbidden characters: < > : " | ? * and control chars 0-31
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[<>:"|?*\x00-\x1f]/g, "_");

  // Trailing dots/spaces are stripped by Windows and can cause confusion.
  name = name.replace(/[. ]+$/g, "");

  // Windows reserved device names (with or without extension) must be avoided.
  const stem = name.split(".")[0]?.toUpperCase();
  if (stem && WINDOWS_RESERVED_NAMES.has(stem)) {
    name = `_${name}`;
  }

  if (name.length === 0) {
    name = "converted_file";
  }

  // Keep total filename length well under filesystem limits (255 bytes on most FS,
  // NTFS component limit 255 UTF-16 code units). We conservatively cap at 200
  // to leave room for suffixes like " (1)" that collision-avoidance may add.
  if (Buffer.byteLength(name, "utf-8") > 200) {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    name = base.slice(0, 200 - ext.length) + ext;
  }

  return name;
}

/**
 * Resolve `candidate` and verify it is a real, existing file located inside one
 * of `allowedRoots`. Used for INPUT files (which must already exist).
 * Follows symlinks via realpath so a symlink cannot be used to escape the root.
 */
export function validateExistingInputPath(candidate: string, allowedRoots: string[]): string {
  const resolved = assertWithinRoots(candidate, allowedRoots);

  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    throw new PathSecurityError(`Input file does not exist: ${redact(candidate)}`);
  }

  // Re-check the *real* (symlink-resolved) path is still inside an allowed root -
  // this stops "innocent-looking path inside Downloads that symlinks to /etc/shadow".
  assertWithinRoots(real, allowedRoots);

  const stat = fs.statSync(real);
  if (!stat.isFile()) {
    throw new PathSecurityError(`Input path is not a regular file: ${redact(candidate)}`);
  }

  return real;
}

/**
 * Resolve and validate an OUTPUT path. The file need not exist yet, but its
 * parent directory must exist, be a real directory, and be inside an allowed
 * root (symlink-resolved).
 */
export function validateOutputPath(candidate: string, allowedRoots: string[]): string {
  const resolved = assertWithinRoots(candidate, allowedRoots);

  const dir = path.dirname(resolved);
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    throw new PathSecurityError(`Output directory does not exist: ${redact(dir)}`);
  }
  assertWithinRoots(realDir, allowedRoots);

  const base = sanitizeFilename(path.basename(resolved));
  return path.join(realDir, base);
}

function assertWithinRoots(candidate: string, allowedRoots: string[]): string {
  if (!candidate || typeof candidate !== "string" || candidate.includes("\0")) {
    throw new PathSecurityError("Invalid path");
  }
  if (!path.isAbsolute(candidate)) {
    throw new PathSecurityError("Path must be absolute");
  }

  const resolved = path.resolve(candidate);

  if (allowedRoots.length === 0) {
    throw new PathSecurityError("No allowed roots configured; refusing all filesystem access");
  }

  const ok = allowedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    const rel = path.relative(resolvedRoot, resolved);
    // rel is within root if it's empty, or doesn't start with ".." and isn't absolute
    // (an absolute `rel` happens on Windows when comparing across drive letters).
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });

  if (!ok) {
    throw new PathSecurityError(`Path is outside all allowed directories: ${redact(candidate)}`);
  }

  return resolved;
}

function redact(p: string): string {
  // Keep only the final segment in error messages/logs so we never leak full
  // local filesystem layout into logs that might be surfaced to the extension UI.
  return path.basename(p);
}
