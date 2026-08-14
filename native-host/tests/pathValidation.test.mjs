import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  validateExistingInputPath,
  validateOutputPath,
  sanitizeFilename,
  PathSecurityError,
} from "../dist/security/pathValidation.js";

function mkTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adc-test-"));
}

test("validateExistingInputPath accepts a real file inside an allowed root", () => {
  const root = mkTmpRoot();
  const file = path.join(root, "a.txt");
  fs.writeFileSync(file, "hi");
  const result = validateExistingInputPath(file, [root]);
  assert.equal(fs.realpathSync(file), result);
});

test("validateExistingInputPath rejects files outside every allowed root", () => {
  const root = mkTmpRoot();
  const outside = mkTmpRoot();
  const file = path.join(outside, "secret.txt");
  fs.writeFileSync(file, "top secret");
  assert.throws(() => validateExistingInputPath(file, [root]), PathSecurityError);
});

test("validateExistingInputPath rejects classic ../ traversal even when the literal string starts inside the root", () => {
  const root = mkTmpRoot();
  const outside = mkTmpRoot();
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret");
  const traversal = path.join(root, "..", path.basename(outside), "secret.txt");
  assert.throws(() => validateExistingInputPath(traversal, [root]), PathSecurityError);
});

test("validateExistingInputPath rejects a symlink that escapes the allowed root", () => {
  const root = mkTmpRoot();
  const outside = mkTmpRoot();
  const secret = path.join(outside, "secret.txt");
  fs.writeFileSync(secret, "top secret");
  const link = path.join(root, "innocent-looking.txt");
  fs.symlinkSync(secret, link);
  assert.throws(() => validateExistingInputPath(link, [root]), PathSecurityError);
});

test("validateExistingInputPath rejects relative paths", () => {
  const root = mkTmpRoot();
  assert.throws(() => validateExistingInputPath("relative/file.txt", [root]), PathSecurityError);
});

test("validateExistingInputPath rejects a directory given as input", () => {
  const root = mkTmpRoot();
  const dir = path.join(root, "subdir");
  fs.mkdirSync(dir);
  assert.throws(() => validateExistingInputPath(dir, [root]), PathSecurityError);
});

test("validateOutputPath accepts a path in an allowed, existing directory", () => {
  const root = mkTmpRoot();
  const out = validateOutputPath(path.join(root, "result.pdf"), [root]);
  assert.equal(path.dirname(out), fs.realpathSync(root));
  assert.equal(path.basename(out), "result.pdf");
});

test("validateOutputPath rejects an output directory outside allowed roots", () => {
  const root = mkTmpRoot();
  const outside = mkTmpRoot();
  assert.throws(() => validateOutputPath(path.join(outside, "result.pdf"), [root]), PathSecurityError);
});

test("validateOutputPath rejects a filename component that starts with '..' even though POSIX wouldn't treat it as traversal (fail closed, don't try to be clever)", () => {
  const root = mkTmpRoot();
  assert.throws(() => validateOutputPath(path.join(root, "..\\..\\evil<>.pdf"), [root]), PathSecurityError);
});

test("validateOutputPath sanitizes illegal characters in an otherwise-safe filename", () => {
  const root = mkTmpRoot();
  const out = validateOutputPath(path.join(root, 'evil<>:"|?*name.pdf'), [root]);
  assert.ok(out.startsWith(fs.realpathSync(root)));
  assert.doesNotMatch(path.basename(out), /[<>:"|?*]/);
});

test("sanitizeFilename strips characters invalid on Windows", () => {
  const cleaned = sanitizeFilename('bad:name*with?"illegal|chars.txt');
  assert.doesNotMatch(cleaned, /[:*?"|]/);
});

test("sanitizeFilename neutralizes Windows reserved device names", () => {
  const cleaned = sanitizeFilename("CON.txt");
  assert.notEqual(cleaned.toUpperCase(), "CON.TXT");
});

test("sanitizeFilename strips path separators so a 'filename' cannot change directory", () => {
  const cleaned = sanitizeFilename("../../etc/passwd");
  assert.ok(!cleaned.includes("/"));
});

test("validateExistingInputPath rejects an empty allowedRoots list (fail closed)", () => {
  const root = mkTmpRoot();
  const file = path.join(root, "a.txt");
  fs.writeFileSync(file, "hi");
  assert.throws(() => validateExistingInputPath(file, []), PathSecurityError);
});
