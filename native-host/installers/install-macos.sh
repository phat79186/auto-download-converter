#!/usr/bin/env bash
# Installs the Auto Download Converter native messaging host for Chrome and/or
# Edge on macOS. Safe to re-run (idempotent).
set -euo pipefail

HOST_NAME="com.autodownloadconverter.host"
EXTENSION_ID="ffcbbkihmgommfpkcllgbciddbhnamol"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_HOST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="${HOME}/Library/Application Support/AutoDownloadConverterHost"

command -v node >/dev/null 2>&1 || { echo "Error: Node.js (>=18) is required but was not found on PATH." >&2; exit 1; }

echo "==> Installing dependencies and building the native host..."
( cd "$NATIVE_HOST_ROOT" && npm install --no-audit --no-fund && npm run build )

echo "==> Copying built host to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$NATIVE_HOST_ROOT/dist" "$INSTALL_DIR/"

WRAPPER="$INSTALL_DIR/run.sh"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
exec node "$INSTALL_DIR/dist/index.js"
EOF
chmod +x "$WRAPPER"

MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Auto Download Converter native messaging host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF
)

for target in \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
do
  mkdir -p "$target"
  echo "$MANIFEST_CONTENT" > "$target/$HOST_NAME.json"
  echo "==> Registered: $target/$HOST_NAME.json"
done

echo ""
echo "Done. Reload the extension, then check Options -> Engines to confirm the native host is detected."
