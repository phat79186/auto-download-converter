/**
 * Chrome/Edge Native Messaging wire protocol.
 *
 * Each message is:
 *   [4 bytes: little-endian uint32 length][UTF-8 JSON payload of that length]
 *
 * This module only deals with framing bytes <-> JS objects. It has no
 * knowledge of stdin/stdout so it can be unit tested without a real process.
 */

export const MAX_MESSAGE_BYTES = 1024 * 1024 * 64; // 64 MB, matches Chrome's native messaging cap

export class ProtocolError extends Error {}

/** Encode a JS value into a length-prefixed frame ready to write to stdout. */
export function encodeMessage(value: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(value), "utf-8");
  if (json.byteLength > MAX_MESSAGE_BYTES) {
    throw new ProtocolError(`Message too large: ${json.byteLength} bytes`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.byteLength, 0);
  return Buffer.concat([header, json]);
}

/**
 * Incremental frame decoder. Feed it raw bytes as they arrive from stdin;
 * it emits complete decoded messages as soon as a full frame is available
 * and retains any partial trailing bytes for the next call.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** Push newly received bytes and return any complete messages found. */
  push(chunk: Buffer): unknown[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const messages: unknown[] = [];

    for (;;) {
      if (this.buffer.length < 4) break;
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_MESSAGE_BYTES) {
        throw new ProtocolError(`Incoming message too large: ${length} bytes`);
      }
      if (this.buffer.length < 4 + length) break; // wait for more data

      const jsonBytes = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);

      try {
        messages.push(JSON.parse(jsonBytes.toString("utf-8")));
      } catch (err) {
        throw new ProtocolError(`Malformed JSON frame: ${(err as Error).message}`);
      }
    }

    return messages;
  }
}
