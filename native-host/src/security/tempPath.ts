import * as path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Returns a temporary path in the SAME directory as `finalPath`, keeping the
 * real file extension at the end (e.g. "video.mp4" -> ".~tmp-a1b2c3-video.mp4").
 *
 * This matters for two reasons:
 *  1. FFmpeg infers the output container/muxer from the filename extension, so a
 *     naive `${finalPath}.tmp` suffix (e.g. "video.mp4.tmp") breaks format detection.
 *  2. Keeping the temp file in the same directory (rather than a system temp dir)
 *     guarantees the final `fs.renameSync` is an atomic same-filesystem rename.
 */
export function tempSiblingPath(finalPath: string): string {
  const dir = path.dirname(finalPath);
  const base = path.basename(finalPath);
  const rand = randomBytes(4).toString("hex");
  return path.join(dir, `.~tmp-${rand}-${base}`);
}
