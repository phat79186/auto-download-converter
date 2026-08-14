# Privacy

**Auto Download Converter processes everything locally on your computer.**

## What this extension does NOT do

- It does **not** upload your files anywhere.
- It does **not** send file contents, filenames, or conversion history to any server.
- It does **not** use any third-party conversion API by default, and none is bundled.
- It does **not** include analytics, telemetry, or tracking of any kind.
- It does **not** execute downloaded files.
- It does **not** show ads.

## What it does do

- **Reads and writes files on your computer** through the native messaging host, strictly limited
  to directories you download into (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for exactly how
  this is scoped and validated - the host refuses to touch anything outside the allowed folders,
  refuses path traversal, and refuses to follow symlinks that escape those folders).
- **Runs FFmpeg / Pandoc / LibreOffice locally** (only if you've installed them) to perform audio,
  video, and Office-document conversions. These are the same open-source tools you could run
  yourself from a terminal; the extension just automates calling them with validated arguments.
- **Stores your rules, queue, and conversion history in `chrome.storage.local`** - i.e., on your
  own machine, tied to your browser profile. This data is never transmitted anywhere.
- **Shows local desktop notifications** (via the standard `chrome.notifications` API) when a
  conversion finishes or fails, if you've enabled that in Settings.

## Data you can clear at any time

- **History** → Options → History → "Clear history".
- **Queue** → Options → Queue → "Clear finished".
- **Rules and Settings** → delete/edit directly in Options, or remove the extension entirely, which
  deletes all of its `chrome.storage.local` data per Chrome/Edge's standard extension-removal behavior.

## Native host and your files

The native host is a separate program you install once (see
[docs/NATIVE_HOST_INSTALL.md](docs/NATIVE_HOST_INSTALL.md)). It only communicates with this
specific extension (enforced by Chrome's native messaging `allowed_origins` mechanism, tied to a
fixed extension ID) over stdio - it does not open network ports and does not accept connections
from anything else. Every file path it's asked to touch is validated against an explicit allow-list
of directories before any read, write, or delete happens.

## Questions or concerns

This is a local, open-source tool. Read the source - particularly
`native-host/src/security/pathValidation.ts` and `native-host/src/security/outputValidation.ts` -
to verify these claims yourself.
