# Installing the native messaging host

The native host is what lets the extension actually read/write files and run
FFmpeg/Pandoc/LibreOffice. See [ARCHITECTURE.md](ARCHITECTURE.md) for why it's required even for
"simple" conversions like TXT to PDF.

## Prerequisites

- **Node.js 18+** on your PATH (the host itself is a Node program).
- Optional, install whichever you want conversions for:
  - **FFmpeg** - for MP3/WAV/OGG/M4A/FLAC and MP4/MOV/MKV/WEBM conversions.
  - **LibreOffice** - for DOCX/RTF/ODT/HTML to PDF.
  - **Pandoc** - for DOCX/RTF/ODT to TXT/HTML and Markdown to DOCX (used when installed; falls back
    to LibreOffice for TXT/HTML output if Pandoc isn't present).

  You don't need all three - **Options → Engines** in the extension shows exactly what's detected,
  and any conversion needing a missing engine fails with a clear message rather than pretending to
  work.

## Windows

```powershell
cd native-host\installers
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

This builds the host, copies it to `%LOCALAPPDATA%\AutoDownloadConverterHost`, writes its native
messaging manifest there, and registers it for both Chrome and Edge under
`HKCU:\Software\{Google\Chrome,Microsoft\Edge}\NativeMessagingHosts\com.autodownloadconverter.host`.

To install FFmpeg/Pandoc/LibreOffice on Windows, the simplest route is usually:
```powershell
winget install Gyan.FFmpeg
winget install JohnMacFarlane.Pandoc
winget install TheDocumentFoundation.LibreOffice
```
(or download installers directly from ffmpeg.org, pandoc.org, libreoffice.org). After installing,
either make sure they're on PATH, or set a custom path per-engine in **Options → Engines**.

## macOS

```bash
cd native-host/installers
chmod +x install-macos.sh
./install-macos.sh
```

Installs to `~/Library/Application Support/AutoDownloadConverterHost` and registers the manifest
for Chrome, Edge, and Chromium.

```bash
brew install ffmpeg pandoc --cask libreoffice
```

## Linux

```bash
cd native-host/installers
chmod +x install-linux.sh
./install-linux.sh
```

Installs to `~/.local/share/auto-download-converter-host` and registers the manifest for Chrome,
Chromium, and Edge (`~/.config/{google-chrome,chromium,microsoft-edge}/NativeMessagingHosts/`).

```bash
sudo apt install ffmpeg pandoc libreoffice   # Debian/Ubuntu
```

## Uninstalling

- Windows: `powershell -ExecutionPolicy Bypass -File native-host\installers\uninstall-windows.ps1`
- macOS/Linux: `bash native-host/installers/uninstall.sh`

## Verifying it's actually working (not just "installed")

Reload the extension, open **Options → Engines**. You should see:
- **"Native host connected"** at the top.
- A table listing FFmpeg/Pandoc/LibreOffice, each showing **Installed** with a real version number
  if present on your system, or **Not detected** with an explanation if not.

If it says **"Native host not detected"**, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## If your extension ID isn't the default one

The installers register the native host with `allowed_origins` locked to
`chrome-extension://ffcbbkihmgommfpkcllgbciddbhnamol/`, which is the ID this repo's
`extension/manifest.json` always produces (it has a fixed signing key). If you changed that key, or
Chrome/Edge otherwise assigned a different ID (check `edge://extensions` with Developer mode on),
edit the installed manifest JSON's `allowed_origins` to match:

- Windows: `%LOCALAPPDATA%\AutoDownloadConverterHost\com.autodownloadconverter.host.json`
- macOS: `~/Library/Application Support/{Google/Chrome,Microsoft Edge}/NativeMessagingHosts/com.autodownloadconverter.host.json`
- Linux: `~/.config/{google-chrome,microsoft-edge}/NativeMessagingHosts/com.autodownloadconverter.host.json`
