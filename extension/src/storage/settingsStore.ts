import type { KeyValueStore } from "./keyValueStore.js";
import type { OutputLocation, OverwriteBehavior } from "../rules/types.js";

export interface EngineConfiguredPaths {
  ffmpeg?: string;
  pandoc?: string;
  libreoffice?: string;
}

export interface AppSettings {
  monitoringEnabled: boolean;
  defaultOutputLocation: OutputLocation;
  defaultDedicatedFolderName: string;
  automaticConversionDefault: boolean;
  deleteOriginalDefault: boolean;
  overwriteBehaviorDefault: OverwriteBehavior;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  maxConcurrentConversions: number;
  language: "en" | "vi";
  theme: "light" | "dark" | "system";
  engineConfiguredPaths: EngineConfiguredPaths;
}

export const DEFAULT_SETTINGS: AppSettings = {
  monitoringEnabled: true,
  defaultOutputLocation: "same-folder",
  defaultDedicatedFolderName: "Converted",
  automaticConversionDefault: true,
  deleteOriginalDefault: false,
  overwriteBehaviorDefault: "rename",
  notifyOnSuccess: true,
  notifyOnFailure: true,
  maxConcurrentConversions: 2,
  language: "en",
  theme: "system",
  engineConfiguredPaths: {},
};

const KEY = "settings";

export class SettingsStore {
  constructor(private store: KeyValueStore) {}

  async get(): Promise<AppSettings> {
    const stored = await this.store.get<Partial<AppSettings>>(KEY);
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    if (next.maxConcurrentConversions < 1) next.maxConcurrentConversions = 1;
    if (next.maxConcurrentConversions > 4) next.maxConcurrentConversions = 4;
    await this.store.set(KEY, next);
    return next;
  }
}
