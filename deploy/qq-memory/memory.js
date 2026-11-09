/**
 * 跨平台共享记忆 —— dsh-qq-relay 的「鱼鱼补丁」（yuyu-memory）
 *
 * 作用：让「QQ 群」这条通道也读写 ~/.bili-ai/memory.md，
 *      从而和 QQ 私聊（bridge.mjs）、B 站（dsh-bili-whale）共用同一份记忆。
 *
 *   读：每轮 prompt 前，把 memory.md 最近 N 条塞进「角色设定」段
 *   写：群里的「谁说了什么 → 我回了什么」追加回 memory.md
 *
 * 环境变量（可选）：
 *   YUYU_MEMORY_FILE     记忆文件路径，默认 ~/.bili-ai/memory.md
 *   YUYU_MEMORY_CONTEXT  注入多少条，默认 12
 *
 * 注意：插件升级会覆盖 relay.js，升级后需要重新执行 deploy/qq-memory/install.sh。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MEMORY_FILE = process.env.YUYU_MEMORY_FILE || path.join(os.homedir(), '.bili-ai', 'memory.md')
const MAX_LINES = 80
const CONTEXT_LINES = Math.max(1, Number(process.env.YUYU_MEMORY_CONTEXT ?? 12) || 12)
const READ_LINE_CHARS = 120
const WRITE_LINE_CHARS = 160

let cache = { mtimeMs: -1, text: '' }
const lastInbound = new Map()

/** 当前使用的记忆文件（排查用）。 */
export function memoryFile() {
  return MEMORY_FILE
}

/**
 * 注入到人设段末尾的「跨平台记忆」文本；读不到就返回空串（绝不让补丁把消息搞挂）。
 */
export function memoryPersonaSuffix() {
  try {
    const stat = fs.statSync(MEMORY_FILE)
    if (stat.mtimeMs === cache.mtimeMs && cache.text !== '') return cache.text
    const lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    const tail = lines.slice(-CONTEXT_LINES).map((s) => (s.length > READ_LINE_CHARS ? s.slice(0, READ_LINE_CHARS) + '…' : s))
    const text = tail.length === 0
      ? ''
      : '[跨平台记忆（QQ 私聊 / B 站 / 本群共用，最近 ' + String(tail.length) + ' 条）：' + tail.join(' ｜ ') + ']'
    cache = { mtimeMs: stat.mtimeMs, text }
    return text
  } catch {
    return ''
  }
}

/** 记住本批最后一条群消息，等回复时一起写进记忆。 */
export function rememberInbound(groupId, messages) {
  try {
    const list = Array.isArray(messages) ? messages : []
    const last = list[list.length - 1]
    if (last === null || typeof last !== 'object') return
    const text = typeof last.text === 'string' ? last.text : ''
    if (text.trim() === '') return
    lastInbound.set(String(groupId), { name: displayName(last), text: squash(text, WRITE_LINE_CHARS) })
  } catch {
    /* 记忆失败不影响回消息 */
  }
}

/** 把「谁说的 → 我回的」写成一行，追加进 memory.md。 */
export function rememberReply(groupId, reply) {
  try {
    const text = squash(reply, WRITE_LINE_CHARS)
    if (text === '') return
    const inbound = lastInbound.get(String(groupId))
    lastInbound.delete(String(groupId))
    appendLine('- ' + clock() + ' 【QQ 群 ' + String(groupId) + '】'
      + (inbound ? inbound.name + '：' + inbound.text + ' → ' : '')
      + '我：' + text)
  } catch {
    /* 同上 */
  }
}

function displayName(message) {
  for (const key of ['card', 'nickname']) {
    const value = message[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return message.userId === undefined || message.userId === null ? '群友' : String(message.userId)
}

function squash(text, max) {
  const one = String(text ?? '').replace(/\s+/gu, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

function clock(ms = Date.now()) {
  const date = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function appendLine(line) {
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true })
  let lines = []
  try {
    lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n').filter(Boolean)
  } catch {
    /* 文件还不存在 */
  }
  if (lines.length === 0) lines.push('# 跨平台共享记忆（鱼鱼在 B 站和 QQ 上看到的最近对话）')
  lines.push(line)
  if (lines.length > MAX_LINES + 1) lines = [lines[0], ...lines.slice(-MAX_LINES)]
  fs.writeFileSync(MEMORY_FILE, lines.join('\n') + '\n', 'utf8')
}
