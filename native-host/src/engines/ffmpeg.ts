import { execFile } from "node:child_process";
import * as fs from "node:fs";

export interface FfmpegOpSpec {
  /** Build the ffmpeg argv (excluding the executable itself). Never string-concatenated - always an array. */
  buildArgs: (input: string, output: string) => string[];
  expectVideoStream: boolean;
  expectAudioStream: boolean;
  description: string;
}

/**
 * Explicit allow-list of every audio/video conversion this host will perform.
 * The extension can only request an `operation` key that exists here - it can
 * never inject arbitrary ffmpeg flags or an arbitrary command string.
 */
export const FFMPEG_OPERATIONS: Record<string, FfmpegOpSpec> = {
  "mp3->wav": {
    buildArgs: (i, o) => ["-y", "-i", i, "-ar", "44100", "-ac", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "MP3 to WAV (PCM 16-bit, 44.1kHz)",
  },
  "wav->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "WAV to MP3 (VBR quality 2)",
  },
  "mp3->ogg": {
    buildArgs: (i, o) => ["-y", "-i", i, "-codec:a", "libvorbis", "-qscale:a", "5", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "MP3 to OGG Vorbis",
  },
  "wav->ogg": {
    buildArgs: (i, o) => ["-y", "-i", i, "-codec:a", "libvorbis", "-qscale:a", "5", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "WAV to OGG Vorbis",
  },
  "m4a->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "M4A/AAC to MP3",
  },
  "flac->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "FLAC to MP3",
  },
  "mp4->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MP4 as MP3",
  },
  "mp4->wav": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-ar", "44100", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MP4 as WAV",
  },
  "mov->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MOV as MP3",
  },
  "mov->wav": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-ar", "44100", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MOV as WAV",
  },
  "mkv->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MKV as MP3",
  },
  "mkv->wav": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-ar", "44100", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from MKV as WAV",
  },
  "webm->mp3": {
    buildArgs: (i, o) => ["-y", "-i", i, "-vn", "-codec:a", "libmp3lame", "-qscale:a", "2", o],
    expectVideoStream: false,
    expectAudioStream: true,
    description: "Extract audio track from WEBM as MP3",
  },
  "mp4->webm": {
    buildArgs: (i, o) => ["-y", "-i", i, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", o],
    expectVideoStream: true,
    expectAudioStream: true,
    description: "MP4 to WEBM (VP9/Opus)",
  },
  "webm->mp4": {
    buildArgs: (i, o) => [
      "-y", "-i", i,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-pix_fmt", "yuv420p",
      o,
    ],
    expectVideoStream: true,
    expectAudioStream: true,
    description: "WEBM to MP4 (H.264/AAC)",
  },
  "mov->mp4": {
    buildArgs: (i, o) => [
      "-y", "-i", i,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-pix_fmt", "yuv420p",
      o,
    ],
    expectVideoStream: true,
    expectAudioStream: true,
    description: "MOV to MP4 (H.264/AAC)",
  },
  "mkv->mp4": {
    buildArgs: (i, o) => [
      "-y", "-i", i,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-pix_fmt", "yuv420p",
      o,
    ],
    expectVideoStream: true,
    expectAudioStream: true,
    description: "MKV to MP4 (H.264/AAC, transcoded for compatibility)",
  },
};

export interface RunResult {
  ok: boolean;
  stderrTail: string;
  exitCode: number | null;
}

/** Run ffmpeg with a pre-built, validated argv. Never accepts a shell string. */
export function runFfmpeg(ffmpegPath: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(ffmpegPath, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 16, windowsHide: true }, (error) => {
      const stderrTail = stderrBuf.slice(-4000);
      if (error) {
        const exitCode = typeof error.code === "number" ? error.code : null;
        resolve({ ok: false, stderrTail, exitCode });
      } else {
        resolve({ ok: true, stderrTail, exitCode: 0 });
      }
    });
    let stderrBuf = "";
    child.stderr?.on("data", (d) => {
      stderrBuf += d.toString();
    });
  });
}

export interface FfprobeStreams {
  hasVideo: boolean;
  hasAudio: boolean;
  durationSeconds: number | null;
}

/** Use ffprobe (shipped alongside ffmpeg) to verify the output file actually contains the expected media streams. */
export async function probeOutput(ffprobePath: string, filePath: string): Promise<FfprobeStreams> {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobePath,
      ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", filePath],
      { timeout: 15000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(new Error(`ffprobe validation failed: ${error.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const streams: Array<{ codec_type: string }> = parsed.streams ?? [];
          resolve({
            hasVideo: streams.some((s) => s.codec_type === "video"),
            hasAudio: streams.some((s) => s.codec_type === "audio"),
            durationSeconds: parsed.format?.duration ? parseFloat(parsed.format.duration) : null,
          });
        } catch (err) {
          reject(new Error(`Could not parse ffprobe output: ${(err as Error).message}`));
        }
      }
    );
  });
}

/** Derive the ffprobe path from a known ffmpeg path (same directory, sibling binary), falling back to PATH lookup. */
export function deriveFfprobePath(ffmpegPath: string): string {
  if (ffmpegPath === "ffmpeg" || ffmpegPath === "ffmpeg.exe") {
    return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  }
  const suffix = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const dir = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "");
  const candidate = dir + suffix;
  return fs.existsSync(candidate) ? candidate : suffix;
}
