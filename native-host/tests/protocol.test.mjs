import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, FrameDecoder, ProtocolError } from "../dist/protocol.js";

test("encodeMessage/FrameDecoder roundtrips a single message", () => {
  const decoder = new FrameDecoder();
  const frame = encodeMessage({ hello: "world", n: 42 });
  const messages = decoder.push(frame);
  assert.deepEqual(messages, [{ hello: "world", n: 42 }]);
});

test("FrameDecoder handles a message split across multiple chunks", () => {
  const decoder = new FrameDecoder();
  const frame = encodeMessage({ big: "x".repeat(10000) });
  const half = Math.floor(frame.length / 2);
  const first = decoder.push(frame.subarray(0, half));
  assert.deepEqual(first, []);
  const second = decoder.push(frame.subarray(half));
  assert.equal(second.length, 1);
  assert.equal(second[0].big.length, 10000);
});

test("FrameDecoder handles two messages arriving concatenated in one chunk", () => {
  const decoder = new FrameDecoder();
  const combined = Buffer.concat([encodeMessage({ a: 1 }), encodeMessage({ b: 2 })]);
  const messages = decoder.push(combined);
  assert.deepEqual(messages, [{ a: 1 }, { b: 2 }]);
});

test("FrameDecoder throws on malformed JSON payload", () => {
  const header = Buffer.alloc(4);
  const bad = Buffer.from("{not valid json", "utf-8");
  header.writeUInt32LE(bad.byteLength, 0);
  const decoder = new FrameDecoder();
  assert.throws(() => decoder.push(Buffer.concat([header, bad])), ProtocolError);
});

test("FrameDecoder rejects an implausibly large declared length (protects against a hostile/broken peer)", () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(0xffffffff, 0);
  const decoder = new FrameDecoder();
  assert.throws(() => decoder.push(header), ProtocolError);
});
