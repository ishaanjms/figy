#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(command -v node)"
LABEL="com.figy.ai-server"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$PLIST_DIR" "$LOG_DIR"

if launchctl list "$LABEL" >/dev/null 2>&1; then
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$PROJECT_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/figy-ai-server.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/figy-ai-server.error.log</string>
</dict>
</plist>
PLIST

launchctl load "$PLIST_PATH"

echo "Figy AI server autostart installed."
echo "It will start at login and is running as: $LABEL"
echo "App URL: http://127.0.0.1:4317"
