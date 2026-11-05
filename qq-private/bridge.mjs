/**
 * QQ 私聊桥 —— 让同一个"鱼鱼"能和你一对一聊天。
 *
 * 它和 dsh-qq-relay 的分工：
 *   群聊  → dsh-qq-relay（DSH 插件，管群）
 *   私聊  → 本脚本（直连同一个 NapCat 的 OneBot WS）
 *
 * 共用的东西：
 *   ~/.bili-ai/persona.md   人设（和 B 站那只共用）
 *   ~/.bili-ai/memory.md    跨平台记忆（每轮读、每轮写）
 *   DeepSeek API            ~/.dsh/.credentials.yaml 里的 key
 *
 * 用法：node bridge.mjs   （或双击 启动私聊.bat）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();

const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const expand = (p) => (p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);

const PERSONA_FILE = expand(config.personaFile);
const MEMORY_FILE = expand(config.memoryFile);
const MEMORY_JSONL = expand(config.memoryJsonl ?? '~/.bili-ai/memory.jsonl');
const SEEN_FILE = path.join(HERE, 'seen.json');

const MAX_MEMORY_LINES = Number(config.maxMemoryLines ?? 80);
const CONTEXT_LINES = Number(config.contextLines ?? 24);
const MAX_CHARS = Number(config.maxChars ?? 240);

const log = (...args) => console.log(new Date().toISOString(), ...args);

/* ---------------- 凭据 ---------------- */

function readDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const text = fs.readFileSync(path.join(HOME, '.dsh', '.credentials.yaml'), 'utf8');
    const m = /DEEPSEEK_API_KEY:\s*(\S+)/.exec(text);
    if (m) return m[1].trim();
  } catch {}
  return '';
}

const API_KEY = readDeepSeekKey();

/* ---------------- 记忆 ---------------- */

function readMemory() {
  try {
    const lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-CONTEXT_LINES).join('\n');
  } catch {
    return '';
  }
}

function appendMemory(line) {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    let lines = [];
    try {
      lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n').filter(Boolean);
    } catch {}
    if (!lines.length) lines.push('# 跨平台共享记忆（鱼鱼在 B 站和 QQ 上看到的最近对话）');
    lines.push(line);
    if (lines.length > MAX_MEMORY_LINES + 1) {
      lines = [lines[0], ...lines.slice(-MAX_MEMORY_LINES)];
    }
    fs.writeFileSync(MEMORY_FILE, lines.join('\n') + '\n', 'utf8');
    fs.appendFileSync(MEMORY_JSONL, JSON.stringify({ at: new Date().toISOString(), line }) + '\n', 'utf8');
  } catch (err) {
    log('写记忆失败：', err.message);
  }
}

/* ---------------- 去重 ---------------- */

let seen = new Set();
try {
  seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
} catch {}

function rememberSeen(id) {
  seen.add(String(id));
  const arr = [...seen].slice(-500);
  seen = new Set(arr);
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(arr), 'utf8');
  } catch {}
}

/* ---------------- 大模型 ---------------- */

async function replyTo(text) {
  // 人设里「评论额度」那节是 B 站专用，私聊时剥掉，免得她跟你提额度
  const persona = fs
    .readFileSync(PERSONA_FILE, 'utf8')
    .replace(/##\s*评论额度[\s\S]*?(?=\n##\s|$)/, '')
    .trim();
  const memory = readMemory();
  const system = [
    persona,
    '',
    `【当前场景】你在 QQ 上和${config.ownerTitle ?? '主人'}一对一的私聊。`,
    `称呼对方为「${config.ownerTitle ?? '主人'}」，自称「鱼鱼」。`,
    '回复要短，1～3 句，口语化，像朋友聊天，不要用 Markdown。',
    memory ? `\n【你最近的记忆（B 站和 QQ 共用）】\n${memory}` : '',
  ].join('\n');

  const res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: config.model ?? 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      temperature: 0.9,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const out = String(json?.choices?.[0]?.message?.content ?? '').trim();
  if (!out) throw new Error('模型返回为空');
  return out.length > MAX_CHARS ? `${out.slice(0, MAX_CHARS - 1)}…` : out;
}

/* ---------------- OneBot 连接 ---------------- */

let ws = null;
let retry = 0;
let pending = new Map();
let seq = 0;
let lastAt = 0;

const WS_URL = `${config.onebotWs.replace(/\/+$/, '')}/?access_token=${encodeURIComponent(config.onebotToken)}`;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    retry = 0;
    log('已连接 NapCat，等待私聊消息…');
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (data.echo && pending.has(data.echo)) {
      pending.get(data.echo)(data);
      pending.delete(data.echo);
      return;
    }
    if (data.post_type === 'message') handleMessage(data).catch((e) => log('处理失败：', e.message));
  };

  ws.onclose = () => {
    const wait = Math.min(1000 * 2 ** retry, 30_000);
    retry += 1;
    log(`${wait}ms 后重连…`);
    setTimeout(connect, wait);
  };

  ws.onerror = () => {};
}

function call(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error('未连接'));
    const echo = `e${++seq}`;
    pending.set(echo, resolve);
    ws.send(JSON.stringify({ action, params, echo }));
    setTimeout(() => {
      if (pending.delete(echo)) reject(new Error(`超时：${action}`));
    }, 15_000);
  });
}

function extractText(message) {
  if (typeof message === 'string') return message;
  if (!Array.isArray(message)) return '';
  return message
    .filter((seg) => seg?.type === 'text')
    .map((seg) => seg?.data?.text ?? '')
    .join('')
    .trim();
}

async function handleMessage(data) {
  if (data.message_type !== 'private') return;
  const from = String(data.user_id ?? data.sender?.user_id ?? '');
  const text = extractText(data.message);
  if (!from || !text) return;

  const key = String(data.message_id ?? `${from}:${data.time}`);
  if (seen.has(key)) return;
  rememberSeen(key);

  if (String(config.ownerQq) !== from) {
    log(`陌生人 ${from} 发来私聊，忽略`);
    return;
  }

  // 两条回复之间至少隔 1.2 秒，避免连发
  const wait = 1200 - (Date.now() - lastAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  log(`收到：${text.slice(0, 80)}`);
  const answer = await replyTo(text);
  lastAt = Date.now();

  await call('send_private_msg', { user_id: Number(from), message: [{ type: 'text', data: { text: answer } }] });
  log(`回复：${answer.slice(0, 80)}`);

  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  appendMemory(`- ${stamp} 【QQ 私聊】${config.ownerTitle ?? '主人'}：${text.replace(/\s+/g, ' ').slice(0, 120)} → 我：${answer.replace(/\s+/g, ' ').slice(0, 160)}`);
}

if (!API_KEY) {
  console.error('没找到 DeepSeek API Key（~/.dsh/.credentials.yaml 里的 DEEPSEEK_API_KEY）');
  process.exit(1);
}
if (!fs.existsSync(PERSONA_FILE)) {
  console.error(`人设文件不存在：${PERSONA_FILE}`);
  process.exit(1);
}

log('人设：', PERSONA_FILE);
log('记忆：', MEMORY_FILE);
connect();

process.on('SIGINT', () => {
  log('退出');
  ws?.close();
  process.exit(0);
});
