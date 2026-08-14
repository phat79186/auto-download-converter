import type { EngineName } from "../types.js";
import type { LibreOfficeTarget } from "../engines/libreoffice.js";

export type DocumentCandidate =
  | { engine: "libreoffice"; targetFormat: LibreOfficeTarget }
  | { engine: "pandoc"; fromFormat: string; toFormat: string };

export interface DocumentOpSpec {
  candidates: DocumentCandidate[];
  description: string;
}

/**
 * Explicit allow-list of document conversions. Each operation lists the engine(s)
 * capable of it, in preference order - the host picks the first one that's
 * actually installed. The extension can only request a key from this table.
 */
export const DOCUMENT_OPERATIONS: Record<string, DocumentOpSpec> = {
  "docx->pdf": {
    candidates: [{ engine: "libreoffice", targetFormat: "pdf" }],
    description: "DOCX to PDF (layout-accurate, via LibreOffice)",
  },
  "rtf->pdf": {
    candidates: [{ engine: "libreoffice", targetFormat: "pdf" }],
    description: "RTF to PDF",
  },
  "odt->pdf": {
    candidates: [{ engine: "libreoffice", targetFormat: "pdf" }],
    description: "ODT to PDF",
  },
  "html->pdf": {
    candidates: [{ engine: "libreoffice", targetFormat: "pdf" }],
    description: "HTML to PDF (full CSS layout, via LibreOffice)",
  },
  "docx->txt": {
    candidates: [
      { engine: "pandoc", fromFormat: "docx", toFormat: "plain" },
      { engine: "libreoffice", targetFormat: "txt" },
    ],
    description: "DOCX to plain text",
  },
  "docx->html": {
    candidates: [
      { engine: "pandoc", fromFormat: "docx", toFormat: "html" },
      { engine: "libreoffice", targetFormat: "html" },
    ],
    description: "DOCX to HTML",
  },
  "rtf->txt": {
    candidates: [
      { engine: "pandoc", fromFormat: "rtf", toFormat: "plain" },
      { engine: "libreoffice", targetFormat: "txt" },
    ],
    description: "RTF to plain text",
  },
  "odt->txt": {
    candidates: [
      { engine: "pandoc", fromFormat: "odt", toFormat: "plain" },
      { engine: "libreoffice", targetFormat: "txt" },
    ],
    description: "ODT to plain text",
  },
  "md->docx": {
    candidates: [{ engine: "pandoc", fromFormat: "markdown", toFormat: "docx" }],
    description: "Markdown to DOCX (via Pandoc)",
  },
};

export function enginesRequiredFor(operation: string): EngineName[] {
  const spec = DOCUMENT_OPERATIONS[operation];
  if (!spec) return [];
  return spec.candidates.map((c) => c.engine);
}
