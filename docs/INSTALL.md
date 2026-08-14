# Installing the extension

## 1. Build it

```bash
cd auto-download-converter
npm install
npm run build --workspace=extension
```

This produces a loadable, unpacked extension at `extension/dist/`.

## 2. Load it in Edge or Chrome

1. Go to `edge://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/dist/` folder.

The extension should appear with the name "Auto Download Converter". Pin it to the toolbar for
quick access to the popup.

> **Extension ID**: this repo's `manifest.json` includes a fixed signing key so the extension
> always loads with the same ID: `ffcbbkihmgommfpkcllgbciddbhnamol`. This matters because the
> native host's manifest (installed separately) is locked to that exact ID - if you change
> `manifest.json`'s `key` field, generate a new one and update
> `native-host/installers/manifest/com.autodownloadconverter.host.json.template` and the
> `EXTENSION_ID` in the installer scripts to match.

## 3. Install the native host

Most conversions - including simple ones like TXT to PDF, because of how Chromium extension
sandboxing works (see [ARCHITECTURE.md](ARCHITECTURE.md)) - need the native host installed too.
Follow [NATIVE_HOST_INSTALL.md](NATIVE_HOST_INSTALL.md).

## 4. Verify it's working

1. Click the extension icon → the popup should show "Monitoring downloads" with a green dot.
2. Open **Options** (gear icon) → **Engines** → you should see "Native host connected" and, if
   FFmpeg/Pandoc/LibreOffice are installed, each listed with a version number.
3. Go to **Rules** → create a rule: file type `.txt`, convert to `pdf`, save to "Same folder".
4. Download any `.txt` file. Within a few seconds it should appear converted next to the original.
   Check **Queue** (should show it moving through queued → processing → completed) and **History**.

## Rebuilding after making changes

```bash
npm run build --workspace=extension
```

Then in `edge://extensions`, click the reload icon on the extension's card.

## Running the test suite

```bash
npm run test --workspace=extension
```
