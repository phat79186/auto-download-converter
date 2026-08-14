import { describe, it, expect, vi } from "vitest";
import { NativeMessagingClient, NativeHostUnavailableError, type PortLike } from "../src/background/nativeMessagingClient.js";

class FakePort implements PortLike {
  private messageListeners: Array<(msg: unknown) => void> = [];
  private disconnectListeners: Array<() => void> = [];
  public sent: unknown[] = [];
  public disconnected = false;

  onMessage = { addListener: (cb: (msg: unknown) => void) => this.messageListeners.push(cb) };
  onDisconnect = { addListener: (cb: () => void) => this.disconnectListeners.push(cb) };

  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  disconnect(): void {
    this.disconnected = true;
    this.triggerDisconnect();
  }
  // test helpers
  triggerMessage(msg: unknown): void {
    for (const cb of this.messageListeners) cb(msg);
  }
  triggerDisconnect(): void {
    for (const cb of this.disconnectListeners) cb();
  }
}

describe("NativeMessagingClient", () => {
  it("sends a ping and resolves true on a pong reply", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const pingPromise = client.ping();
    const sentMsg = port.sent[0] as { type: string; id: string };
    expect(sentMsg.type).toBe("ping");
    port.triggerMessage({ type: "pong", id: sentMsg.id, version: "1.0.0" });
    expect(await pingPromise).toBe(true);
  });

  it("ping resolves false (not throws) if the host is unreachable and connectFn throws", async () => {
    const client = new NativeMessagingClient(() => {
      throw new Error("host not installed");
    });
    expect(await client.ping()).toBe(false);
  });

  it("detectEngines resolves with the engines array from the response", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.detectEngines();
    const sentMsg = port.sent[0] as { id: string };
    port.triggerMessage({
      type: "detect",
      id: sentMsg.id,
      engines: [{ engine: "ffmpeg", installed: true, version: "6.1.1", path: "ffmpeg" }],
    });
    const engines = await promise;
    expect(engines[0]?.engine).toBe("ffmpeg");
    expect(engines[0]?.installed).toBe(true);
  });

  it("convert() sends a well-formed convert request and resolves with the result", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.convert({
      jobId: "job1",
      operation: "mp4->mp3",
      inputPath: "/downloads/video.mp4",
      outputPath: "/downloads/video.mp3",
      allowedRoots: ["/downloads"],
    });
    const sentMsg = port.sent[0] as { id: string; type: string; operation: string };
    expect(sentMsg.type).toBe("convert");
    expect(sentMsg.operation).toBe("mp4->mp3");
    port.triggerMessage({ type: "convert", id: sentMsg.id, jobId: "job1", ok: true, outputPath: "/downloads/video.mp3", outputSizeBytes: 12345 });
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.outputSizeBytes).toBe(12345);
  });

  it("rejects all pending requests with NativeHostUnavailableError when the port disconnects mid-flight", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.detectEngines();
    port.triggerDisconnect();
    await expect(promise).rejects.toThrow(NativeHostUnavailableError);
  });

  it("isConnected() reflects connection state and flips false after disconnect", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    client.connect();
    expect(client.isConnected()).toBe(true);
    port.triggerDisconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("times out a request that never gets a response", async () => {
    vi.useFakeTimers();
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.ping();
    await vi.advanceTimersByTimeAsync(3100);
    expect(await promise).toBe(false);
    vi.useRealTimers();
  });

  it("readFile reassembles a single-chunk response into the original bytes", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.readFile("/downloads/a.txt", ["/downloads"]);
    const sent = port.sent[0] as { id: string; type: string };
    expect(sent.type).toBe("readFile");
    const original = new TextEncoder().encode("hello world");
    const base64 = btoa(String.fromCharCode(...original));
    port.triggerMessage({ type: "readFileChunk", id: sent.id, chunkIndex: 0, totalChunks: 1, base64Chunk: base64 });
    port.triggerMessage({ type: "readFile", id: sent.id, ok: true, sizeBytes: original.length, totalChunks: 1 });
    const result = await promise;
    expect(new Uint8Array(result)).toEqual(original);
  });

  it("readFile reassembles multiple out-of-order chunks correctly", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.readFile("/downloads/big.bin", ["/downloads"]);
    const sent = port.sent[0] as { id: string };
    // Simulate real chunking: base64-encode the WHOLE payload once, then slice the
    // resulting base64 STRING (this is what the native host actually does) - encoding
    // separate byte ranges independently would introduce mid-stream padding and is not
    // representative of the real wire format.
    const fullBase64 = btoa("AAAABBBB");
    const part0 = fullBase64.slice(0, 6);
    const part1 = fullBase64.slice(6);
    // Deliver out of order - the client must reassemble by chunkIndex, not arrival order.
    port.triggerMessage({ type: "readFileChunk", id: sent.id, chunkIndex: 1, totalChunks: 2, base64Chunk: part1 });
    port.triggerMessage({ type: "readFileChunk", id: sent.id, chunkIndex: 0, totalChunks: 2, base64Chunk: part0 });
    port.triggerMessage({ type: "readFile", id: sent.id, ok: true, sizeBytes: 8, totalChunks: 2 });
    const result = await promise;
    expect(new TextDecoder().decode(result)).toBe("AAAABBBB");
  });

  it("readFile rejects with the host's reported error on failure", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.readFile("/downloads/missing.txt", ["/downloads"]);
    const sent = port.sent[0] as { id: string };
    port.triggerMessage({ type: "readFile", id: sent.id, ok: false, error: "Input file does not exist" });
    await expect(promise).rejects.toThrow("Input file does not exist");
  });

  it("writeFile base64-encodes the payload and resolves with the written path/size", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const data = new TextEncoder().encode("payload bytes").buffer;
    const promise = client.writeFile("/downloads/out.pdf", data, ["/downloads"], true);
    const sent = port.sent[0] as { id: string; type: string; base64Data: string; overwrite: boolean };
    expect(sent.type).toBe("writeFile");
    expect(sent.overwrite).toBe(true);
    expect(atob(sent.base64Data)).toBe("payload bytes");
    port.triggerMessage({ type: "writeFile", id: sent.id, ok: true, path: "/downloads/out.pdf", sizeBytes: 13 });
    const result = await promise;
    expect(result.sizeBytes).toBe(13);
  });

  it("deleteFile rejects with the host error if deletion fails", async () => {
    const port = new FakePort();
    const client = new NativeMessagingClient(() => port);
    const promise = client.deleteFile("/downloads/x.txt", ["/downloads"]);
    const sent = port.sent[0] as { id: string };
    port.triggerMessage({ type: "deleteFile", id: sent.id, ok: false, error: "permission denied" });
    await expect(promise).rejects.toThrow("permission denied");
  });
});
