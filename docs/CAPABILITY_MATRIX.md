# Capability matrix

This is the same list the extension uses internally (`extension/src/converters/registry.ts`) -
nothing is offered in the UI that isn't listed here with a real implementation behind it.

## No install needed (built into the extension)

| From | To | Notes |
|---|---|---|
| TXT | PDF, HTML, MD, DOCX, RTF | PDF is rendered via the browser's font engine (full Unicode/Vietnamese support), not a Latin-1-only vector font. |
| MD (Markdown) | PDF, HTML, TXT | Headings/lists/code blocks/links/bold/italic supported. In the PDF output, inline emphasis is flattened to plain text (block structure is preserved). |
| CSV | PDF, XLSX, HTML | XLSX via the SheetJS (`xlsx`) library. |
| JSON | TXT, HTML, CSV, PDF | CSV works best for a flat array of objects; nested values are preserved as a JSON string in their cell. |
| XML | TXT (pretty-printed), HTML, PDF | Own dependency-free parser/pretty-printer, no DOMParser needed. |
| HTML | TXT | Basic tag-stripping. Higher-fidelity extraction is available via Pandoc if the native host + Pandoc are installed. |
| JPG/JPEG, PNG, WEBP, BMP, GIF | PNG, JPG, WEBP (per the pairs below) | Via `OffscreenCanvas`. Animated GIF/WEBP: only the first frame is converted (standard browser decoding behavior). |
| JPG, PNG, WEBP, BMP, GIF | PDF | One page per image; multiple files selected together merge into one multi-page PDF. |

Image format pairs specifically supported: JPG to PNG, PNG to JPG (transparency flattened to
white), WEBP to PNG, PNG to WEBP, JPG to WEBP, BMP to PNG, GIF to PNG.

## Requires FFmpeg (via the native host)

| From | To |
|---|---|
| MP3 | WAV, OGG |
| WAV | MP3, OGG |
| M4A | MP3 |
| FLAC | MP3 |
| MP4 | MP3, WAV, WEBM |
| WEBM | MP4, MP3, WAV |
| MOV | MP4, MP3, WAV |
| MKV | MP4, MP3, WAV |

## Requires LibreOffice (via the native host)

| From | To |
|---|---|
| DOCX | PDF |
| RTF | PDF |
| ODT | PDF |
| HTML | PDF (full CSS layout) |

## Requires Pandoc (via the native host; falls back to LibreOffice for TXT/HTML where possible)

| From | To |
|---|---|
| DOCX | TXT, HTML |
| RTF | TXT |
| ODT | TXT |
| MD | DOCX |

## Explicitly NOT supported (and why)

- **Any conversion not listed above.** The Rules UI's "Convert to" dropdown only ever lists
  conversions that exist in the registry - there's no way to create a rule for an unsupported pair.
- **Animated GIF/WEBP to another animated format.** Browser image decoding only exposes the first
  frame; producing a new animation would require a from-scratch GIF/WEBP animation encoder, which
  isn't implemented. Converting the first frame to a still image works.
- **BMP as an output/target format.** Canvas's `convertToBlob` doesn't support encoding to BMP.
  (BMP as a *source* is fully supported.)
- **PDF to anything.** Parsing PDF content back out (for PDF to DOCX, PDF to TXT, etc.) isn't
  implemented in this version.
