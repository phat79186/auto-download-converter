#!/usr/bin/env bash
set -euo pipefail
HOST_NAME="com.autodownloadconverter.host"

echo "Removing native messaging host manifests..."
for f in \
  "$HOME/.config/google-chrome/NativeMessagingHosts/$HOST_NAME.json" \
  "$HOME/.config/chromium/NativeMessagingHosts/$HOST_NAME.json" \
  "$HOME/.config/microsoft-edge/NativeMessagingHosts/$HOST_NAME.json" \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json" \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json" \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json"
do
  if [ -f "$f" ]; then
    rm "$f"
    echo "  removed $f"
  fi
done

rm -rf "$HOME/.local/share/auto-download-converter-host" 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/AutoDownloadConverterHost" 2>/dev/null || true

echo "Done."
