# Troubleshooting

## "Specified native messaging host not found"

This exact message means the browser looked up the registered host by name and found nothing
usable - it's the symptom of two different underlying problems:

1. **The installer's manifest JSON had a UTF-8 BOM** (a known Windows PowerShell 5.1
   `Set-Content -Encoding UTF8` quirk - it silently prepends a byte-order-mark, which breaks
   Chrome/Edge's JSON parser for the manifest file). Fixed in this repo's
   `install-windows.ps1` - re-run it; it now writes the manifest without a BOM and
   **verifies** the result (reads the file back, checks for a BOM, validates the JSON, and reads
   back the registry value) before declaring success. If it prints any `FAIL:` lines, that tells
   you exactly what's still wrong.
2. **The installer was never run, or was run for a different Windows user account than the one
   running the browser** (registration is per-user, under `HKCU`).

To confirm manually: open PowerShell and run
```powershell
Get-ItemProperty "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.autodownloadconverter.host"
```
It should print a `(default)` value pointing at a real `.json` file. Open that file - it should
start with `{` with no stray character before it (a BOM shows up as an invisible character or as
`ï»¿` if viewed in a plain-ASCII-assuming tool).

## "Access to the specified native messaging host is forbidden"

Different from "not found" - the manifest *was* located, but its `allowed_origins` doesn't include
your extension's actual ID. Check `edge://extensions` for the real ID and compare it to the
`allowed_origins` entry in the installed manifest JSON (paths listed in NATIVE_HOST_INSTALL.md).

## "Native host disconnected: ..." / "Native host disconnected unexpectedly."

1. **Confirm it's installed**: re-run the installer for your OS (see NATIVE_HOST_INSTALL.md) - it's
   safe to run again.
2. **Confirm Node.js is on PATH**: run `node --version` in a terminal. If that fails, the wrapper
   script the installer created can't run either. Reinstall Node.js and re-run the installer.
3. **Confirm the extension ID matches**: open `edge://extensions`, check the ID under "Auto Download
   Converter". Compare it to the `allowed_origins` entry in the installed native host manifest (see
   the path list at the bottom of NATIVE_HOST_INSTALL.md). If they don't match, edit the manifest
   JSON's `allowed_origins` to the correct `chrome-extension://<your-id>/`.
4. **Reload the extension** after any of the above (`edge://extensions` → reload icon).
5. **Check the browser's native messaging log**: launch Edge/Chrome from a terminal and reproduce
   the issue - native messaging connection errors are printed to that console.

## A specific conversion says "requires FFmpeg" / "requires LibreOffice" / "requires Pandoc"

That engine isn't installed, or isn't on PATH, or the path configured in **Options → Engines**
is wrong. Fix:
- Install the missing engine (see NATIVE_HOST_INSTALL.md for platform-specific commands).
- Or set an explicit path in **Options → Engines** → type the full path to the executable → Save.
- Re-check the Engines page - it re-detects on every page load.

## "FFmpeg exited successfully but the output file is invalid"

This means FFmpeg returned exit code 0 but `ffprobe` couldn't find the expected audio/video stream
in the result - i.e., the job correctly failed rather than reporting a fake success. Common causes:
- The **source file itself is corrupted or not really the format its extension claims**. Try
  opening the original file in a media player to confirm it plays.
- An unusual codec inside an MKV/WEBM container that the installed FFmpeg build doesn't support.
  Check `ffmpeg -version` output for which codecs your build includes, or install a fuller FFmpeg
  build (e.g. the "full" builds from gyan.dev on Windows, which include most common codecs).

## A conversion is stuck "Processing" forever

If the browser or computer restarted while a job was processing, it will show as **Interrupted**
(not stuck) the next time the extension starts - the queue survives restarts and detects this
automatically. If you're seeing "Processing" for an unusually long time on a *currently running*
browser, large video files can genuinely take minutes; check Task Manager/Activity Monitor for an
`ffmpeg` or `soffice` process actually using CPU. If there's no such process, click **Cancel** on
the job in **Options → Queue**, then **Retry**.

## Downloaded file isn't being converted at all

Check, in order:
1. **Options → Rules** - is there an enabled rule matching that file extension?
2. **Popup** - is monitoring turned on (green dot, "Monitoring downloads")?
3. Was the file flagged by the browser as dangerous/unconfirmed? The extension deliberately skips
   files that aren't in the `safe`/`accepted` danger state, to avoid touching something the browser
   itself hasn't cleared. Confirm/keep the download first.
4. Is the file 0 bytes? Zero-byte files are always skipped (see ARCHITECTURE.md).
5. **Options → Queue** - is the job sitting there with status "Waiting"? That means the matching
   rule has "Convert automatically" turned off - click into the job or flip that rule's setting.

## "Skipped (output already exists)" notification

Your rule's collision behavior is set to **Skip** and a file with the target name already exists.
Either delete/rename the existing output, or change the rule's "If a file with that name exists"
setting to **Add (1), (2)…** or **Overwrite**.

## I want to convert a file that wasn't downloaded through the browser

Use the popup's **"Convert a file now"** section - it works for any file you pick via the file
selector, for the browser-native conversions (text/data/image formats), even without the native
host installed. Audio/video/Office-document conversions currently require going through the
automatic download-triggered flow.

## Something looks broken in the UI after an update

Rebuild and reload:
```bash
npm run build --workspace=extension
```
Then `edge://extensions` → reload icon on the extension card. Hard-refresh any open Options tab.
