#!/usr/bin/env bash
# NapCat 自愈守护 v2（由 napcat-guard.timer 每 2 分钟调用）
#
# v2 修的问题（2026-11-11）：
#   v1 只要 3001 连不上就重启 → 而"等扫码"时 3001 本来就不通 →
#   每 4 分钟杀一次容器，二维码永远扫不上，形成重启风暴。
#
# 现在的判定顺序：
#   0) 容器没在跑 → docker start（不算重启）
#   1) 容器启动不到 4 分钟 → 直接跳过（QQ 客户端加载要 1–3 分钟）
#   2) guard.mjs check
#        exit 0 → 在线；若之前是掉线状态，私聊通知主人
#        exit 2 → OneBot 在但未登录 → 不重启，记日志
#        exit 1 → 连不上：
#              · 最近 15 分钟日志里有"二维码/快速登录错误/请扫描" → 判定在等扫码，不重启，只记一次
#              · 否则计数，连续 2 次 → 重启（每小时最多 3 次，防风暴）
set -u
BASE=/opt/napcat-guard
STATE="$BASE/state"
LOG="$BASE/guard.log"
NODE=/usr/bin/node
mkdir -p "$STATE"
touch "$LOG"

say() { echo "$(date '+%F %T') $*" >> "$LOG"; }
state_get() { cat "$STATE/$1" 2>/dev/null || echo "${2:-0}"; }
state_set() { echo "$2" > "$STATE/$1"; }

# 2026-11-11：容器重启后，群 relay 不一定自己连回来（实测要手动点重连）。
# 恢复时顺手调一次它的 reconnect 接口，token 每次从 DSH 启动日志里现取。
reconnect_relay() {
  local token
  token=$(journalctl -u yuyu-dsh --no-pager 2>/dev/null | grep -o 'token=[A-Za-z0-9_-]*' | tail -1 | cut -d= -f2)
  [ -n "$token" ] || return 0
  curl -s -o /dev/null --max-time 6 -X POST \
    "http://127.0.0.1:3080/dsh-qq-relay/api/reconnect?token=$token" \
    -H 'content-type: application/json' -d '{}' || true
  say "已请求群 relay 重连"
}

# ---- 0) 容器存活 ----
running=$(docker inspect -f '{{.State.Running}}' napcat 2>/dev/null || echo false)
if [ "$running" != "true" ]; then
  say "容器未运行 → docker start"
  docker start napcat >/dev/null 2>&1 || say "docker start 失败"
  exit 0
fi

# ---- 1) 启动宽限期 ----
started=$(docker inspect -f '{{.State.StartedAt}}' napcat 2>/dev/null || echo "")
if [ -n "$started" ]; then
  s="${started%%.*}"
  epoch=$(date -d "${s}Z" +%s 2>/dev/null || echo 0)
  if [ "$epoch" -gt 0 ]; then
    up=$(( ( $(date +%s) - epoch ) / 60 ))
    if [ "$up" -lt 4 ]; then
      say "容器才启动 ${up} 分钟 → 宽限期内，跳过检查"
      exit 0
    fi
  fi
fi

# ---- 2) 健康检查 ----
out=$("$NODE" "$BASE/guard.mjs" check 2>&1)
rc=$?

if [ "$rc" -eq 0 ]; then
  state_set fails 0
  if [ -f "$STATE/was_down" ]; then
    rm -f "$STATE/was_down"
    say "已恢复在线，通知主人"
    "$NODE" "$BASE/guard.mjs" notify "🐟 NapCat 刚才掉线了，我已经自动重启并恢复正常，QQ 现在能正常收发啦～" >/dev/null 2>&1 || true
    reconnect_relay
  fi
  exit 0
fi

if [ "$rc" -eq 2 ]; then
  state_set fails 0
  say "OneBot 在线但未登录：$(printf '%s' "$out" | tail -c 200)"
  exit 0
fi

# ---- rc=1：连不上，先判断是不是在等扫码 ----
recent_qr=$(docker logs napcat --since 15m 2>&1 | grep -cE "二维码已保存|请扫描下面的二维码|快速登录错误|登录态已失效")
if [ "${recent_qr:-0}" -gt 0 ]; then
  state_set fails 0
  if [ "$(state_get qr_notified 0)" != "1" ]; then
    say "检测到在等扫码（登录态失效）→ 不重启，等你扫码"
    state_set qr_notified 1
  fi
  exit 0
fi
state_set qr_notified 0

n=$(( $(state_get fails 0) + 1 ))
state_set fails "$n"
say "健康检查失败（第 $n 次）：$(printf '%s' "$out" | tail -c 200)"

if [ "$n" -lt 2 ]; then exit 0; fi

# ---- 每小时最多重启 3 次 ----
now=$(date +%s)
last=$(state_get last_restart 0)
count=$(( $(state_get restart_count 0) ))
if [ $(( now - last )) -gt 3600 ]; then count=0; fi
if [ "$count" -ge 3 ]; then
  say "本小时已重启 $count 次 → 暂停重启，等人工处理"
  exit 0
fi

say "连续 2 次失败 → 重启 napcat（本小时第 $((count + 1)) 次）"
touch "$STATE/was_down"
state_set last_restart "$now"
state_set restart_count $((count + 1))
state_set fails 0
docker restart napcat >/dev/null 2>&1 || say "docker restart 失败"

exit 0
