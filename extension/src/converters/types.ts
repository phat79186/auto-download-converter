export type EngineName = "ffmpeg" | "pandoc" | "libreoffice";
export type ConversionCategory = "text" | "data" | "image" | "audio" | "video" | "document";

export interface ConversionDescriptor {
  /** e.g. "txt->pdf" - matches the native host's `operation` key when requiresNativeHost is true. */
  id: string;
  sourceExt: string;
  targetExt: string;
  label: string;
  category: ConversionCategory;
  /** True if this can run entirely in the browser/extension with no local install required. */
  browserCompatible: boolean;
  /** True if this conversion must go through the native messaging host. */
  requiresNativeHost: boolean;
  requiredEngine?: EngineName;
  /** Shown in the UI capability matrix / rule creation dropdown as a caveat, if any. */
  notes?: string;
}

export interface ConvertOutcome {
  ok: boolean;
  outputBytes?: ArrayBuffer;
  error?: string;
}
