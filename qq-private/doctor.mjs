/**
 * 鱼鱼自检：检查配置、人设、记忆、NapCat 连接、API Key。
 *
 *   sudo node /opt/yuyu/qq-private/doctor.mjs
 *
 * 每项输出 ✅ 或 ❌，最后给一句结论。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const expand = (p) => (p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);

let failures = 0;
const ok = (msg) => console.log(`✅ ${msg}`);
const bad = (msg) => { failures += 1; console.log(`❌ ${msg}`); };
const warn = (msg) => console.log(`⚠️  ${msg}`);

console.log('=== 鱼鱼自检 ===\n');

/* 1. config.json */
let config = null;
const cfgPath = path.join(HERE, 'config.json');
if (!fs.existsSync(cfgPath)) {
  bad(`缺少 ${cfgPath}（复制 config.example.json 改名）`);
} else {
  try {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    ok('config.json 可解析');
  } catch (err) {
    bad(`config.json 不是合法 JSON：${err.message}`);
  }
}

if (config) {
  const need = [
    ['onebotWs', (v) => typeof v === 'string' && v.startsWith('ws')],
    ['onebotToken', (v) => typeof v === 'string' && v.length > 0],
    ['ownerQq', (v) => Number.isInteger(v) && v > 0],
    ['botQq', (v) => Number.isInteger(v) && v > 0],
    ['ownerTitle', (v) => typeof v === 'string' && v.length > 0],
  ];
  for (const [key, test] of need) {
    if (config[key] === undefined) bad(`config.${key} 缺失`);
    else if (!test(config[key])) bad(`config.${key} 格式不对：${JSON.stringify(config[key])}`);
    else ok(`config.${key} = ${key.includes('Token') ? '(已填)' : JSON.stringify(config[key])}`);
  }
  if (config.ownerQq && config.botQq && config.ownerQq === config.botQq) {
    bad('ownerQq 和 botQq 不能是同一个号');
  }
}

/* 2. 人设与记忆 */
const personaFile = expand(config?.personaFile ?? '~/.bili-ai/persona.md');
const memoryFile = expand(config?.memoryFile ?? '~/.bili-ai/memory.md');

if (fs.existsSync(personaFile)) {
  const size = fs.statSync(personaFile).size;
  ok(`人设存在：${personaFile}（${size} 字节）`);
  if (size < 100) warn('人设文件偏小，可能是空模板');
} else bad(`缺人设文件：${personaFile}`);

if (fs.existsSync(memoryFile)) {
  ok(`记忆存在：${memoryFile}（${fs.statSync(memoryFile).size} 字节）`);
} else warn(`还没有记忆文件：${memoryFile}（第一次对话后会自动生成）`);

/* 3. DeepSeek Key */
function readKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const text = fs.readFileSync(path.join(HOME, '.dsh', '.credentials.yaml'), 'utf8');
    const m = /DEEPSEEK_API_KEY:\s*(\S+)/.exec(text);
    if (m) return m[1].trim();
  } catch {}
  return '';
}
const key = readKey();
if (key) ok(`DeepSeek Key 可读（${key.slice(0, 6)}…）`);
else bad('读不到 DeepSeek Key：~/.dsh/.credentials.yaml 里没有 DEEPSEEK_API_KEY');

/* 4. NapCat 连接 */
function checkNapCat() {
  return new Promise((resolve) => {
    if (!config?.onebotWs) return resolve({ ok: false, reason: 'config.onebotWs 为空' });
    const url = `${config.onebotWs.replace(/\/+$/, '')}/?access_token=${encodeURIComponent(config.onebotToken ?? '')}`;
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    try {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { try { ws.close(); } catch {} done({ ok: false, reason: '连接超时（NapCat 没跑？）' }); }, 6000);
      ws.onopen = () => ws.send(JSON.stringify({ action: 'get_login_info', echo: 'doctor' }));
      ws.onmessage = (ev) => {
        let d; try { d = JSON.parse(String(ev.data)); } catch { return; }
        if (d.echo !== 'doctor') return;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        if (d.status === 'ok' && d.data) done({ ok: true, data: d.data });
        else done({ ok: false, reason: `接口返回 ${d.status} ${d.retcode ?? ''}` });
      };
      ws.onerror = () => { clearTimeout(timer); done({ ok: false, reason: 'WebSocket 报错（token 不对或端口不通）' }); };
    } catch (err) {
      done({ ok: false, reason: err.message });
    }
  });
}

if (config) {
  const r = await checkNapCat();
  if (r.ok) {
    const id = r.data.user_id ?? r.data.qq ?? '?';
    ok(`NapCat 在线，登录账号：${id}${String(id) === String(config.botQq) ? '（与 config.botQq 一致）' : ' ⚠️ 与 config.botQq 不一致！'}`);
    if (String(id) !== String(config.botQq)) warn(`config.botQq=${config.botQq}，实际登录=${id}`);
  } else {
    bad(`连不上 NapCat：${r.reason}`);
  }
}

/* 5. 结论 */
console.log('');
if (failures === 0) console.log('🎉 全部通过，可以运行');
else console.log(`😵 有 ${failures} 项没通过，先修上面标 ❌ 的`);
process.exit(failures === 0 ? 0 : 1);
