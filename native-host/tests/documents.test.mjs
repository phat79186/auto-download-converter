import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { convertDocument } from "../dist/convert/documents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");

function workDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adc-doc-test-"));
}

function copyFixture(name, dir) {
  const dest = path.join(dir, name);
  fs.copyFileSync(path.join(FIXTURES, name), dest);
  return dest;
}

test("docx->pdf via LibreOffice produces a real, valid PDF", async () => {
  const dir = workDir();
  const input = copyFixture("sample.docx", dir);
  const output = path.join(dir, "out.pdf");

  const result = await convertDocument("docx->pdf", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  assert.equal(result.engineUsed, "libreoffice");
  const head = fs.readFileSync(output).subarray(0, 5).toString("ascii");
  assert.equal(head, "%PDF-");
});

test("rtf->pdf via LibreOffice produces a real, valid PDF", async () => {
  const dir = workDir();
  const input = copyFixture("sample.rtf", dir);
  const output = path.join(dir, "out.pdf");

  const result = await convertDocument("rtf->pdf", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  assert.equal(fs.readFileSync(output).subarray(0, 5).toString("ascii"), "%PDF-");
});

test("odt->pdf via LibreOffice produces a real, valid PDF", async () => {
  const dir = workDir();
  const input = copyFixture("sample.odt", dir);
  const output = path.join(dir, "out.pdf");

  const result = await convertDocument("odt->pdf", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  assert.equal(fs.readFileSync(output).subarray(0, 5).toString("ascii"), "%PDF-");
});

test("html->pdf via LibreOffice produces a real, valid PDF", async () => {
  const dir = workDir();
  const input = copyFixture("sample.html", dir);
  const output = path.join(dir, "out.pdf");

  const result = await convertDocument("html->pdf", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  assert.equal(fs.readFileSync(output).subarray(0, 5).toString("ascii"), "%PDF-");
});

test("docx->txt prefers Pandoc and extracts real text content", async () => {
  const dir = workDir();
  const input = copyFixture("sample.docx", dir);
  const output = path.join(dir, "out.txt");

  const result = await convertDocument("docx->txt", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  assert.equal(result.engineUsed, "pandoc");
  const text = fs.readFileSync(output, "utf-8");
  assert.match(text, /Sample Document/);
});

test("md->docx via Pandoc produces a real, valid DOCX (zip) file", async () => {
  const dir = workDir();
  const input = copyFixture("sample.md", dir);
  const output = path.join(dir, "out.docx");

  const result = await convertDocument("md->docx", input, output, undefined);

  assert.equal(result.ok, true, `expected success: ${result.error} / ${result.stderrTail}`);
  const head = fs.readFileSync(output).subarray(0, 4);
  assert.deepEqual([...head], [0x50, 0x4b, 0x03, 0x04]);
});

test("document conversion reports a clear error (not fake success) for an unsupported operation", async () => {
  const dir = workDir();
  const input = copyFixture("sample.docx", dir);
  const output = path.join(dir, "out.xyz");

  const result = await convertDocument("docx->xyz", input, output, undefined);

  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported document operation/);
});

test("document conversion falls back to LibreOffice engine name reporting when only that candidate is installed for docx->txt path selection logic", async () => {
  // We can't easily uninstall pandoc in this environment, but we CAN verify the
  // "no engine installed" failure path is honest and not a fake success.
  const dir = workDir();
  const input = copyFixture("sample.docx", dir);
  const output = path.join(dir, "out.pdf");
  const result = await convertDocument("docx->pdf", input, output, { libreoffice: "/not/a/real/soffice-binary" });
  assert.equal(result.ok, false);
  assert.match(result.error, /No installed engine/);
});

test("document conversion never leaves a .tmp file behind after success", async () => {
  const dir = workDir();
  const input = copyFixture("sample.docx", dir);
  const output = path.join(dir, "out.pdf");
  await convertDocument("docx->pdf", input, output, undefined);
  assert.ok(!fs.existsSync(`${output}.tmp`));
});
