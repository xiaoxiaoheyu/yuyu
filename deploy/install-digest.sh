#!/usr/bin/env bash
# 在云服务器上装「每天 08:00 的鱼鱼简报」：
#   B 站热门 5 条 + 成都今日天气 → 私聊 + 群 1108739719
#
# 用法（在服务器上，仓库根目录执行）：
#   bash deploy/install-digest.sh --check   # 只体检 + 预览，不发消息、不动 cron
#   sudo bash deploy/install-digest.sh      # 安装 cron，并立刻真发一次
#
# 可覆盖的变量：
#   APP_DIR=/opt/yuyu       仓库位置
#   NODE_BIN=/usr/bin/node  node 路径
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yuyu}"
DIGEST_DIR="$APP_DIR/qq-private"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
CRON_FILE=/etc/cron.d/yuyu-digest
LOG_FILE="$DIGEST_DIR/digest.log"

say() { printf '\n===== %s =====\n' "$*"; }

say "1) 环境检查"
[ -d "$DIGEST_DIR" ] || { echo "❌ 找不到 $DIGEST_DIR（仓库没放到 $APP_DIR？）"; exit 1; }
[ -f "$DIGEST_DIR/config.json" ] || { echo "❌ 缺少 $DIGEST_DIR/config.json"; exit 1; }
[ -n "$NODE_BIN" ] || { echo "❌ 找不到 node，先装 Node 20"; exit 1; }
echo "node   : $NODE_BIN ($("$NODE_BIN" -v))"
echo "目录   : $DIGEST_DIR"
echo "时区   : $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo '未知')"
echo "crontab: $(command -v crontab || echo '❌ 没装 cron')"

say "2) 简报配置"
"$NODE_BIN" -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log("  digestTopN     :", c.digestTopN);
console.log("  digestTargets  :", JSON.stringify(c.digestTargets ?? c.digestTarget));
console.log("  digestGroupId  :", c.digestGroupId ?? c.groups?.[0] ?? "（缺）");
console.log("  ownerQq        :", c.ownerQq);
console.log("  cityName       :", c.cityName);
console.log("  onebotWs       :", c.onebotWs);
' "$DIGEST_DIR/config.json"

say "3) 预览（不发送）"
cd "$DIGEST_DIR"
"$NODE_BIN" daily-digest.mjs --dry

if [ "${1:-}" = "--check" ]; then
  say "只体检，结束（cron 未改动）"
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo
  echo "❌ 写 /etc/cron.d 需要 root，请用：sudo bash deploy/install-digest.sh"
  exit 1
fi

say "4) 写 cron：每天 08:00（Asia/Shanghai）"
cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
CRON_TZ=Asia/Shanghai
0 8 * * * root cd $DIGEST_DIR && /usr/bin/flock -n /tmp/yuyu-digest.lock $NODE_BIN daily-digest.mjs >> $LOG_FILE 2>&1
EOF
chmod 644 "$CRON_FILE"
systemctl restart cron 2>/dev/null || service cron restart
echo "已写入 $CRON_FILE："
cat "$CRON_FILE"

say "5) 立刻真发一次（私聊 + 群）"
"$NODE_BIN" daily-digest.mjs

say "完成"
echo "看日志 : tail -f $LOG_FILE"
echo "改时间 : 编辑 $CRON_FILE 后 systemctl restart cron"
echo "卸载   : rm $CRON_FILE && systemctl restart cron"
