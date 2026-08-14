#!/usr/bin/env node
import { FrameDecoder, encodeMessage } from "./protocol.js";
import { detectAllEngines } from "./engines/detect.js";
import { handleConvert } from "./convert/index.js";
import { readFileForTransfer, writeFileFromTransfer, deleteFileSecurely, statFileSecurely } from "./convert/fileIO.js";
import { downloadYoutubeVideo } from "./convert/youtube.js";
import type { HostRequest } from "./types.js";

const HOST_VERSION = "1.0.0";

function writeMessage(value: unknown): void {
  process.stdout.write(encodeMessage(value));
}

function log(...args: unknown[]): void {
  // stdout is reserved exclusively for the framed protocol - all diagnostics go to stderr.
  // eslint-disable-next-line no-console
  console.error("[auto-download-converter-host]", ...args);
}

async function dispatch(req: HostRequest): Promise<void> {
  try {
    if (req.type === "ping") {
      writeMessage({ type: "pong", id: req.id, version: HOST_VERSION });
      return;
    }

    if (req.type === "detect") {
      const engines = await detectAllEngines(req.configuredPaths);
      writeMessage({ type: "detect", id: req.id, engines });
      return;
    }

    if (req.type === "convert") {
      const response = await handleConvert(req);
      writeMessage(response);
      return;
    }

    if (req.type === "readFile") {
      try {
        const { sizeBytes, chunks } = readFileForTransfer(req.path, req.allowedRoots);
        for (const chunk of chunks) {
          writeMessage({ type: "readFileChunk", id: req.id, ...chunk });
        }
        writeMessage({ type: "readFile", id: req.id, ok: true, sizeBytes, totalChunks: chunks.length });
      } catch (err) {
        writeMessage({ type: "readFile", id: req.id, ok: false, error: (err as Error).message });
      }
      return;
    }

    if (req.type === "writeFile") {
      try {
        const { path, sizeBytes } = writeFileFromTransfer(req.path, req.base64Data, req.allowedRoots, req.overwrite);
        writeMessage({ type: "writeFile", id: req.id, ok: true, path, sizeBytes });
      } catch (err) {
        writeMessage({ type: "writeFile", id: req.id, ok: false, error: (err as Error).message });
      }
      return;
    }

    if (req.type === "deleteFile") {
      try {
        deleteFileSecurely(req.path, req.allowedRoots);
        writeMessage({ type: "deleteFile", id: req.id, ok: true });
      } catch (err) {
        writeMessage({ type: "deleteFile", id: req.id, ok: false, error: (err as Error).message });
      }
      return;
    }

    if (req.type === "statFile") {
      const result = statFileSecurely(req.path, req.allowedRoots);
      writeMessage({ type: "statFile", id: req.id, ...result });
      return;
    }

    if (req.type === "youtubeDownload") {
      const result = await downloadYoutubeVideo(req.url, req.targetFormat, req.outputDir, req.allowedRoots, req.configuredPaths);
      writeMessage({
        type: "youtubeDownload",
        id: req.id,
        jobId: req.jobId,
        ok: result.ok,
        outputPath: result.outputPath,
        outputSizeBytes: result.outputSizeBytes,
        error: result.error
      });
      return;
    }

    writeMessage({ type: "error", id: (req as { id?: string }).id ?? "unknown", error: `Unknown request type` });
  } catch (err) {
    log("Unhandled error while processing request", err);
    writeMessage({ type: "error", id: (req as { id?: string }).id ?? "unknown", error: (err as Error).message });
  }
}

function main(): void {
  const decoder = new FrameDecoder();

  process.stdin.on("data", (chunk: Buffer) => {
    let messages: unknown[];
    try {
      messages = decoder.push(chunk);
    } catch (err) {
      log("Protocol error, shutting down:", err);
      process.exit(1);
      return;
    }
    for (const msg of messages) {
      void dispatch(msg as HostRequest);
    }
  });

  process.stdin.on("end", () => {
    // Chrome/Edge closes stdin when the extension disconnects - this is the normal shutdown signal.
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    log("uncaughtException:", err);
  });
}

main();
