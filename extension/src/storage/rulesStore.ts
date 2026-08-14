import type { KeyValueStore } from "./keyValueStore.js";
import { type ConversionRule, createDefaultRule, validateRule, type RuleValidationError } from "../rules/types.js";

const KEY = "rules";

export class RulesStore {
  constructor(private store: KeyValueStore) {}

  async list(): Promise<ConversionRule[]> {
    const rules = await this.store.get<ConversionRule[]>(KEY);
    return (rules ?? []).sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<ConversionRule | undefined> {
    return (await this.list()).find((r) => r.id === id);
  }

  async add(partial: Partial<ConversionRule>): Promise<{ rule?: ConversionRule; errors: RuleValidationError[] }> {
    const rule = createDefaultRule(partial);
    const errors = validateRule(rule);
    if (errors.length) return { errors };
    const rules = await this.list();
    rules.push(rule);
    await this.store.set(KEY, rules);
    return { rule, errors: [] };
  }

  async update(id: string, patch: Partial<ConversionRule>): Promise<{ rule?: ConversionRule; errors: RuleValidationError[] }> {
    const rules = await this.list();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) return { errors: [{ field: "id", message: "Rule not found" }] };
    const updated = { ...rules[idx]!, ...patch, id, updatedAt: Date.now() };
    const errors = validateRule(updated);
    if (errors.length) return { errors };
    rules[idx] = updated;
    await this.store.set(KEY, rules);
    return { rule: updated, errors: [] };
  }

  async remove(id: string): Promise<void> {
    const rules = (await this.list()).filter((r) => r.id !== id);
    await this.store.set(KEY, rules);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.update(id, { enabled });
  }
}
