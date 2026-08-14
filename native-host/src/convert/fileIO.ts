import * as fs from "node:fs";
import { validateExistingInputPath, validateOutputPath, PathSecurityError } from "../security/pathValidation.js";
import { tempSiblingPath } from "../security/tempPath.js";

// Chrome/Edge cap outbound native-messaging messages (host -> extension) at 1MB.
// We chunk base64 payloads comfortably under that to leave room for JSON framing overhead.
const CHUNK_SIZE_BYTES = 700_000;

export interface ReadFileChunk {
  chunkIndex: number;
  totalChunks: number;
  base64Chunk: string;
}

export function readFileForTransfer(path: string, allowedRoots: string[]): { sizeBytes: number; chunks: ReadFileChunk[] } {
  const safePath = validateExistingInputPath(path, allowedRoots);
  const buf = fs.readFileSync(safePath);
  const base64 = buf.toString("base64");

  const chunks: ReadFileChunk[] = [];
  const totalChunks = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE_BYTES));
  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      chunkIndex: i,
      totalChunks,
      base64Chunk: base64.slice(i * CHUNK_SIZE_BYTES, (i + 1) * CHUNK_SIZE_BYTES),
    });
  }
  return { sizeBytes: buf.length, chunks };
}

export function writeFileFromTransfer(path: string, base64Data: string, allowedRoots: string[], overwrite: boolean): { path: string; sizeBytes: number } {
  const safePath = validateOutputPath(path, allowedRoots);
  if (!overwrite && fs.existsSync(safePath)) {
    throw new PathSecurityError(`Refusing to overwrite existing file (overwrite=false): ${safePath.split(/[\\/]/).pop()}`);
  }
  const buf = Buffer.from(base64Data, "base64");
  const tmp = tempSiblingPath(safePath);
  fs.writeFileSync(tmp, buf);
  if (buf.length === 0) {
    fs.unlinkSync(tmp);
    throw new Error("Refusing to write a zero-byte file");
  }
  fs.renameSync(tmp, safePath);
  return { path: safePath, sizeBytes: buf.length };
}

export function deleteFileSecurely(path: string, allowedRoots: string[]): void {
  const safePath = validateExistingInputPath(path, allowedRoots);
  fs.unlinkSync(safePath);
}

export function statFileSecurely(path: string, allowedRoots: string[]): { exists: boolean; sizeBytes?: number } {
  try {
    const safePath = validateExistingInputPath(path, allowedRoots);
    return { exists: true, sizeBytes: fs.statSync(safePath).size };
  } catch {
    return { exists: false };
  }
}
