#!/usr/bin/env node
/**
 * NapCat 健康检查 / 私聊通知 —— 走 OneBot WebSocket，和 relay / bridge 同一条通道。
 *
 *   node guard.mjs check        在线且已登录 → 退出 0
 *                              连接正常但未登录（等扫码）→ 退出 2
 *                              连不上（进程挂了 / 端口不通）→ 退出 1
 *   node guard.mjs notify "文本"  给主人发一条 QQ 私聊
 *
 * 配置默认读 /opt/yuyu/qq-private/config.json（onebotToken / ownerQq）。
 */
import fs from 'node:fs'

const CONF = process.env.NAPCAT_CONF || '/opt/yuyu/qq-private/config.json'
const WS_BASE = (process.env.NAPCAT_WS || 'ws://127.0.0.1:3001').replace(/\/+$/, '')
const TIMEOUT = Number(process.env.NAPCAT_GUARD_TIMEOUT_MS || 8000)

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONF, 'utf8'))
  return { token: String(cfg.onebotToken ?? ''), owner: Number(cfg.ownerQq ?? 0) }
}

/** 开一条 WS，发一个 action，等回执，然后关闭。 */
function call(token, action, params) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/?access_token=${encodeURIComponent(token)}`)
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      try { ws.close() } catch {}
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), TIMEOUT)

    ws.onopen = () => ws.send(JSON.stringify({ action, params, echo: 'guard' }))
    ws.onmessage = (event) => {
      let data
      try { data = JSON.parse(String(event.data)) } catch { return }
      if (data.echo !== 'guard') return
      clearTimeout(timer)
      finish({ ok: data.retcode === 0 || data.status === 'ok', data: data.data, retcode: data.retcode, message: data.message })
    }
    ws.onerror = () => { clearTimeout(timer); finish({ ok: false, reason: 'unreachable' }) }
  })
}

const [mode = 'check', text = ''] = process.argv.slice(2)

let cfg
try {
  cfg = loadConfig()
} catch (error) {
  console.error(`读不到配置 ${CONF}：${error.message}`)
  process.exit(1)
}

if (mode === 'notify') {
  if (!text) { console.error('notify 需要一段文本'); process.exit(2) }
  if (!cfg.owner) { console.error('config.json 里没有 ownerQq'); process.exit(2) }
  const r = await call(cfg.token, 'send_private_msg', {
    user_id: cfg.owner,
    message: [{ type: 'text', data: { text } }],
  })
  if (r.ok) { console.log('已发送'); process.exit(0) }
  console.error(`发送失败：${r.reason ?? r.message ?? ''}`)
  process.exit(1)
}

// check
const r = await call(cfg.token, 'get_login_info', {})
if (!r.ok && r.reason) {
  console.error(`连不上 NapCat（${r.reason}）`)
  process.exit(1)
}
if (r.ok && r.data && (r.data.user_id || r.data.uin)) {
  console.log(`在线：${r.data.nickname ?? ''}（${r.data.user_id ?? r.data.uin}）`)
  process.exit(0)
}
console.error(`OneBot 在，但还没登录：${r.message ?? r.retcode ?? '未知'}`)
process.exit(2)
