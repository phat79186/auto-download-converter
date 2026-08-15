import type { QueueStore } from "./queueStore.js";
import type { HistoryStore } from "../storage/historyStore.js";
import type { ConversionJob } from "./types.js";
import { jobToHistoryEntry } from "./types.js";
import { findConversion } from "../converters/registry.js";

export interface ConvertResult {
  ok: boolean;
  outputSizeBytes?: number;
  engineUsed?: string | null;
  error?: string;
}

/** The subset of native-host capability the processor needs - satisfied by the real
 *  NativeMessagingClient in production, and by a simple fake in tests. */
export interface ConversionBackend {
  convertNative(params: { jobId: string; operation: string; inputPath: string; outputPath: string; allowedRoots: string[] }): Promise<ConvertResult>;
  readFile(path: string, allowedRoots: string[]): Promise<ArrayBuffer>;
  writeFile(path: string, data: ArrayBuffer, allowedRoots: string[], overwrite: boolean): Promise<{ path: string; sizeBytes: number }>;
  deleteFile(path: string, allowedRoots: string[], downloadId: number | null): Promise<void>;
}

export type BrowserConvertFn = (conversionId: string, inputBytes: ArrayBuffer) => Promise<{ bytes: ArrayBuffer; mimeType: string }>;

/** Triggers a REAL chrome.downloads.download() so the converted file shows up in the
 *  browser's Downloads list/shelf, not just written silently to disk. Implemented in
 *  background/index.ts (needs chrome.downloads, only available there); satisfied by a
 *  fake in tests. */
export type TriggerBrowserDownloadFn = (params: {
  filename: string;
  bytes: ArrayBuffer;
  mimeType: string;
}) => Promise<{ sizeBytes: number; downloadId: number }>;

export interface NotifyFn {
  (opts: { title: string; message: string; isError: boolean }): void;
}

export interface ProcessJobOptions {
  allowedRoots: string[];
  deleteOriginal: boolean;
  overwrite: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
}

export class QueueProcessor {
  constructor(
    private queueStore: QueueStore,
    private historyStore: HistoryStore,
    private backend: ConversionBackend,
    private runBrowserConversion: BrowserConvertFn,
    private triggerBrowserDownload: TriggerBrowserDownloadFn,
    private notify: NotifyFn
  ) {}

  /** Processes exactly one job end-to-end. Never throws - all failures are captured onto the job/history. */
  async processJob(job: ConversionJob, options: ProcessJobOptions): Promise<ConversionJob> {
    await this.queueStore.update(job.id, { status: "processing", startedAt: Date.now() });

    const descriptor = findConversion(job.sourceExt, job.targetExt);
    if (!descriptor) {
      return this.fail(job, `"${job.sourceExt} -> ${job.targetExt}" is not a supported conversion.`, options);
    }

    try {
      let outputSizeBytes: number | undefined;
      let engineUsed: string | null = null;

      if (descriptor.requiresNativeHost) {
        const result = await this.backend.convertNative({
          jobId: job.id,
          operation: descriptor.id,
          inputPath: job.sourcePath,
          outputPath: job.outputPath as string,
          allowedRoots: options.allowedRoots,
        });
        if (!result.ok) {
          return this.fail(job, result.error ?? "Native conversion failed for an unspecified reason.", options);
        }
        outputSizeBytes = result.outputSizeBytes;
        engineUsed = result.engineUsed ?? descriptor.requiredEngine ?? null;
      } else {
        // Browser-native conversion: read the source via the native host (extensions cannot
        // read arbitrary local files directly), convert in JS, then save via a REAL
        // chrome.downloads.download() call - not a silent native-host disk write - so the
        // result correctly shows up in the browser's Downloads list/shelf.
        if (!job.relativeSubpath) {
          return this.fail(job, "Internal error: job is missing its relativeSubpath (needed to trigger a browser download).", options);
        }
        const inputBytes = await this.backend.readFile(job.sourcePath, options.allowedRoots);
        const converted = await this.runBrowserConversion(descriptor.id, inputBytes);
        const downloadResult = await this.triggerBrowserDownload({
          filename: job.relativeSubpath,
          bytes: converted.bytes,
          mimeType: converted.mimeType,
        });
        outputSizeBytes = downloadResult.sizeBytes;
        engineUsed = "browser";
      }

      if (!outputSizeBytes || outputSizeBytes <= 0) {
        return this.fail(job, "Conversion reported success but produced no usable output (0 bytes) - treating as a failure, not a fake success.", options);
      }

      if (options.deleteOriginal) {
        try {
          await this.backend.deleteFile(job.sourcePath, options.allowedRoots, job.downloadId);
        } catch (err) {
          this.notify({ title: "Could not delete original file", message: (err as Error).message, isError: true });
        }
      }

      const completedAt = Date.now();
      const updated = await this.queueStore.update(job.id, {
        status: "completed",
        completedAt,
        outputSizeBytes,
        engineUsed,
      });
      const finalJob = updated ?? { ...job, status: "completed" as const, completedAt, outputSizeBytes, engineUsed };
      await this.historyStore.add(jobToHistoryEntry(finalJob));

      if (options.notifyOnSuccess) {
        this.notify({
          title: "Conversion completed",
          message: `${job.sourceFilename} \u2192 ${job.outputFilename}`,
          isError: false,
        });
      }
      return finalJob;
    } catch (err) {
      return this.fail(job, (err as Error).message, options);
    }
  }

  private async fail(job: ConversionJob, error: string, options: ProcessJobOptions): Promise<ConversionJob> {
    const completedAt = Date.now();
    const updated = await this.queueStore.update(job.id, { status: "failed", error, completedAt });
    const finalJob = updated ?? { ...job, status: "failed" as const, error, completedAt };
    await this.historyStore.add(jobToHistoryEntry(finalJob));
    if (options.notifyOnFailure) {
      this.notify({ title: "Conversion failed", message: `${job.sourceFilename}: ${error}`, isError: true });
    }
    return finalJob;
  }

  /** Retries a failed/cancelled/interrupted job by resetting it back to "queued". */
  async retry(jobId: string): Promise<void> {
    await this.queueStore.update(jobId, { status: "queued", error: null, progressPercent: null, startedAt: null, completedAt: null });
  }

  async cancel(jobId: string): Promise<void> {
    await this.queueStore.update(jobId, { status: "cancelled", completedAt: Date.now() });
  }
}
