import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readFileForTransfer, writeFileFromTransfer, deleteFileSecurely, statFileSecurely } from "../dist/convert/fileIO.js";

function workDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adc-fileio-test-"));
}

test("readFileForTransfer reads a small file in a single chunk and matches original bytes", () => {
  const dir = workDir();
  const file = path.join(dir, "a.txt");
  const content = "Hello, this is a real test file.";
  fs.writeFileSync(file, content);

  const { sizeBytes, chunks } = readFileForTransfer(file, [dir]);
  assert.equal(sizeBytes, Buffer.byteLength(content));
  assert.equal(chunks.length, 1);
  const reassembled = Buffer.from(chunks[0].base64Chunk, "base64").toString("utf-8");
  assert.equal(reassembled, content);
});

test("readFileForTransfer chunks a large file and every chunk reassembles to the exact original bytes", () => {
  const dir = workDir();
  const file = path.join(dir, "big.bin");
  // ~2MB of pseudo-random bytes - big enough to require multiple 700KB base64 chunks.
  const original = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < original.length; i++) original[i] = i % 256;
  fs.writeFileSync(file, original);

  const { sizeBytes, chunks } = readFileForTransfer(file, [dir]);
  assert.equal(sizeBytes, original.length);
  assert.ok(chunks.length > 1, "expected the 2MB file to require multiple chunks");

  const base64Full = chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c) => c.base64Chunk)
    .join("");
  const reassembled = Buffer.from(base64Full, "base64");
  assert.ok(reassembled.equals(original), "reassembled bytes must exactly equal the original file");
});

test("writeFileFromTransfer writes real bytes to disk and validates size", () => {
  const dir = workDir();
  const target = path.join(dir, "out.txt");
  const content = Buffer.from("written via native host", "utf-8");
  const { path: writtenPath, sizeBytes } = writeFileFromTransfer(target, content.toString("base64"), [dir], false);
  assert.equal(sizeBytes, content.length);
  assert.equal(fs.readFileSync(writtenPath, "utf-8"), "written via native host");
});

test("writeFileFromTransfer refuses to overwrite an existing file when overwrite=false", () => {
  const dir = workDir();
  const target = path.join(dir, "out.txt");
  fs.writeFileSync(target, "original");
  assert.throws(() => writeFileFromTransfer(target, Buffer.from("new").toString("base64"), [dir], false));
  assert.equal(fs.readFileSync(target, "utf-8"), "original", "original must be untouched");
});

test("writeFileFromTransfer overwrites when overwrite=true", () => {
  const dir = workDir();
  const target = path.join(dir, "out.txt");
  fs.writeFileSync(target, "original");
  writeFileFromTransfer(target, Buffer.from("replaced").toString("base64"), [dir], true);
  assert.equal(fs.readFileSync(target, "utf-8"), "replaced");
});

test("writeFileFromTransfer refuses to write outside allowed roots", () => {
  const dir = workDir();
  const outside = workDir();
  assert.throws(() => writeFileFromTransfer(path.join(outside, "evil.txt"), Buffer.from("x").toString("base64"), [dir], true));
});

test("writeFileFromTransfer rejects an empty payload (no zero-byte fake files)", () => {
  const dir = workDir();
  assert.throws(() => writeFileFromTransfer(path.join(dir, "empty.txt"), "", [dir], true));
});

test("deleteFileSecurely removes a real file within an allowed root", () => {
  const dir = workDir();
  const file = path.join(dir, "todelete.txt");
  fs.writeFileSync(file, "bye");
  deleteFileSecurely(file, [dir]);
  assert.equal(fs.existsSync(file), false);
});

test("deleteFileSecurely refuses to delete a file outside allowed roots", () => {
  const dir = workDir();
  const outside = workDir();
  const file = path.join(outside, "safe.txt");
  fs.writeFileSync(file, "keep me");
  assert.throws(() => deleteFileSecurely(file, [dir]));
  assert.equal(fs.existsSync(file), true);
});

test("statFileSecurely reports existence and size for a real file", () => {
  const dir = workDir();
  const file = path.join(dir, "s.txt");
  fs.writeFileSync(file, "12345");
  const result = statFileSecurely(file, [dir]);
  assert.equal(result.exists, true);
  assert.equal(result.sizeBytes, 5);
});

test("statFileSecurely reports exists:false for a nonexistent file rather than throwing", () => {
  const dir = workDir();
  const result = statFileSecurely(path.join(dir, "nope.txt"), [dir]);
  assert.equal(result.exists, false);
});
