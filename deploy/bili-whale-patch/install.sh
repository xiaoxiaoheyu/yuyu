#!/usr/bin/env bash
# 给 dsh-bili-whale 打「每天回复同一个陌生人的次数」补丁（幂等，升级后重跑即可）
#
#   bash deploy/bili-whale-patch/install.sh            # 安装 + 重启 yuyu-dsh
#   bash deploy/bili-whale-patch/install.sh --no-restart
#
# 会改四个文件（每个都留 .bak-yuyu 备份）：
#   lib/client.js            设置页多一行「每天回复同一个陌生人的次数」
#   lib/index.js             配置默认值 strangerDaily=4 + 保存时夹到 0–50
#   tools/commands/comment.mjs  发评论前按人按天计数；到上限拒发，最后一条提示加说明
#   tools/lib/privacy-guard.mjs  comment.mjs 依赖它（服务器上原来缺，顺带补上）
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-/root/.dsh/plugins/dsh-bili-whale}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

[ -d "$PLUGIN_DIR/lib" ] || { echo "❌ 找不到插件：$PLUGIN_DIR"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "❌ 需要 root：sudo bash $0"; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"
install_one() {  # $1 = 相对路径
  local rel="$1"
  cp "$PLUGIN_DIR/$rel" "$PLUGIN_DIR/$rel.bak-yuyu-$TS"
  cp "$HERE/$rel" "$PLUGIN_DIR/$rel"
  node --check "$PLUGIN_DIR/$rel" >/dev/null
  echo "✔ $rel"
}

install_one lib/client.js
install_one lib/index.js
install_one tools/commands/comment.mjs
install_one tools/lib/privacy-guard.mjs

echo
grep -n 'strangerDaily' "$PLUGIN_DIR/lib/index.js" | head -3

if [ "$RESTART" -eq 1 ]; then
  systemctl restart yuyu-dsh
  sleep 6
  systemctl is-active yuyu-dsh
  journalctl -u yuyu-dsh -n 5 --no-pager | tail -5
else
  echo "改完要重启才生效：systemctl restart yuyu-dsh"
fi
