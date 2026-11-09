#!/bin/bash
echo "===== 服务状态 ====="
systemctl is-active yuyu-dsh yuyu-bridge 2>&1
echo
echo "--- dsh 最近日志 ---"
journalctl -u yuyu-dsh -n 8 --no-pager 2>&1 | tail -8
echo
echo "--- bridge 最近日志 ---"
journalctl -u yuyu-bridge -n 8 --no-pager 2>&1 | tail -8
echo
echo "===== 容器 ====="
docker ps -a --format '{{.Names}} | {{.Status}}' 2>&1
echo
echo "===== 相关进程 ====="
ps -eo pid,user,etime,args 2>/dev/null | grep -E 'bridge\.mjs|/usr/bin/dsh|dsh web' | grep -v grep
echo
echo "===== 监听端口 ====="
ss -tlnp 2>/dev/null | grep -E ':3080|:3001|:6099'
echo
echo "===== /tmp 残留 ====="
ls -1 /tmp/*.md /tmp/*.json /tmp/*.mjs /tmp/*.tar.gz 2>/dev/null
echo
echo "===== 仓库状态 ====="
cd /opt/yuyu 2>/dev/null && git status --short 2>&1 | head -10
echo
echo "===== 插件目录 ====="
ls -1 /root/.dsh/plugins 2>&1
echo
echo "===== 数据目录 ====="
ls -1 /root/.bili-ai 2>&1
