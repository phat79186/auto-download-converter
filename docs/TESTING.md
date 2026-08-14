# Testing report

This project was built and tested inside a sandboxed Linux container that happened to have
FFmpeg 6.1.1, Pandoc 3.1.3, and LibreOffice 24.2.7.2 preinstalled, plus Python with `pypdf`,
`python-docx`, and `openpyxl` available for independent, third-party validation of generated files.
**There was no real Chromium/Edge browser available** (no GUI, no installable `chromium-browser` -
the sandbox's snap-based package couldn't be installed). This section is an honest account of what
that did and didn't let us verify.

## Fully implemented and verified with real, independent tools

**Native host** (57 automated tests, all passing, against real generated fixtures):
- FFmpeg conversions (mp3/wav/ogg, m4a to mp3, flac to mp3, mp4 to mp3/wav/webm, webm to mp4,
  mov to mp4, mkv to mp4) - run against **real** ffmpeg-generated audio/video fixtures, output
  validated with `ffprobe` re-reading the actual stream contents, not just checking the exit code.
- LibreOffice conversions (docx/rtf/odt/html to pdf) - run against real fixtures, output validated
  by reading the `%PDF-`/`%%EOF` signature.
- Pandoc conversions (docx to txt/html, md to docx) - run against real fixtures.
- Path security: traversal, symlink-escape, and Windows-reserved-name rejection tested with real
  filesystem operations (creating real symlinks and confirming they're rejected), not just string
  matching.
- The native messaging wire protocol (length-prefixed JSON framing, including chunked transfer for
  a real 2MB file) tested directly.
- **A full end-to-end run through the actually-installed host binary**: the Linux installer script
  was run for real in the sandbox, and a Python script then spoke the real native-messaging wire
  protocol to the installed wrapper script - `ping`, `detect` (found all 3 real engines), a real
  `mp3->wav` conversion, and a real chunked `readFile` - all verified byte-for-byte correct. This is
  the closest thing to a full integration test possible without an actual browser.

**Extension - browser-independent logic** (127 automated Vitest tests, all passing):
- **PDF writer**: output independently validated with `pdfinfo`, `pdftoppm` (actually rasterizes
  the PDF - would fail on a malformed file), and `pypdf` (`strict=True` parsing).
- **DOCX writer**: independently validated with `python-docx` (including round-tripping Vietnamese
  text with diacritics) and by converting through real LibreOffice.
- **RTF writer**: validated by converting through real LibreOffice, including Vietnamese text via
  the `\uN` Unicode-escape mechanism.
- **XLSX (via SheetJS)**: independently validated with `openpyxl`.
- **CSV/JSON/XML parsers** (hand-written, no dependencies): tested against the real sample fixtures
  and, for XML, cross-validated against Python's `xml.etree`.
- **Markdown parser**: tested for headings/lists/bold/italic/code/links and correct HTML escaping.
- **Rule engine, filename templating, collision resolution, all storage layers, the queue
  processor's orchestration logic, and the native-messaging client's chunking/timeout/disconnect
  handling**: all tested with dependency-injected fakes (in-memory stores, fake ports/backends),
  since these are pure orchestration logic that doesn't need a real browser to verify correctness.
- The full extension bundle (`npm run build`) was run for real via esbuild; the resulting
  `background.js`/`popup.js`/`options.js` were checked with `node --check` for valid JS syntax, and
  `manifest.json` plus every file it references were confirmed present in `dist/`.

## Implemented but NOT executable in this environment (no real browser)

These are written to the documented Chrome/Edge extension APIs and either directly exercise logic
that *is* covered by the tests above (with the chrome.* calls as a thin wrapper), or are UI code
that renders from tested data:

- `chrome.downloads.onChanged` listener wiring (`background/index.ts`) - the decision logic it
  calls (`evaluateDownload`, `matchRule`, `buildJobPaths`) is fully unit-tested; the listener
  registration itself is a few lines of glue that can't run outside a real extension context.
- `OffscreenCanvas`-based image conversion and the canvas text rasterizer (used for the browser-side
  PDF text rendering) - these use documented, standard MV3 service-worker APIs, but a service
  worker with a real Chromium `OffscreenCanvas` implementation wasn't available to actually invoke
  them here. The PDF *assembly* code they feed into (`buildPdfFromJpegPages`) is tested with real
  JPEG bytes.
- Popup and Options page rendering/interaction (DOM manipulation, `chrome.runtime.sendMessage`
  round-trips) - the message *handlers* on the background side are the same functions exercised
  indirectly by the store/queue tests; the actual click-through UI flow needs a real browser to
  verify.
- Native messaging host **registration** with a real installed Chrome/Edge (as opposed to the
  installed host binary itself, which was verified end-to-end as described above) - registering a
  Windows registry key or a macOS/Linux manifest file and having an actual browser discover and
  successfully launch it is standard, well-documented Chrome platform behavior, but wasn't
  something this sandbox could exercise.

## What you should do to close this gap

Load `extension/dist/` as an unpacked extension in real Edge/Chrome (Developer mode -> Load
unpacked) and run through docs/INSTALL.md's verification steps and the acceptance-test workflow:
create a `.txt -> .pdf` rule, download a real `.txt` file, confirm it converts automatically
without manually opening it, and check that History/Queue reflect it accurately. Please report
anything that doesn't match this document.

## Known limitations (by design, documented, not hidden)

- Vector-text PDF output isn't offered; all PDF text output is rasterized through the browser's
  font engine (full Unicode support, but not selectable text) - see ARCHITECTURE.md.
- Animated GIF/WEBP conversion only processes the first frame.
- BMP is only supported as a source format, not a target.
- JSON to CSV flattening JSON-stringifies nested objects/arrays into their cell rather than
  exploding them into more columns.
- Markdown to PDF preserves block structure (headings/lists/code) but flattens inline bold/italic/
  link formatting to plain text.
