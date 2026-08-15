export type JobStatus =
  | "queued"
  | "waiting" // matched but automaticConversion=false, waiting for manual trigger
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"; // was processing when the browser/service worker was terminated

export interface ConversionJob {
  id: string;
  downloadId: number | null;
  ruleId: string | null;
  conversionId: string; // e.g. "txt->pdf"

  sourceFilename: string;
  sourcePath: string; // path as reported by chrome.downloads (relative to download root)
  sourceExt: string;
  targetExt: string;

  status: JobStatus;
  progressPercent: number | null;
  priority: number;

  outputFilename: string | null;
  outputPath: string | null;
  outputSizeBytes: number | null;
  /** Forward-slash path relative to the source file's directory - see jobBuilder.ts. Used to
   *  trigger a real chrome.downloads.download() for browser-native conversions. */
  relativeSubpath: string | null;

  error: string | null;
  retryCount: number;
  deleteOriginalRequested: boolean;
  engineUsed: string | null;

  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export function createJob(partial: Omit<ConversionJob, keyof ReturnType<typeof jobDefaults>> & Partial<ReturnType<typeof jobDefaults>>): ConversionJob {
  return { ...jobDefaults(), ...partial };
}

function jobDefaults() {
  return {
    status: "queued" as JobStatus,
    progressPercent: null as number | null,
    priority: 100,
    outputFilename: null as string | null,
    outputPath: null as string | null,
    outputSizeBytes: null as number | null,
    relativeSubpath: null as string | null,
    error: null as string | null,
    retryCount: 0,
    deleteOriginalRequested: false,
    engineUsed: null as string | null,
    createdAt: Date.now(),
    startedAt: null as number | null,
    completedAt: null as number | null,
  };
}

export interface HistoryEntry {
  id: string;
  sourceFilename: string;
  outputFilename: string | null;
  conversionId: string;
  status: "completed" | "failed" | "cancelled" | "interrupted";
  error: string | null;
  outputSizeBytes: number | null;
  durationMs: number | null;
  engineUsed: string | null;
  completedAt: number;
}

export function jobToHistoryEntry(job: ConversionJob): HistoryEntry {
  return {
    id: job.id,
    sourceFilename: job.sourceFilename,
    outputFilename: job.outputFilename,
    conversionId: job.conversionId,
    status: job.status === "completed" ? "completed" : job.status === "cancelled" ? "cancelled" : job.status === "interrupted" ? "interrupted" : "failed",
    error: job.error,
    outputSizeBytes: job.outputSizeBytes,
    durationMs: job.startedAt && job.completedAt ? job.completedAt - job.startedAt : null,
    engineUsed: job.engineUsed,
    completedAt: job.completedAt ?? Date.now(),
  };
}
