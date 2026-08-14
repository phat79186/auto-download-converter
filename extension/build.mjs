import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "dist");

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

async function bundle(entry, outfile, format) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    format,
    target: "chrome116",
    sourcemap: true,
    logLevel: "info",
  });
}

console.log("Bundling background service worker...");
await bundle(path.join(__dirname, "src/background/index.ts"), path.join(OUT_DIR, "background.js"), "esm");

console.log("Bundling popup...");
await bundle(path.join(__dirname, "src/popup/popup.ts"), path.join(OUT_DIR, "popup.js"), "iife");

console.log("Bundling options...");
await bundle(path.join(__dirname, "src/options/options.ts"), path.join(OUT_DIR, "options.js"), "iife");

console.log("Copying static assets...");
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(OUT_DIR, "manifest.json"));
fs.copyFileSync(path.join(__dirname, "src/popup/popup.html"), path.join(OUT_DIR, "popup.html"));
fs.copyFileSync(path.join(__dirname, "src/popup/popup.css"), path.join(OUT_DIR, "popup.css"));
fs.copyFileSync(path.join(__dirname, "src/options/options.html"), path.join(OUT_DIR, "options.html"));
fs.copyFileSync(path.join(__dirname, "src/options/options.css"), path.join(OUT_DIR, "options.css"));

fs.mkdirSync(path.join(OUT_DIR, "icons"), { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, "icons"))) {
  fs.copyFileSync(path.join(__dirname, "icons", f), path.join(OUT_DIR, "icons", f));
}

console.log(`\nBuild complete: ${OUT_DIR}`);
console.log('Load it in Edge/Chrome via chrome://extensions -> "Load unpacked" -> select the dist/ folder.');
