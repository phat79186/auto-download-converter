/**
 * Resolves which directories the native host is allowed to touch for a given job.
 * We always include the source file's own directory (so "same-folder" output and
 * reading the original both work) plus the Downloads root itself, so dedicated/
 * per-format subfolders under Downloads are covered even if the source lives in
 * a different subfolder than the output.
 */
export function computeAllowedRoots(sourcePath: string, downloadsRoot: string | null): string[] {
  const sep = sourcePath.includes("\\") ? "\\" : "/";
  const idx = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
  const sourceDir = idx >= 0 ? sourcePath.slice(0, idx) : ".";
  const roots = new Set<string>([sourceDir]);
  if (downloadsRoot) roots.add(downloadsRoot);
  void sep;
  return [...roots];
}
