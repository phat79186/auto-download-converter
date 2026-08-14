import { textToHtml, textToMarkdown, htmlToText, textToPdf } from "./text/plainText.js";
import { textToRtf } from "./text/rtf.js";
import { textToDocx } from "../converters/docx/docxWriter.js";
import { markdownToHtml, markdownToPlainText, markdownToPdf } from "./text/markdown.js";
import { csvToHtml, csvToXlsx, csvToPdf } from "./data/csvConverters.js";
import { jsonToText, jsonToHtml, jsonToCsv, jsonToPdf } from "./data/jsonConverters.js";
import { xmlToText, xmlToHtml, xmlToPdf } from "./data/xmlConverters.js";
import { convertImage, imagesToPdf, type ImageOutputFormat } from "./image/imageConverter.js";

export interface BrowserConvertResult {
  bytes: ArrayBuffer;
  mimeType: string;
}

const utf8Encode = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;
const utf8Decode = (b: ArrayBuffer): string => new TextDecoder("utf-8").decode(b);

/**
 * Executes a single-file browser-native conversion. `conversionId` must be one
 * of the ids in CONVERSION_REGISTRY with browserCompatible=true - the caller
 * (the queue) is responsible for that check; this function trusts it and
 * throws a clear error for anything it doesn't recognize (never a silent no-op).
 */
export async function runBrowserConversion(conversionId: string, inputBytes: ArrayBuffer): Promise<BrowserConvertResult> {
  switch (conversionId) {
    case "txt->html":
      return { bytes: utf8Encode(textToHtml(utf8Decode(inputBytes))), mimeType: "text/html" };
    case "txt->md":
      return { bytes: utf8Encode(textToMarkdown(utf8Decode(inputBytes))), mimeType: "text/markdown" };
    case "txt->docx":
      return { bytes: textToDocx(utf8Decode(inputBytes)).buffer as ArrayBuffer, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    case "txt->rtf":
      return { bytes: utf8Encode(textToRtf(utf8Decode(inputBytes))), mimeType: "application/rtf" };
    case "txt->pdf":
      return { bytes: (await textToPdf(utf8Decode(inputBytes))).buffer as ArrayBuffer, mimeType: "application/pdf" };

    case "md->html":
      return { bytes: utf8Encode(markdownToHtml(utf8Decode(inputBytes))), mimeType: "text/html" };
    case "md->txt":
      return { bytes: utf8Encode(markdownToPlainText(utf8Decode(inputBytes))), mimeType: "text/plain" };
    case "md->pdf":
      return { bytes: (await markdownToPdf(utf8Decode(inputBytes))).buffer as ArrayBuffer, mimeType: "application/pdf" };

    case "csv->html":
      return { bytes: utf8Encode(csvToHtml(utf8Decode(inputBytes))), mimeType: "text/html" };
    case "csv->xlsx":
      return { bytes: csvToXlsx(utf8Decode(inputBytes)).buffer as ArrayBuffer, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    case "csv->pdf":
      return { bytes: (await csvToPdf(utf8Decode(inputBytes))).buffer as ArrayBuffer, mimeType: "application/pdf" };

    case "json->txt":
      return { bytes: utf8Encode(jsonToText(utf8Decode(inputBytes))), mimeType: "text/plain" };
    case "json->html":
      return { bytes: utf8Encode(jsonToHtml(utf8Decode(inputBytes))), mimeType: "text/html" };
    case "json->csv":
      return { bytes: utf8Encode(jsonToCsv(utf8Decode(inputBytes))), mimeType: "text/csv" };
    case "json->pdf":
      return { bytes: (await jsonToPdf(utf8Decode(inputBytes))).buffer as ArrayBuffer, mimeType: "application/pdf" };

    case "xml->txt":
      return { bytes: utf8Encode(xmlToText(utf8Decode(inputBytes))), mimeType: "text/plain" };
    case "xml->html":
      return { bytes: utf8Encode(xmlToHtml(utf8Decode(inputBytes))), mimeType: "text/html" };
    case "xml->pdf":
      return { bytes: (await xmlToPdf(utf8Decode(inputBytes))).buffer as ArrayBuffer, mimeType: "application/pdf" };

    case "html->txt":
      return { bytes: utf8Encode(htmlToText(utf8Decode(inputBytes))), mimeType: "text/plain" };

    case "jpg->png":
    case "jpeg->png":
    case "webp->png":
    case "bmp->png":
    case "gif->png":
      return imageConvert(inputBytes, "png");
    case "png->jpg":
      return imageConvert(inputBytes, "jpeg");
    case "webp->jpg":
      return imageConvert(inputBytes, "jpeg");
    case "png->webp":
    case "jpg->webp":
      return imageConvert(inputBytes, "webp");

    case "jpg->pdf":
    case "png->pdf":
    case "webp->pdf":
    case "bmp->pdf":
    case "gif->pdf":
      return { bytes: (await imagesToPdf([inputBytes])).buffer as ArrayBuffer, mimeType: "application/pdf" };

    default:
      throw new Error(`"${conversionId}" is not a browser-native conversion (it may require the native host).`);
  }
}

/** Batch variant used by "Images -> PDF" when the user selects multiple files to merge. */
export async function runBatchImagesToPdf(inputs: ArrayBuffer[]): Promise<BrowserConvertResult> {
  return { bytes: (await imagesToPdf(inputs)).buffer as ArrayBuffer, mimeType: "application/pdf" };
}

async function imageConvert(inputBytes: ArrayBuffer, target: ImageOutputFormat): Promise<BrowserConvertResult> {
  const result = await convertImage(inputBytes, target);
  return { bytes: result.bytes, mimeType: result.mimeType };
}
