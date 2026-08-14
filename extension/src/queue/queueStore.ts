import type { KeyValueStore } from "../storage/keyValueStore.js";
import type { ConversionJob, JobStatus } from "./types.js";

const KEY = "queue";

export class QueueStore {
  constructor(private store: KeyValueStore) {}

  async list(): Promise<ConversionJob[]> {
    return (await this.store.get<ConversionJob[]>(KEY)) ?? [];
  }

  async get(id: string): Promise<ConversionJob | undefined> {
    return (await this.list()).find((j) => j.id === id);
  }

  async enqueue(job: ConversionJob): Promise<void> {
    const jobs = await this.list();
    jobs.push(job);
    await this.store.set(KEY, jobs);
  }

  async update(id: string, patch: Partial<ConversionJob>): Promise<ConversionJob | undefined> {
    const jobs = await this.list();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    jobs[idx] = { ...jobs[idx]!, ...patch };
    await this.store.set(KEY, jobs);
    return jobs[idx];
  }

  async remove(id: string): Promise<void> {
    const jobs = (await this.list()).filter((j) => j.id !== id);
    await this.store.set(KEY, jobs);
  }

  /** Removes every job in a terminal state (completed/failed/cancelled), leaving active/queued ones. */
  async clearFinished(): Promise<void> {
    const jobs = (await this.list()).filter((j) => !isTerminal(j.status));
    await this.store.set(KEY, jobs);
  }

  /** Picks the next job to run: highest priority (lowest number) among "queued", oldest first,
   *  skipping any conversionId excluded (e.g. because that engine is currently unavailable). */
  async nextQueued(excludeConversionIds: Set<string> = new Set()): Promise<ConversionJob | undefined> {
    const jobs = await this.list();
    return jobs
      .filter((j) => j.status === "queued" && !excludeConversionIds.has(j.conversionId))
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0];
  }

  async countByStatus(status: JobStatus): Promise<number> {
    return (await this.list()).filter((j) => j.status === status).length;
  }

  /**
   * Called on service worker startup: any job left "processing" from before a
   * restart/crash cannot be trusted to still be running (ffmpeg/soffice child
   * processes are gone with the old service worker), so mark it interrupted
   * rather than silently resuming as if nothing happened.
   */
  async markStaleProcessingAsInterrupted(): Promise<ConversionJob[]> {
    const jobs = await this.list();
    const affected: ConversionJob[] = [];
    for (const job of jobs) {
      if (job.status === "processing") {
        job.status = "interrupted";
        job.error = "Conversion was in progress when the browser/extension restarted.";
        job.completedAt = Date.now();
        affected.push(job);
      }
    }
    if (affected.length) await this.store.set(KEY, jobs);
    return affected;
  }
}

function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
}
