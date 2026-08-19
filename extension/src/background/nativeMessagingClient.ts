export const NATIVE_HOST_NAME = "com.autodownloadconverter.host";

export interface PortLike {
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

export type EngineName = "ffmpeg" | "pandoc" | "libreoffice";

export interface EngineInfo {
  engine: EngineName;
  installed: boolean;
  version: string | null;
  path: string | null;
  error?: string;
}

export interface ConvertRequestParams {
  jobId: string;
  operation: string;
  inputPath: string;
  outputPath: string;
  allowedRoots: string[];
  configuredPaths?: Partial<Record<EngineName, string>>;
}

export interface ConvertResponsePayload {
  ok: boolean;
  outputPath?: string;
  outputSizeBytes?: number;
  durationMs?: number;
  error?: string;
  stderrTail?: string;
}

export class NativeHostUnavailableError extends Error {}

type PendingEntry = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * Wraps chrome.runtime.connectNative. The connect function is injectable so this
 * class can be unit tested with a fake in-memory port instead of a real browser.
 */
export class NativeMessagingClient {
  private port: PortLike | null = null;
  private pending = new Map<string, PendingEntry>();
  private multiMessageIds = new Set<string>();
  private lastDisconnectError: string | null = null;

  constructor(private connectFn: () => PortLike) {}

  isConnected(): boolean {
    return this.port !== null;
  }

  get lastError(): string | null {
    return this.lastDisconnectError;
  }

  connect(): void {
    if (this.port) return;
    let port: PortLike;
    try {
      port = this.connectFn();
    } catch (err) {
      this.lastDisconnectError = (err as Error).message;
      throw new NativeHostUnavailableError(
        `Could not start the native host. Make sure it's installed (see docs/NATIVE_HOST_INSTALL.md). Details: ${(err as Error).message}`
      );
    }
    this.port = port;
    port.onMessage.addListener((msg) => this.handleMessage(msg));
    port.onDisconnect.addListener(() => this.handleDisconnect());
  }

  private handleDisconnect(): void {
    this.port = null;
    const browserError = typeof chrome !== "undefined" && chrome.runtime?.lastError?.message;
    this.lastDisconnectError = browserError || "Native host disconnected unexpectedly.";
    for (const [, entry] of this.pending) {
      entry.reject(new NativeHostUnavailableError(this.lastDisconnectError));
    }
    this.pending.clear();
  }

  private handleMessage(msg: unknown): void {
    const m = msg as { id?: string; type?: string };
    if (!m || typeof m.id !== "string") return;
    const entry = this.pending.get(m.id);
    if (!entry) return;
    const isIntermediateChunk = m.type === "readFileChunk" && this.multiMessageIds.has(m.id);
    if (!isIntermediateChunk) {
      this.pending.delete(m.id);
      this.multiMessageIds.delete(m.id);
    }
    entry.resolve(msg);
  }

