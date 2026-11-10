#!/usr/bin/env bash
# NapCat 自愈守护（由 napcat-guard.timer 每 2 分钟调用一次）
#
# 判定：
#   exit 0 → 在线且已登录，清失败计数；如果之前是"掉线自愈"状态，私聊通知主人
#   exit 2 → OneBot 在、但没登录（多半在等扫码）→ 只记日志，不重启（避免无限重启）
#   其它   → 连不上 → 连续 2 次就 docker restart napcat
set -u
BASE=/opt/napcat-guard
STATE="$BASE/state"
LOG="$BASE/guard.log"
NODE=/usr/bin/node
mkdir -p "$STATE"
touch "$LOG"

say() { echo "$(date '+%F %T') $*" >> "$LOG"; }

out=$("$NODE" "$BASE/guard.mjs" check 2>&1)
rc=$?

case "$rc" in
  0)
    echo 0 > "$STATE/fails"
    if [ -f "$STATE/was_down" ]; then
      rm -f "$STATE/was_down"
      say "已恢复在线，通知主人"
      "$NODE" "$BASE/guard.mjs" notify "🐟 NapCat 刚才掉线了，我已经自动重启并恢复正常，QQ 现在能正常收发啦～" >/dev/null 2>&1 || true
    fi
    ;;
  2)
    # 进程活着、只是没登录：可能是刚重装还没扫码，也可能被踢下线等重登
    echo 0 > "$STATE/fails"
    say "OneBot 在线但未登录：$(printf '%s' "$out" | tail -c 200)"
    ;;
  *)
    n=$(cat "$STATE/fails" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$STATE/fails"
    say "健康检查失败（第 $n 次）：$(printf '%s' "$out" | tail -c 200)"
    if [ "$n" -ge 2 ]; then
      touch "$STATE/was_down"
      say "连续 2 次失败 → 重启 napcat"
      docker restart napcat >/dev/null 2>&1 || say "docker restart 失败"
      echo 0 > "$STATE/fails"
      sleep 20
    fi
    ;;
esac

# 守护脚本本身永远成功返回，避免 systemd 把"未登录"当失败
exit 0
