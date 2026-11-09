#!/usr/bin/env bash
# 卸载「跨平台共享记忆」补丁：恢复 relay.js 备份，删掉 memory.js
#   bash deploy/qq-memory/uninstall.sh
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$HOME/.dsh/plugins/dsh-qq-relay}"
RELAY="$PLUGIN_DIR/lib/controller/relay.js"
BACKUP="$RELAY.yuyu-memory.bak"

if [ -f "$BACKUP" ]; then
  cp "$BACKUP" "$RELAY"
  echo "✔ 已恢复 $RELAY"
else
  echo "⚠️ 没有备份 $BACKUP，relay.js 未改动"
fi

rm -f "$PLUGIN_DIR/lib/model/memory.js" && echo "✔ 已删除 memory.js"

if systemctl list-unit-files 2>/dev/null | grep -q '^yuyu-dsh\.service'; then
  systemctl restart yuyu-dsh && echo "✔ 已重启 yuyu-dsh"
else
  echo "手动重启 DSH 后生效"
fi
