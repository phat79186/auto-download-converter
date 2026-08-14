import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "../src/storage/keyValueStore.js";
import { SettingsStore, DEFAULT_SETTINGS } from "../src/storage/settingsStore.js";
import { RulesStore } from "../src/storage/rulesStore.js";
import { QueueStore } from "../src/queue/queueStore.js";
import { HistoryStore } from "../src/storage/historyStore.js";
import { createJob } from "../src/queue/types.js";

describe("SettingsStore", () => {
  it("returns defaults when nothing has been saved", async () => {
    const s = new SettingsStore(new InMemoryStore());
    expect(await s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists partial updates and merges with defaults", async () => {
    const s = new SettingsStore(new InMemoryStore());
    await s.update({ monitoringEnabled: false, maxConcurrentConversions: 3 });
    const result = await s.get();
    expect(result.monitoringEnabled).toBe(false);
    expect(result.maxConcurrentConversions).toBe(3);
    expect(result.language).toBe(DEFAULT_SETTINGS.language); // untouched field preserved
  });

  it("clamps maxConcurrentConversions to [1,4]", async () => {
    const s = new SettingsStore(new InMemoryStore());
    await s.update({ maxConcurrentConversions: 99 });
    expect((await s.get()).maxConcurrentConversions).toBe(4);
    await s.update({ maxConcurrentConversions: -5 });
    expect((await s.get()).maxConcurrentConversions).toBe(1);
  });
});

describe("RulesStore", () => {
  let store: RulesStore;
  beforeEach(() => {
    store = new RulesStore(new InMemoryStore());
  });

  it("adds a valid rule and lists it", async () => {
    const { rule, errors } = await store.add({ sourceExtension: "txt", targetFormat: "pdf" });
    expect(errors).toEqual([]);
    expect(rule).toBeDefined();
    expect(await store.list()).toHaveLength(1);
  });

  it("rejects an invalid rule and does not persist it", async () => {
    const { rule, errors } = await store.add({ sourceExtension: "txt", targetFormat: "txt" });
    expect(rule).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(await store.list()).toHaveLength(0);
  });

  it("updates an existing rule", async () => {
    const { rule } = await store.add({ sourceExtension: "txt", targetFormat: "pdf" });
    const { rule: updated } = await store.update(rule!.id, { enabled: false });
    expect(updated?.enabled).toBe(false);
  });

  it("removes a rule", async () => {
    const { rule } = await store.add({ sourceExtension: "txt", targetFormat: "pdf" });
    await store.remove(rule!.id);
    expect(await store.list()).toHaveLength(0);
  });

  it("lists rules sorted by priority", async () => {
    await store.add({ sourceExtension: "a", targetFormat: "pdf", priority: 200, name: "b" });
    await store.add({ sourceExtension: "b", targetFormat: "pdf", priority: 10, name: "a" });
    const list = await store.list();
    expect(list[0]!.priority).toBe(10);
  });
});

describe("QueueStore", () => {
  let store: QueueStore;
  beforeEach(() => {
    store = new QueueStore(new InMemoryStore());
  });

  function job(overrides = {}) {
    return createJob({
      id: crypto.randomUUID(),
      downloadId: 1,
      ruleId: null,
      conversionId: "txt->pdf",
      sourceFilename: "a.txt",
      sourcePath: "a.txt",
      sourceExt: "txt",
      targetExt: "pdf",
      ...overrides,
    });
  }

  it("enqueues and lists jobs", async () => {
    await store.enqueue(job());
    expect(await store.list()).toHaveLength(1);
  });

  it("nextQueued returns the highest-priority queued job", async () => {
    const j1 = job({ priority: 200 });
    const j2 = job({ priority: 10 });
    await store.enqueue(j1);
    await store.enqueue(j2);
    const next = await store.nextQueued();
    expect(next?.id).toBe(j2.id);
  });

  it("nextQueued excludes conversion ids that are temporarily unavailable", async () => {
    const j1 = job({ conversionId: "mp4->mp3" });
    await store.enqueue(j1);
    expect(await store.nextQueued(new Set(["mp4->mp3"]))).toBeUndefined();
  });

  it("markStaleProcessingAsInterrupted flips processing jobs to interrupted (crash recovery)", async () => {
    const j1 = job({ status: "processing" });
    await store.enqueue(j1);
    const affected = await store.markStaleProcessingAsInterrupted();
    expect(affected).toHaveLength(1);
    expect((await store.get(j1.id))?.status).toBe("interrupted");
  });

  it("clearFinished removes only terminal-state jobs", async () => {
    const active = job({ status: "processing" });
    const done = job({ status: "completed" });
    await store.enqueue(active);
    await store.enqueue(done);
    await store.clearFinished();
    const remaining = await store.list();
    expect(remaining.map((j) => j.id)).toEqual([active.id]);
  });
});

describe("HistoryStore", () => {
  it("caps the number of stored entries", async () => {
    const store = new HistoryStore(new InMemoryStore(), 3);
    for (let i = 0; i < 5; i++) {
      await store.add({
        id: `h${i}`,
        sourceFilename: `f${i}.txt`,
        outputFilename: `f${i}.pdf`,
        conversionId: "txt->pdf",
        status: "completed",
        error: null,
        outputSizeBytes: 100,
        durationMs: 50,
        engineUsed: null,
        completedAt: Date.now() + i,
      });
    }
    expect(await store.list()).toHaveLength(3);
  });

  it("computes stats correctly", async () => {
    const store = new HistoryStore(new InMemoryStore());
    await store.add({ id: "1", sourceFilename: "a", outputFilename: "a.pdf", conversionId: "x", status: "completed", error: null, outputSizeBytes: 1, durationMs: 1, engineUsed: null, completedAt: Date.now() });
    await store.add({ id: "2", sourceFilename: "b", outputFilename: null, conversionId: "x", status: "failed", error: "boom", outputSizeBytes: null, durationMs: null, engineUsed: null, completedAt: Date.now() });
    const stats = await store.stats();
    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
  });
});
