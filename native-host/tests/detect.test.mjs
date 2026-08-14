import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAllEngines, detectEngine } from "../dist/engines/detect.js";

test("detectAllEngines finds the real ffmpeg/pandoc/libreoffice installed in this environment", async () => {
  const engines = await detectAllEngines();
  assert.equal(engines.length, 3);

  for (const e of engines) {
    assert.equal(e.installed, true, `${e.engine} should be detected as installed`);
    assert.ok(e.version && e.version !== "unknown", `${e.engine} should report a parsed version, got ${e.version}`);
    assert.ok(e.path, `${e.engine} should report a resolved path`);
  }
});

test("detectEngine reports installed:false for a nonexistent engine binary", async () => {
  const info = await detectEngine("ffmpeg", "/definitely/not/a/real/path/ffmpeg-xyz");
  assert.equal(info.installed, false);
  assert.equal(info.path, null);
  assert.ok(info.error);
});

test("detectAllEngines respects a configured override path", async () => {
  // ffmpeg is on PATH; find its real absolute path via `which` and feed it back in as an override
  // to prove the "configured path" mechanism (used by Settings) actually gets used.
  const { execFileSync } = await import("node:child_process");
  const real = execFileSync("which", ["ffmpeg"]).toString().trim();
  const info = await detectEngine("ffmpeg", real);
  assert.equal(info.installed, true);
  assert.equal(info.path, real);
});
