#!/usr/bin/env bash
# Installs the Auto Download Converter native messaging host for Chrome and/or
# Edge on Linux. Safe to re-run (idempotent).
set -euo pipefail

HOST_NAME="com.autodownloadconverter.host"
EXTENSION_ID="ffcbbkihmgommfpkcllgbciddbhnamol"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_HOST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="${HOME}/.local/share/auto-download-converter-host"

command -v node >/dev/null 2>&1 || { echo "Error: Node.js (>=18) is required but was not found on PATH." >&2; exit 1; }

echo "==> Installing dependencies and building the native host..."
( cd "$NATIVE_HOST_ROOT" && npm install --no-audit --no-fund && npm run build )

echo "==> Copying built host to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$NATIVE_HOST_ROOT/dist" "$INSTALL_DIR/"
cp "$NATIVE_HOST_ROOT/package.json" "$INSTALL_DIR/"

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

install_for_browser() {
  local target_dir="$1"
  local browser_name="$2"
  if [ -d "$(dirname "$target_dir")" ] || [ "$3" = "force" ]; then
    mkdir -p "$target_dir"
    echo "$MANIFEST_CONTENT" > "$target_dir/$HOST_NAME.json"
    echo "==> Registered for $browser_name: $target_dir/$HOST_NAME.json"
  fi
}

install_for_browser "$HOME/.config/google-chrome/NativeMessagingHosts" "Google Chrome" force
install_for_browser "$HOME/.config/chromium/NativeMessagingHosts" "Chromium" force
install_for_browser "$HOME/.config/microsoft-edge/NativeMessagingHosts" "Microsoft Edge" force

echo ""
echo "Done. Reload the extension, then check Options -> Engines to confirm the native host is detected."
echo "If the extension ID differs from $EXTENSION_ID (e.g. you rebuilt the extension without its signing key), edit:"
for d in "$HOME/.config/google-chrome/NativeMessagingHosts" "$HOME/.config/chromium/NativeMessagingHosts" "$HOME/.config/microsoft-edge/NativeMessagingHosts"; do
  echo "  $d/$HOST_NAME.json"
done
