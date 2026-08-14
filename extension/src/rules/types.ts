import { CONVERSION_REGISTRY } from "../converters/registry.js";

export type OverwriteBehavior = "rename" | "overwrite" | "skip";
export type OutputLocation = "same-folder" | "dedicated-folder" | "per-format-folder";

export interface ConversionRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Priority: lower number = evaluated first. Ties broken by rule creation order. */
  priority: number;

  sourceExtension: string; // "txt" (no dot), or "*" to match any
  sourceMimePattern?: string; // optional extra filter, e.g. "text/*"
  targetFormat: string; // "pdf"

  outputLocation: OutputLocation;
  /** Only used when outputLocation === "dedicated-folder". Relative to the Downloads root. */
  dedicatedFolderName?: string;

  filenameTemplate: string; // e.g. "{name}_converted.{extension}"
  overwriteBehavior: OverwriteBehavior;
  deleteOriginal: boolean;
  /** Ask for confirmation before deleting the original, even if deleteOriginal is true. */
  confirmBeforeDelete: boolean;

  maxFileSizeBytes: number | null; // null = no limit
  automaticConversion: boolean; // if false, the file is queued but held for manual "Convert" click
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;

  createdAt: number;
  updatedAt: number;
}

export function createDefaultRule(overrides: Partial<ConversionRule> = {}): ConversionRule {
  const now = Date.now();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "New rule",
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 100,
    sourceExtension: overrides.sourceExtension ?? "txt",
    sourceMimePattern: overrides.sourceMimePattern,
    targetFormat: overrides.targetFormat ?? "pdf",
    outputLocation: overrides.outputLocation ?? "same-folder",
    dedicatedFolderName: overrides.dedicatedFolderName ?? "Converted",
    filenameTemplate: overrides.filenameTemplate ?? "{name}.{extension}",
    overwriteBehavior: overrides.overwriteBehavior ?? "rename",
    deleteOriginal: overrides.deleteOriginal ?? false,
    confirmBeforeDelete: overrides.confirmBeforeDelete ?? true,
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? 500 * 1024 * 1024,
    automaticConversion: overrides.automaticConversion ?? true,
    notifyOnSuccess: overrides.notifyOnSuccess ?? true,
    notifyOnFailure: overrides.notifyOnFailure ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export interface DownloadFileInfo {
  filename: string; // full path or just basename, only extension/mime are used for matching
  extension: string; // without dot, lowercase
  mimeType: string | null;
  sizeBytes: number;
}

function mimeMatches(pattern: string, mime: string | null): boolean {
  if (!mime) return false;
  if (pattern.endsWith("/*")) return mime.startsWith(pattern.slice(0, -1));
  return mime === pattern;
}

/**
 * Finds the highest-priority enabled rule that matches a downloaded file.
 * Rules are already expected to be sorted or will be sorted here by priority
 * (ascending), then by createdAt (ascending) as a stable tiebreaker.
 */
export function matchRule(file: DownloadFileInfo, rules: ConversionRule[]): ConversionRule | null {
  const candidates = rules
    .filter((r) => r.enabled)
    .filter((r) => {
      const ruleSource = r.sourceExtension.toLowerCase();
      const fileExt = file.extension.toLowerCase();
      if (ruleSource === "*") return true;
      if (ruleSource === fileExt) return true;
      if (ruleSource.startsWith("[") && ruleSource.endsWith("]")) {
        const category = ruleSource.slice(1, -1);
        const categories = category === "images"
          ? ["image"]
          : category === "documents"
            ? ["document", "text"]
            : [category];
        return CONVERSION_REGISTRY.some((c) => c.sourceExt === fileExt && categories.includes(c.category));
      }
      return false;
    })
    .filter((r) => !r.sourceMimePattern || mimeMatches(r.sourceMimePattern, file.mimeType))
    .filter((r) => r.maxFileSizeBytes === null || file.sizeBytes <= r.maxFileSizeBytes)
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

  return candidates[0] ?? null;
}

export interface RuleValidationError {
  field: string;
  message: string;
}

/** Validates a rule before it's saved - the UI should surface these, and the
 *  background script re-validates defensively before ever queuing a conversion. */
export function validateRule(rule: ConversionRule): RuleValidationError[] {
  const errors: RuleValidationError[] = [];
  if (!rule.name.trim()) errors.push({ field: "name", message: "Rule name is required" });
  if (!/^(?:[a-z0-9*]+|\[[a-z]+\])$/i.test(rule.sourceExtension)) {
    errors.push({ field: "sourceExtension", message: 'Source extension must be alphanumeric, "*", or a category like "[images]"' });
  }
  if (!/^[a-z0-9]+$/i.test(rule.targetFormat)) {
    errors.push({ field: "targetFormat", message: "Target format must be alphanumeric" });
  }
  if (rule.sourceExtension.toLowerCase() === rule.targetFormat.toLowerCase()) {
    errors.push({ field: "targetFormat", message: "Target format must differ from the source extension" });
  }
  if (!rule.filenameTemplate.includes("{name}") && !rule.filenameTemplate.includes("{counter}")) {
    errors.push({ field: "filenameTemplate", message: "Template should include {name} (or {counter}) to avoid every file colliding" });
  }
  if (rule.maxFileSizeBytes !== null && rule.maxFileSizeBytes <= 0) {
    errors.push({ field: "maxFileSizeBytes", message: "Maximum file size must be positive" });
  }
  if (rule.outputLocation === "dedicated-folder" && !rule.dedicatedFolderName?.trim()) {
    errors.push({ field: "dedicatedFolderName", message: "Dedicated folder name is required" });
  }
  return errors;
}
