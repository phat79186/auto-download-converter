export type EngineName = "ffmpeg" | "pandoc" | "libreoffice";

export interface EngineInfo {
  engine: EngineName;
  installed: boolean;
  version: string | null;
  path: string | null;
  error?: string;
}

export interface DetectRequest {
  type: "detect";
  id: string;
  /** Optional user-configured executable paths/overrides, e.g. from Settings. */
  configuredPaths?: Partial<Record<EngineName, string>>;
}

export interface ReadFileRequest {
  type: "readFile";
  id: string;
  path: string;
  allowedRoots: string[];
}

export interface WriteFileRequest {
  type: "writeFile";
  id: string;
  path: string;
  /** Base64-encoded file content (native messaging is JSON-only, so binary must be encoded). */
  base64Data: string;
  allowedRoots: string[];
  overwrite: boolean;
}

export interface DeleteFileRequest {
  type: "deleteFile";
  id: string;
  path: string;
  allowedRoots: string[];
}

export interface StatFileRequest {
  type: "statFile";
  id: string;
  path: string;
  allowedRoots: string[];
}

export interface ConvertRequest {
  type: "convert";
  id: string;
  jobId: string;
  /** e.g. "mp4->mp3", must match an entry in the conversion registry. */
  operation: string;
  inputPath: string;
  outputPath: string;
  /** Directories the extension has told us are legitimate (Downloads, configured output folder, etc). */
  allowedRoots: string[];
  configuredPaths?: Partial<Record<EngineName, string>>;
  options?: Record<string, string | number | boolean>;
}

export interface PingRequest {
  type: "ping";
  id: string;
}

export interface YoutubeDownloadRequest {
  type: "youtubeDownload";
  id: string;
  jobId: string;
  url: string;
  targetFormat: "mp4" | "mp3";
  outputDir: string;
  allowedRoots: string[];
  configuredPaths?: Partial<Record<"ffmpeg", string>>;
}

export type HostRequest = DetectRequest | ConvertRequest | PingRequest | ReadFileRequest | WriteFileRequest | DeleteFileRequest | StatFileRequest | YoutubeDownloadRequest;

export interface DetectResponse {
  type: "detect";
  id: string;
  engines: EngineInfo[];
}

export interface ConvertProgress {
  type: "progress";
  id: string;
  jobId: string;
  percent: number | null;
  message: string;
}

export interface ConvertResponse {
  type: "convert";
  id: string;
  jobId: string;
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  durationMs?: number;
  error?: string;
  stderrTail?: string;
}

export interface PongResponse {
  type: "pong";
  id: string;
  version: string;
}

export interface ErrorResponse {
  type: "error";
  id: string;
  error: string;
}

export interface ReadFileResponse {
  type: "readFile";
  id: string;
  ok: boolean;
  base64Data?: string;
  sizeBytes?: number;
  error?: string;
}

export interface WriteFileResponse {
  type: "writeFile";
  id: string;
  ok: boolean;
  path?: string;
  sizeBytes?: number;
  error?: string;
}

export interface DeleteFileResponse {
  type: "deleteFile";
  id: string;
  ok: boolean;
  error?: string;
}

export interface StatFileResponse {
  type: "statFile";
  id: string;
  exists: boolean;
  sizeBytes?: number;
  error?: string;
}

export interface YoutubeDownloadResponse {
  type: "youtubeDownload";
  id: string;
  jobId: string;
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  error?: string;
}

export type HostResponse =
  | DetectResponse
  | ConvertResponse
  | PongResponse
  | ErrorResponse
  | ConvertProgress
  | ReadFileResponse
  | WriteFileResponse
  | DeleteFileResponse
  | StatFileResponse
  | YoutubeDownloadResponse;
