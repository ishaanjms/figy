#!/usr/bin/env bash
set -euo pipefail

LABEL="com.figy.ai-server"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  rm "$PLIST_PATH"
fi

echo "Figy AI server autostart removed."
