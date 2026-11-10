#!/usr/bin/env bash
# 安装 NapCat 自愈守护：健康检查脚本 + systemd timer（每 2 分钟）
#
#   sudo bash deploy/napcat/install.sh
#
# 只装守护，不动容器；容器用 deploy/napcat/compose.yaml 起。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE=/opt/napcat-guard
[ "$(id -u)" -eq 0 ] || { echo "需要 root：sudo bash $0"; exit 1; }

echo "== 1) 安装脚本到 $BASE =="
mkdir -p "$BASE/state"
cp "$HERE/guard.mjs" "$HERE/guard.sh" "$BASE/"
chmod +x "$BASE/guard.sh"
node --check "$BASE/guard.mjs"
echo "  guard.mjs 语法 OK"

echo "== 2) 安装 systemd 单元 =="
cp "$HERE/napcat-guard.service" "$HERE/napcat-guard.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now napcat-guard.timer
systemctl list-timers napcat-guard.timer --no-pager | head -3

echo "== 3) 立刻跑一次 =="
systemctl start napcat-guard.service
sleep 2
systemctl status napcat-guard.service --no-pager -n 5 | tail -5
echo
echo "日志：$BASE/guard.log"
echo "手动检查：node $BASE/guard.mjs check; echo exit=\$?"
echo "卸载：systemctl disable --now napcat-guard.timer && rm -rf /etc/systemd/system/napcat-guard.* $BASE"
