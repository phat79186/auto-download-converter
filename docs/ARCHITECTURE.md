# Architecture

## The core constraint that shapes everything

A Manifest V3 Chromium extension has **no general API to read the contents of an arbitrary local
file**, even one it just downloaded. `chrome.downloads` tells you a completed download's full path
(`DownloadItem.filename`), but there is no `chrome.downloads.readFile()` or equivalent. The only
built-in ways around this - the user manually enabling "Allow access to file URLs" and using
`fetch('file://...')`, or a `<input type=file>` picker requiring a user gesture - either depend on a
manual setting the user has to remember to flip, or require the user to open a picker for every
file, which breaks the "fully automatic, no manual opening" requirement this project asks for.

**The native messaging host is therefore not just for FFmpeg/Pandoc/LibreOffice - it's the file I/O
bridge for the whole extension.** Even a "browser-native" conversion like TXT to PDF, which needs no
external engine at all, still goes through the native host to read the source bytes and write the
converted output, because that's the only way to do it without a manual file picker on every single
download.

```
                     Edge/Chrome Extension
                     ----------------------
 chrome.downloads --> downloadWatcher -> rule matching -> queue
                                              |
                                              v
                                       QueueProcessor
                                       /            \
                        browser-native /              \ needs
                           conversion /                \ engine
                                     |                  |
                         readFile/writeFile        convert (ffmpeg/
                         (native messaging)         pandoc/libreoffice)
                                     |                  |
                                     v                  v
                     Native Messaging Host (Node.js process, spawned
                     per-connection by the browser, talks over stdio)

                       security/pathValidation.ts   - every path must
                         resolve inside an allow-listed root, symlink
                         escapes rejected, Windows-invalid filenames
                         sanitized
                       security/outputValidation.ts - PDF/ZIP/media
                         signature checks; a 0-exit-code process with
                         a broken output is still a FAILURE
                       engines/{ffmpeg,pandoc,libreoffice}.ts
                         - explicit allow-listed operations only,
                         never a free-form command string

                                     |
                     spawns (execFile, never a shell)
                                     v
                       FFmpeg / Pandoc / LibreOffice
```

## Why conversions run where they run

| Conversion | Runs in | Why |
|---|---|---|
| TXT/MD/CSV/JSON/XML to PDF/HTML/DOCX/RTF/XLSX/etc. | **Extension (JS)** | These are pure text/data transforms and byte-level file format writers (a hand-written minimal-but-valid PDF writer, DOCX/OOXML writer, RTF encoder, and the `xlsx` (SheetJS) library for spreadsheets). No external binary needed. |
| Image format conversions (JPG/PNG/WEBP/BMP/GIF, images to PDF) | **Extension (JS)**, via `OffscreenCanvas` | `OffscreenCanvas` + `createImageBitmap` + `convertToBlob` are available in MV3 service workers and can decode/re-encode every format the browser itself can display, with no extra install. |
| Text/CSV/JSON/XML/Markdown to **PDF** specifically | **Extension (JS)**, via a canvas text rasterizer | Rather than a hand-rolled vector PDF font renderer limited to Latin-1/WinAnsi (which would mangle Vietnamese and other non-Latin-1 text), this renders each page through the browser's own font engine (`OffscreenCanvas` + `fillText`) and embeds the result as a page image in the PDF. This means full Unicode support out of the box, at the cost of the PDF text not being selectable - a documented, deliberate trade-off (see `extension/src/converters/pdf/textRasterizer.ts`). |
| MP3/WAV/OGG/M4A/FLAC, MP4/MOV/MKV/WEBM (video and audio-extraction) | **Native host -> FFmpeg** | No browser API does real audio/video transcoding. FFmpeg is the standard, reliable tool for this; the host detects it, validates it, and invokes it with an explicit allow-listed argument list per conversion (see `native-host/src/engines/ffmpeg.ts`). |
| DOCX/RTF/ODT/HTML to PDF | **Native host -> LibreOffice** | Full CSS/DOCX-layout-accurate rendering needs a real document layout engine. LibreOffice headless (`--convert-to pdf`) is the standard open-source tool for this. |
| DOCX/RTF/ODT to TXT/HTML, MD to DOCX | **Native host -> Pandoc** (falls back to LibreOffice for TXT/HTML if Pandoc isn't installed) | Pandoc is lighter-weight than LibreOffice for pure structural/text conversions and handles Markdown natively. |

## The conversion registry is the single source of truth

`extension/src/converters/registry.ts` lists every conversion this extension claims to support,
each tagged with whether it needs the native host and which engine. The Rules UI's dropdowns, the
Engines page's capability matrix, and the actual dispatcher (`browserConvert.ts` /
`queueProcessor.ts`) all read from this same list - nothing is offered in the UI that doesn't have
a real implementation behind it.

## Failure is a first-class state, not an afterthought

Every conversion path - browser-native and native-host - ends with an explicit validation step
before a job is marked "completed":

- **Native host media conversions**: `ffprobe` re-reads the output file and confirms it actually
  has the expected audio/video streams. A `0` exit code from FFmpeg alone is not trusted.
- **Native host document conversions**: output is checked for the correct file signature
  (`%PDF-` plus a trailing `%%EOF` for PDF, the ZIP `PK` signature for DOCX/ODT).
- **Browser-native conversions**: `QueueProcessor` treats a zero-byte (or missing) output as a
  **failure**, never a success, regardless of what any earlier step reported.
- All writes go through a temp-file-then-atomic-rename pattern
  (`native-host/src/security/tempPath.ts`), so a crash or failure mid-write can never leave a
  half-written file at the final destination path.

## Queue persistence and crash recovery

The queue is stored in `chrome.storage.local`, not in memory, so it survives service worker
restarts (which MV3 does routinely - service workers are terminated when idle). On startup,
`QueueStore.markStaleProcessingAsInterrupted()` finds any job that was left in the `"processing"`
state (meaning the worker died mid-conversion) and marks it `"interrupted"` rather than silently
resuming or silently dropping it - the underlying `ffmpeg`/`soffice` child process is gone with the
old service worker, so there is nothing to actually resume.

## Security notes

- The native host never builds a shell command string. Every external process is spawned via
  Node's `execFile` with an argument array, and every conversion "operation" (e.g. `"mp4->mp3"`)
  is looked up in a fixed table (`FFMPEG_OPERATIONS`, `DOCUMENT_OPERATIONS`) - the extension can
  request an operation *name*, never arbitrary flags or a command string.
- Every file path (input or output) is resolved and checked against an explicit `allowedRoots`
  list before any filesystem access; symlinks are resolved (`fs.realpathSync`) and re-checked so a
  symlink cannot be used to escape the allowed directories.
- The native messaging host manifest's `allowed_origins` is pinned to this extension's specific ID
  (via a fixed public key in `manifest.json`), so no other extension can talk to the installed host.
