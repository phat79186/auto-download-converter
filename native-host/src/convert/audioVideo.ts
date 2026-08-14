import * as fs from "node:fs";
import { FFMPEG_OPERATIONS, runFfmpeg, probeOutput, deriveFfprobePath } from "../engines/ffmpeg.js";
import { detectEngine } from "../engines/detect.js";
import { assertExistsAndNonEmpty, OutputValidationError } from "../security/outputValidation.js";
import { tempSiblingPath } from "../security/tempPath.js";
import type { EngineName } from "../types.js";

export interface AudioVideoConvertResult {
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  durationSeconds?: number | null;
  error?: string;
  stderrTail?: string;
}

export async function convertAudioVideo(
  operation: string,
  inputPath: string,
  outputPath: string,
  configuredPaths: Partial<Record<EngineName, string>> | undefined,
  timeoutMs = 600_000
): Promise<AudioVideoConvertResult> {
  const spec = FFMPEG_OPERATIONS[operation];
  if (!spec) {
    return { ok: false, error: `Unsupported audio/video operation: ${operation}` };
  }

  const info = await detectEngine("ffmpeg", configuredPaths?.ffmpeg);
  if (!info.installed || !info.path) {
    return { ok: false, error: "FFmpeg was not found. Install FFmpeg or configure its path in Settings." };
  }

  const tmpOutputPath = tempSiblingPath(outputPath);
  cleanupTmp(tmpOutputPath);

  const args = spec.buildArgs(inputPath, tmpOutputPath);
  const runResult = await runFfmpeg(info.path, args, timeoutMs);

  if (!runResult.ok) {
    cleanupTmp(tmpOutputPath);
    return { ok: false, error: `FFmpeg exited with an error (code ${runResult.exitCode})`, stderrTail: runResult.stderrTail };
  }

  try {
    assertExistsAndNonEmpty(tmpOutputPath);

    const ffprobePath = deriveFfprobePath(info.path);
    const probe = await probeOutput(ffprobePath, tmpOutputPath);

    if (spec.expectAudioStream && !probe.hasAudio) {
      throw new OutputValidationError("Output has no audio stream even though the exit code was 0");
    }
    if (spec.expectVideoStream && !probe.hasVideo) {
      throw new OutputValidationError("Output has no video stream even though the exit code was 0");
    }

    fs.renameSync(tmpOutputPath, outputPath);
    const size = fs.statSync(outputPath).size;
    return { ok: true, outputPath, outputSizeBytes: size, durationSeconds: probe.durationSeconds };
  } catch (err) {
    cleanupTmp(tmpOutputPath);
    const message = err instanceof OutputValidationError
      ? `FFmpeg exited successfully but the output file is invalid: ${err.message}`
      : (err as Error).message;
    return { ok: false, error: message, stderrTail: runResult.stderrTail };
  }
}

function cleanupTmp(tmpPath: string) {
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch {
    /* best effort */
  }
}
