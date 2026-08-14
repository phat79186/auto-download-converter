import { ZipWriter } from "./zipWriter.js";

export interface DocxParagraph {
  text: string;
  bold?: boolean;
  heading?: 1 | 2;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

function coreProps(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Auto Download Converter</dc:creator>
  <cp:lastModifiedBy>Auto Download Converter</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function paragraphXml(p: DocxParagraph): string {
  const runProps: string[] = [];
  if (p.bold) runProps.push("<w:b/>");
  if (p.heading) runProps.push(`<w:sz w:val="${p.heading === 1 ? 36 : 28}"/>`);
  const rPr = runProps.length ? `<w:rPr>${runProps.join("")}</w:rPr>` : "";
  const pPr = p.heading ? `<w:pPr><w:pStyle w:val="${p.heading === 1 ? "Heading1" : "Heading2"}"/></w:pPr>` : "";
  // Preserve leading/trailing spaces and encode newlines within a "paragraph" as line breaks.
  const runs = p.text
    .split("\n")
    .map((line, idx) => (idx === 0 ? "" : "<w:br/>") + `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("");
  return `<w:p>${pPr}<w:r>${rPr}${runs || '<w:t xml:space="preserve"></w:t>'}</w:r></w:p>`;
}

/** Builds a real, valid .docx from a flat list of paragraphs. */
export function buildDocx(paragraphs: DocxParagraph[]): Uint8Array {
  const bodyXml = paragraphs.map(paragraphXml).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new ZipWriter();
  zip.addFile("[Content_Types].xml", CONTENT_TYPES);
  zip.addFile("_rels/.rels", ROOT_RELS);
  zip.addFile("docProps/core.xml", coreProps());
  zip.addFile("word/document.xml", documentXml);
  return zip.build();
}

/** Convenience: plain text (paragraphs separated by blank lines) -> DOCX. */
export function textToDocx(text: string): Uint8Array {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => ({ text: block }));
  return buildDocx(paragraphs.length ? paragraphs : [{ text: "" }]);
}
