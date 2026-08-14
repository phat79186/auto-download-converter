import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { convertAudioVideo } from "../dist/convert/audioVideo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");

function workDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-av-test-"));
  return dir;
}

function copyFixture(name, dir) {
  const dest = path.join(dir, name);
  fs.copyFileSync(path.join(FIXTURES, name), dest);
  return dest;
}

const CASES = [
  { op: "mp3->wav", src: "sample.mp3", outExt: "wav" },
  { op: "wav->mp3", src: "sample.wav", outExt: "mp3" },
  { op: "mp3->ogg", src: "sample.mp3", outExt: "ogg" },
  { op: "wav->ogg", src: "sample.wav", outExt: "ogg" },
  { op: "m4a->mp3", src: "sample.m4a", outExt: "mp3" },
  { op: "flac->mp3", src: "sample.flac", outExt: "mp3" },
  { op: "mp4->mp3", src: "sample.mp4", outExt: "mp3" },
  { op: "mp4->wav", src: "sample.mp4", outExt: "wav" },
  { op: "mp4->webm", src: "sample.mp4", outExt: "webm" },
  { op: "webm->mp4", src: "sample.webm", outExt: "mp4" },
  { op: "mov->mp4", src: "sample.mov", outExt: "mp4" },
  { op: "mkv->mp4", src: "sample.mkv", outExt: "mp4" },
];

for (const { op, src, outExt } of CASES) {
  test(`ffmpeg conversion ${op} produces a real, valid ${outExt} file`, async () => {
    const dir = workDir();
    const input = copyFixture(src, dir);
    const output = path.join(dir, `out.${outExt}`);

    const result = await convertAudioVideo(op, input, output, undefined);

    assert.equal(result.ok, true, `expected success, got error: ${result.error} / ${result.stderrTail}`);
    assert.ok(fs.existsSync(output), "output file should exist");
    assert.ok(fs.statSync(output).size > 0, "output file should be non-empty");
    assert.equal(result.outputPath, output);
    assert.ok(result.outputSizeBytes > 0);
  });
}

test("ffmpeg conversion fails cleanly (not a fake success) on a corrupted input file", async () => {
  const dir = workDir();
  const input = copyFixture("corrupted.mp4", dir);
  const output = path.join(dir, "out.mp3");

  const result = await convertAudioVideo("mp4->mp3", input, output, undefined);

  assert.equal(result.ok, false);
  assert.ok(result.error, "a failed conversion must report an error, never a silent fake success");
  assert.ok(!fs.existsSync(output), "no output file should be left behind on failure");
});

test("ffmpeg conversion rejects an unknown operation instead of running an arbitrary command", async () => {
  const dir = workDir();
  const input = copyFixture("sample.mp3", dir);
  const output = path.join(dir, "out.mp3");

  const result = await convertAudioVideo("mp3->nonexistentformat", input, output, undefined);

  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported audio\/video operation/);
});

test("ffmpeg conversion never leaves a .tmp file behind after success", async () => {
  const dir = workDir();
  const input = copyFixture("sample.mp3", dir);
  const output = path.join(dir, "out.wav");
  await convertAudioVideo("mp3->wav", input, output, undefined);
  assert.ok(!fs.existsSync(`${output}.tmp`));
});
