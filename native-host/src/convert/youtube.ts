import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { get } from "node:https";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { detectEngine } from "../engines/detect.js";
import { validateOutputPath } from "../security/pathValidation.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The install directory is the parent of the dist folder
// (e.g. C:\Users\User\AppData\Local\AutoDownloadConverterHost)
const installDir = path.resolve(__dirname, "..", "..");

function log(...args: unknown[]): void {
  console.error("[auto-download-converter-host] [youtube]", ...args);
}

/**
 * Downloads yt-dlp binary from GitHub releases if it doesn't already exist.
 */
export function ensureYtdlp(): Promise<string> {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "yt-dlp.exe" : "yt-dlp";
  const ytdlpPath = path.join(installDir, binaryName);

  if (fs.existsSync(ytdlpPath)) {
    return Promise.resolve(ytdlpPath);
  }

  return new Promise((resolve, reject) => {
    log("yt-dlp binary not found. Downloading latest version...");
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${binaryName}`;

    function download(downloadUrl: string) {
      get(downloadUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          download(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download yt-dlp: HTTP ${res.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(ytdlpPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          if (!isWin) {
            fs.chmodSync(ytdlpPath, 0o755);
          }
          log("yt-dlp binary downloaded successfully.");
          resolve(ytdlpPath);
        });
      }).on("error", (err) => {
        reject(err);
      });
    }

    download(url);
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_") // strip characters illegal on Windows
    .replace(/[\x00-\x1f]/g, "") // strip control characters
    .trim();
}

async function resolveUniquePath(directory: string, filename: string): Promise<string> {
  let target = path.join(directory, filename);
  if (!fs.existsSync(target)) return target;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let counter = 1;
  while (fs.existsSync(target)) {
    target = path.join(directory, `${base} (${counter})${ext}`);
    counter++;
  }
  return target;
}

export interface YoutubeDownloadResult {
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  error?: string;
}

export async function downloadYoutubeVideo(
  url: string,
  targetFormat: "mp4" | "mp3",
  outputDir: string,
  allowedRoots: string[],
  configuredPaths?: Partial<Record<"ffmpeg", string>>
): Promise<YoutubeDownloadResult> {
  try {
    const ytdlpPath = await ensureYtdlp();
    
    // Get ffmpeg path if installed
    const ffmpegInfo = await detectEngine("ffmpeg", configuredPaths?.ffmpeg);
    
    if (targetFormat === "mp3" && !ffmpegInfo.installed) {
      return { ok: false, error: "FFmpeg is required to extract audio as MP3. Please install FFmpeg or configure its path in Settings." };
    }

    log(`Fetching title for: ${url}`);
    let title = "youtube_video";
    const jsRuntimeArgs = process.execPath ? ["--js-runtimes", `node:${process.execPath}`] : [];
    
    try {
      const env = { ...process.env, PYTHONIOENCODING: "utf-8" };
      const { stdout } = await execFileAsync(
        ytdlpPath,
        ["--print", "title", "--encoding", "utf-8", ...jsRuntimeArgs, url],
        { env, timeout: 15000 }
      );
      if (stdout.trim()) {
        title = sanitizeFilename(stdout.trim());
      }
    } catch (err) {
      log("Could not fetch video title, using default. Error:", (err as Error).message);
    }

    // Resolve output path
    const filename = `${title}.${targetFormat}`;
    const rawOutputPath = path.join(outputDir, filename);
    const safeOutputPath = validateOutputPath(rawOutputPath, allowedRoots);
    const finalOutputPath = await resolveUniquePath(path.dirname(safeOutputPath), path.basename(safeOutputPath));
    const outputTemplate = finalOutputPath.replace(/\.[^.]+$/, ".%(ext)s");

    log(`Downloading to: ${finalOutputPath}`);
    const args: string[] = [
      ...jsRuntimeArgs,
      "--encoding", "utf-8",
      "--print", "after_move:filepath"
    ];

    // Integrate FFmpeg location if available (only if it is an absolute path)
    if (ffmpegInfo.installed && ffmpegInfo.path && path.isAbsolute(ffmpegInfo.path)) {
      args.push("--ffmpeg-location", ffmpegInfo.path);
    }

    if (targetFormat === "mp3") {
      args.push("-x", "--audio-format", "mp3");
    } else {
      // Best MP4 stream or merge video + audio into MP4 if FFmpeg is available
      if (ffmpegInfo.installed) {
        args.push("-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]", "--merge-output-format", "mp4");
      } else {
        args.push("-f", "b[ext=mp4]");
      }
    }

    args.push("-o", outputTemplate, url);

    // Run download (max 5 minutes)
    const env = { ...process.env, PYTHONIOENCODING: "utf-8" };
    const { stdout } = await execFileAsync(ytdlpPath, args, { env, timeout: 300000 });

    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    let actualOutputPath = finalOutputPath;
    let found = false;
    
    // Search stdout lines for the path that actually exists
    for (const line of lines) {
      if (line.includes(path.dirname(finalOutputPath)) && fs.existsSync(line)) {
        actualOutputPath = line;
        found = true;
        break;
      }
    }
    
    if (!found) {
      if (fs.existsSync(finalOutputPath)) {
        actualOutputPath = finalOutputPath;
      } else {
        const potentialPath = outputTemplate.replace(".%(ext)s", `.${targetFormat}`);
        if (fs.existsSync(potentialPath)) {
          actualOutputPath = potentialPath;
        } else {
          return { ok: false, error: "Download finished but output file was not found." };
        }
      }
    }

    const size = fs.statSync(actualOutputPath).size;
    return {
      ok: true,
      outputPath: actualOutputPath,
      outputSizeBytes: size
    };
  } catch (err) {
    log("Download failed:", err);
    return { ok: false, error: (err as Error).message };
  }
}