  private send<T>(request: { type: string; id: string; [k: string]: unknown }, timeoutMs = 15000): Promise<T> {
    this.connect();
    if (!this.port) {
      return Promise.reject(new NativeHostUnavailableError("Native host is not connected"));
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new NativeHostUnavailableError(`Native host did not respond within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      try {
        this.port!.postMessage(request);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(new NativeHostUnavailableError((err as Error).message));
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.send<{ type: string; version: string }>({ type: "ping", id: crypto.randomUUID() }, 3000);
      return res.type === "pong";
    } catch {
      return false;
    }
  }

  async detectEngines(configuredPaths?: Partial<Record<EngineName, string>>): Promise<EngineInfo[]> {
    const res = await this.send<{ type: string; engines: EngineInfo[] }>({
      type: "detect",
      id: crypto.randomUUID(),
      configuredPaths,
    });
    return res.engines;
  }

  async convert(params: ConvertRequestParams): Promise<ConvertResponsePayload> {
    const res = await this.send<ConvertResponsePayload & { type: string }>(
      {
        type: "convert",
        id: crypto.randomUUID(),
        jobId: params.jobId,
        operation: params.operation,
        inputPath: params.inputPath,
        outputPath: params.outputPath,
        allowedRoots: params.allowedRoots,
        configuredPaths: params.configuredPaths,
      },
      10 * 60 * 1000 // conversions can legitimately take minutes for large video files
    );
    return res;
  }

  /**
   * Reads a local file's bytes through the native host (the only supported way for an
   * MV3 extension to get the content of an arbitrary downloaded file - there is no
   * general local filesystem read API available to extensions). Reassembles chunks
   * transparently (Chrome caps host->extension messages at 1MB).
   */
  async readFile(path: string, allowedRoots: string[]): Promise<ArrayBuffer> {
    this.connect();
    if (!this.port) throw new NativeHostUnavailableError("Native host is not connected");

    const id = crypto.randomUUID();
    const chunks = new Map<number, string>();

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new NativeHostUnavailableError("Timed out reading file via native host"));
      }, 60_000);

      this.pending.set(id, {
        resolve: (msg) => {
          const m = msg as { type: string; ok?: boolean; error?: string; totalChunks?: number; chunkIndex?: number; base64Chunk?: string };
          if (m.type === "readFileChunk") {
            chunks.set(m.chunkIndex as number, m.base64Chunk as string);
            return;
          }
          // Final "readFile" message
          clearTimeout(timer);
          if (!m.ok) {
            reject(new Error(m.error ?? "Failed to read file"));
            return;
          }
          const total = m.totalChunks ?? 0;
          if (chunks.size !== total) {
            reject(new Error(`Incomplete file transfer: expected ${total} chunks, received ${chunks.size}`));
            return;
          }
          let base64 = "";
          for (let i = 0; i < total; i++) base64 += chunks.get(i) ?? "";
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve(bytes.buffer);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      // Override the default single-shot resolve behavior: readFileChunk messages must
      // NOT delete the pending entry (handled specially in handleMessage below via a flag).
      this.multiMessageIds.add(id);

      try {
        this.port!.postMessage({ type: "readFile", id, path, allowedRoots });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.multiMessageIds.delete(id);
        reject(new NativeHostUnavailableError((err as Error).message));
      }
    });
  }

  async writeFile(path: string, data: ArrayBuffer, allowedRoots: string[], overwrite: boolean): Promise<{ path: string; sizeBytes: number }> {
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const base64Data = btoa(binary);

    const res = await this.send<{ ok: boolean; path?: string; sizeBytes?: number; error?: string }>({
      type: "writeFile",
      id: crypto.randomUUID(),
      path,
      base64Data,
      allowedRoots,
      overwrite,
    });
    if (!res.ok || !res.path || res.sizeBytes === undefined) {
      throw new Error(res.error ?? "Failed to write file via native host");
    }
    return { path: res.path, sizeBytes: res.sizeBytes };
  }

  async deleteFile(path: string, allowedRoots: string[]): Promise<void> {
    const res = await this.send<{ ok: boolean; error?: string }>({ type: "deleteFile", id: crypto.randomUUID(), path, allowedRoots });
    if (!res.ok) throw new Error(res.error ?? "Failed to delete file via native host");
  }

  async statFile(path: string, allowedRoots: string[]): Promise<{ exists: boolean; sizeBytes?: number }> {
    return this.send<{ exists: boolean; sizeBytes?: number }>({ type: "statFile", id: crypto.randomUUID(), path, allowedRoots });
  }

  async downloadYoutube(params: {
    jobId: string;
    url: string;
    referer?: string;
    title?: string;
    targetFormat: "mp4" | "mp3";
    outputDir: string;
    allowedRoots: string[];
    configuredPaths?: Partial<Record<"ffmpeg", string>>;
  }): Promise<{ ok: boolean; outputPath?: string; outputSizeBytes?: number; error?: string }> {
    const res = await this.send<{
      type: "youtubeDownload";
      ok: boolean;
      outputPath?: string;
      outputSizeBytes?: number;
      error?: string;
    }>(
      {
        type: "youtubeDownload",
        id: crypto.randomUUID(),
        jobId: params.jobId,
        url: params.url,
        referer: params.referer,
        title: params.title,
        targetFormat: params.targetFormat,
        outputDir: params.outputDir,
        allowedRoots: params.allowedRoots,
        configuredPaths: params.configuredPaths,
      },
      15 * 60 * 1000 // Large HLS downloads can take several minutes
    );
    return res;
  }

  disconnect(): void {
    this.port?.disconnect();
    this.port = null;
  }
}

/** Production factory: connects via the real chrome.runtime.connectNative. */
export function createProductionNativeClient(): NativeMessagingClient {
  return new NativeMessagingClient(() => chrome.runtime.connectNative(NATIVE_HOST_NAME) as unknown as PortLike);
}
