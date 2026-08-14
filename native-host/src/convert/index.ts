import { FFMPEG_OPERATIONS } from "../engines/ffmpeg.js";
import { DOCUMENT_OPERATIONS } from "../security/documentOperations.js";
import { convertAudioVideo } from "./audioVideo.js";
import { convertDocument } from "./documents.js";
import { validateExistingInputPath, validateOutputPath, PathSecurityError } from "../security/pathValidation.js";
import type { ConvertRequest, ConvertResponse } from "../types.js";

export async function handleConvert(req: ConvertRequest): Promise<ConvertResponse> {
  const startedAt = Date.now();
  const base: Pick<ConvertResponse, "type" | "id" | "jobId"> = { type: "convert", id: req.id, jobId: req.jobId };

  let safeInput: string;
  let safeOutput: string;
  try {
    safeInput = validateExistingInputPath(req.inputPath, req.allowedRoots);
    safeOutput = validateOutputPath(req.outputPath, req.allowedRoots);
  } catch (err) {
    const message = err instanceof PathSecurityError ? err.message : "Invalid input/output path";
    return { ...base, ok: false, error: message };
  }

  const isFfmpegOp = req.operation in FFMPEG_OPERATIONS;
  const isDocOp = req.operation in DOCUMENT_OPERATIONS;

  if (!isFfmpegOp && !isDocOp) {
    return { ...base, ok: false, error: `Unknown/unsupported operation: "${req.operation}"` };
  }

  try {
    if (isFfmpegOp) {
      const result = await convertAudioVideo(req.operation, safeInput, safeOutput, req.configuredPaths);
      return {
        ...base,
        ok: result.ok,
        outputPath: result.outputPath,
        outputSizeBytes: result.outputSizeBytes,
        durationMs: Date.now() - startedAt,
        error: result.error,
        stderrTail: result.stderrTail,
      };
    } else {
      const result = await convertDocument(req.operation, safeInput, safeOutput, req.configuredPaths);
      return {
        ...base,
        ok: result.ok,
        outputPath: result.outputPath,
        outputSizeBytes: result.outputSizeBytes,
        durationMs: Date.now() - startedAt,
        error: result.error,
        stderrTail: result.stderrTail,
      };
    }
  } catch (err) {
    return { ...base, ok: false, error: `Unexpected error during conversion: ${(err as Error).message}` };
  }
}
