#!/usr/bin/env bash
# 给 dsh-qq-relay 装「跨平台共享记忆」补丁：QQ 群也读写 ~/.bili-ai/memory.md
#
#   bash deploy/qq-memory/install.sh              # 装 + 重启 yuyu-dsh
#   bash deploy/qq-memory/install.sh --no-restart # 只装文件，自己挑时间重启
#
# 可覆盖：
#   PLUGIN_DIR=~/.dsh/plugins/dsh-qq-relay
#   MEMORY_FILE=~/.bili-ai/memory.md
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$HOME/.dsh/plugins/dsh-qq-relay}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

say() { printf '\n===== %s =====\n' "$*"; }

say "1) 检查插件"
[ -d "$PLUGIN_DIR/lib" ] || { echo "❌ 找不到插件目录：$PLUGIN_DIR"; exit 1; }
[ -n "$NODE_BIN" ] || { echo "❌ 找不到 node"; exit 1; }
echo "插件：$PLUGIN_DIR"
echo "node：$NODE_BIN ($("$NODE_BIN" -v))"
grep -m1 '"version"' "$PLUGIN_DIR/package.json" || true

say "2) 安装 memory.js"
cp "$HERE/memory.js" "$PLUGIN_DIR/lib/model/memory.js"
echo "→ $PLUGIN_DIR/lib/model/memory.js"

say "3) 给 relay.js 打补丁"
"$NODE_BIN" "$HERE/patch.mjs" "$PLUGIN_DIR"

say "4) 语法检查"
"$NODE_BIN" --check "$PLUGIN_DIR/lib/controller/relay.js"
"$NODE_BIN" --check "$PLUGIN_DIR/lib/model/memory.js"
echo "✔ 语法 OK"

say "5) 自检（不联网）"
MEM_FILE="${MEMORY_FILE:-$HOME/.bili-ai/memory.md}" "$NODE_BIN" --input-type=module -e "
import { memoryPersonaSuffix, memoryFile } from '$PLUGIN_DIR/lib/model/memory.js';
const f = memoryFile();
console.log('记忆文件：' + f);
const s = memoryPersonaSuffix();
console.log(s === '' ? '（读不到或为空，先跑一次私聊/群聊再看）' : '注入 ' + s.length + ' 字：' + s.slice(0, 120) + '…');
"

if [ "$RESTART" -eq 1 ]; then
  say "6) 重启 yuyu-dsh"
  if systemctl list-unit-files 2>/dev/null | grep -q '^yuyu-dsh\.service'; then
    systemctl restart yuyu-dsh
    sleep 2
    systemctl is-active yuyu-dsh
    journalctl -u yuyu-dsh -n 15 --no-pager | tail -15
  else
    echo "没找到 yuyu-dsh.service：请手动重启 DSH（前后台都行）后生效"
  fi
else
  say "6) 跳过重启（--no-restart）"
  echo "改完要重启 DSH 才生效：systemctl restart yuyu-dsh"
fi

say "完成"
echo "记忆文件：${MEMORY_FILE:-$HOME/.bili-ai/memory.md}"
echo "回滚    ：bash $HERE/uninstall.sh"
echo "升级插件后要重新跑本脚本（插件会覆盖 relay.js）"
