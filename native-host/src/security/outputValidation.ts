import * as fs from "node:fs";

export class OutputValidationError extends Error {}

function readHead(filePath: string, bytes: number): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Every conversion must pass this before we consider it successful, regardless of exit code. */
export function assertExistsAndNonEmpty(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    throw new OutputValidationError("Output file was not created");
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new OutputValidationError("Output path is not a regular file");
  }
  if (stat.size === 0) {
    throw new OutputValidationError("Output file is zero bytes");
  }
  return stat.size;
}

export function assertPdfSignature(filePath: string): void {
  assertExistsAndNonEmpty(filePath);
  const head = readHead(filePath, 5);
  if (head.toString("ascii") !== "%PDF-") {
    throw new OutputValidationError("Output does not start with a valid PDF signature (%PDF-)");
  }
  // A minimally sane PDF must also end with %%EOF near the tail.
  const size = fs.statSync(filePath).size;
  const tailLen = Math.min(1024, size);
  const fd = fs.openSync(filePath, "r");
  const tailBuf = Buffer.alloc(tailLen);
  fs.readSync(fd, tailBuf, 0, tailLen, size - tailLen);
  fs.closeSync(fd);
  if (!tailBuf.toString("latin1").includes("%%EOF")) {
    throw new OutputValidationError("PDF output is missing its end-of-file marker (truncated?)");
  }
}

/** ZIP-container formats: DOCX, XLSX, ODT all begin with the local-file-header magic "PK\\x03\\x04". */
export function assertZipSignature(filePath: string): void {
  assertExistsAndNonEmpty(filePath);
  const head = readHead(filePath, 4);
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
    throw new OutputValidationError("Output is not a valid ZIP-based document (missing PK signature)");
  }
}

export function assertNonEmptyText(filePath: string): void {
  const size = assertExistsAndNonEmpty(filePath);
  const head = readHead(filePath, Math.min(size, 4096));
  // Reject files that are almost entirely NUL bytes or otherwise clearly not text.
  const nulRatio = head.filter((b) => b === 0).length / head.length;
  if (nulRatio > 0.1) {
    throw new OutputValidationError("Output does not look like a text file (too many NUL bytes)");
  }
}

const IMAGE_SIGNATURES: Array<{ ext: string; magic: number[]; offset?: number }> = [
  { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; WEBP marker follows at offset 8
  { ext: "bmp", magic: [0x42, 0x4d] },
  { ext: "gif", magic: [0x47, 0x49, 0x46, 0x38] },
];

export function assertImageSignature(filePath: string, expectedExt: string): void {
  assertExistsAndNonEmpty(filePath);
  const sig = IMAGE_SIGNATURES.find((s) => s.ext === expectedExt.toLowerCase());
  if (!sig) return; // unknown ext - nothing more we can check
  const head = readHead(filePath, 16);
  const matches = sig.magic.every((byte, idx) => head[idx] === byte);
  if (!matches) {
    throw new OutputValidationError(`Output does not have a valid ${expectedExt.toUpperCase()} signature`);
  }
  if (sig.ext === "webp" && head.toString("ascii", 8, 12) !== "WEBP") {
    throw new OutputValidationError("Output RIFF container is not a WEBP file");
  }
}
