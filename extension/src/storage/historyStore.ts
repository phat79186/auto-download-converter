import type { KeyValueStore } from "../storage/keyValueStore.js";
import type { HistoryEntry } from "../queue/types.js";

const KEY = "history";
const MAX_ENTRIES = 1000;

export class HistoryStore {
  constructor(private store: KeyValueStore, private maxEntries = MAX_ENTRIES) {}

  async list(limit?: number): Promise<HistoryEntry[]> {
    const entries = (await this.store.get<HistoryEntry[]>(KEY)) ?? [];
    const sorted = [...entries].sort((a, b) => b.completedAt - a.completedAt);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  async add(entry: HistoryEntry): Promise<void> {
    const entries = (await this.store.get<HistoryEntry[]>(KEY)) ?? [];
    entries.push(entry);
    entries.sort((a, b) => b.completedAt - a.completedAt);
    if (entries.length > this.maxEntries) entries.length = this.maxEntries;
    await this.store.set(KEY, entries);
  }

  async clear(): Promise<void> {
    await this.store.set(KEY, []);
  }

  async stats(sinceMs?: number): Promise<{ total: number; successful: number; failed: number }> {
    const entries = await this.list();
    const filtered = sinceMs ? entries.filter((e) => e.completedAt >= sinceMs) : entries;
    return {
      total: filtered.length,
      successful: filtered.filter((e) => e.status === "completed").length,
      failed: filtered.filter((e) => e.status === "failed" || e.status === "interrupted").length,
    };
  }

  /** Convenience for the dashboard's "Conversions Today" stat. */
  async statsToday(): Promise<{ total: number; successful: number; failed: number }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.stats(startOfDay.getTime());
  }
}
