/**
 * 每日简报：B 站热门 + 今日天气 → 发到你的 QQ。
 *
 *   node daily-digest.mjs           真发（按 config.json 的 digestTargets：私聊 + 群）
 *   node daily-digest.mjs --dry     只在控制台打印，不发送
 *
 * 依赖：NapCat 在跑（Docker），config.json 里的 onebotWs / onebotToken / ownerQq。
 * 不依赖 DSH、不依赖 bridge.mjs。
 *
 * 相关配置（config.json）：
 *   digestTopN      抓几条热门（默认 5）
 *   digestTargets   发给谁：["private","group"] 或只写一个
 *   digestGroupId   发群时用的群号（不填则退回 groups[0]）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const DRY = process.argv.includes('--dry');

const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const CITY_NAME = config.cityName ?? '成都';
const TOP_N = Number(config.digestTopN ?? 5);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

async function json(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', ...extraHeaders },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function human(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return String(n);
}

/* ---------------- 发送目标 ---------------- */

/** 把 digestTargets 展开成 [{kind:'private'|'group', id}]，自动去重 */
function targets() {
  const raw = Array.isArray(config.digestTargets)
    ? config.digestTargets
    : [config.digestTarget ?? 'private'];
  const list = [];
  for (const t of raw) {
    if (t === 'private' && config.ownerQq) {
      list.push({ kind: 'private', id: Number(config.ownerQq) });
    }
    if (t === 'group') {
      const gid = Number(config.digestGroupId ?? config.groups?.[0] ?? 0);
      if (gid) list.push({ kind: 'group', id: gid });
      else console.error('警告：digestTargets 里有 group，但没配 digestGroupId / groups');
    }
  }
  const seen = new Set();
  return list.filter((t) => {
    const key = `${t.kind}:${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function label(t) {
  return t.kind === 'group' ? `群 ${t.id}` : `私聊 ${t.id}`;
}

/* ---------------- 数据 ---------------- */

async function popular() {
  const j = await json(`https://api.bilibili.com/x/web-interface/popular?ps=${TOP_N}&pn=1`);
  if (j.code !== 0) throw new Error(`热门接口 code=${j.code}`);
  return (j.data?.list ?? []).slice(0, TOP_N).map((v) => ({
    title: v.title,
    author: v.owner?.name ?? '',
    view: v.stat?.view ?? 0,
    bvid: v.bvid,
    tname: v.tname,
  }));
}

async function hotwords() {
  try {
    const j = await json('https://s.search.bilibili.com/main/hotword');
    return (j.list ?? []).slice(0, 5).map((x) => x.keyword ?? x.show_name).filter(Boolean);
  } catch {
    return [];
  }
}

const WMO = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '有雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  56: '冻毛毛雨', 57: '强冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴伴冰雹',
};

async function weather() {
  // 先按城市名查经纬度（open-meteo 支持中文）
  const geo = await json(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(CITY_NAME)}&count=1&language=zh&format=json`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`找不到城市：${CITY_NAME}`);

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.latitude}&longitude=${place.longitude}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset'
    + '&timezone=Asia%2FShanghai';

  const j = await json(url);
  const cur = j.current ?? {};
  const d = j.daily ?? {};
  const code = cur.weather_code ?? d.weather_code?.[0];
  return {
    temp: Math.round(cur.temperature_2m),
    feels: Math.round(cur.apparent_temperature),
    desc: WMO[code] ?? '天气',
    humidity: Math.round(cur.relative_humidity_2m),
    max: Math.round(d.temperature_2m_max?.[0]),
    min: Math.round(d.temperature_2m_min?.[0]),
    sunrise: (d.sunrise?.[0] ?? '').slice(11, 16),
    sunset: (d.sunset?.[0] ?? '').slice(11, 16),
  };
}

/* ---------------- 文案 ---------------- */

const PAD = (n) => String(n).padStart(2, '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function todayLabel() {
  const d = new Date();
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())} ${WEEK[d.getDay()]}`;
}

function build(videos, words, w) {
  const lines = [];
  lines.push(`鱼摆摆早上好呀～ ${todayLabel()} 的简报来啦 ✧٩(ˊωˋ*)و✧`);
  lines.push('');
  lines.push(`🌤 ${CITY_NAME}今天`);
  lines.push(`   现在 ${w.temp}°C（体感 ${w.feels}°C）${w.desc}，湿度 ${w.humidity}%`);
  lines.push(`   今天 ${w.min} ~ ${w.max}°C` + (w.sunrise ? `，日出 ${w.sunrise} / 日落 ${w.sunset}` : ''));
  lines.push('');
  if (videos.length) {
    lines.push(`🔥 B 站现在最热的 ${videos.length} 条`);
    videos.forEach((v, i) => {
      lines.push(`${i + 1}. ${v.title}`);
      lines.push(`   ${v.author} · ${human(v.view)}播放 · ${v.tname}`);
    });
  } else {
    lines.push('🔥 B 站热门今天没抓到，晚点我再看一眼～');
  }
  if (words.length) {
    lines.push('');
    lines.push(`🏷 大家还在搜：${words.join(' / ')}`);
  }
  lines.push('');
  lines.push('今天也要开开心心的哦，鱼鱼先去逛逛啦～');
  return lines.join('\n');
}

/* ---------------- 发送 ---------------- */

/**
 * 开一条 WS，依次发给所有目标（两条之间隔 800ms），全部发完再关。
 * 返回 [{target, ok, error}]；连不上 NapCat 时抛错。
 */
function sendAll(text, list) {
  return new Promise((resolve, reject) => {
    const url = `${config.onebotWs.replace(/\/+$/, '')}/?access_token=${encodeURIComponent(config.onebotToken)}`;
    const ws = new WebSocket(url);
    const results = [];
    let index = 0;
    let settled = false;

    const timer = setTimeout(() => finish(new Error('连接/发送超时（60 秒）')), 60_000);

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) reject(err);
      else resolve(results);
    }

    function next() {
      if (index >= list.length) return finish();
      const t = list[index++];
      const echo = `digest-${index}`;
      const params = t.kind === 'group'
        ? { group_id: t.id, message: [{ type: 'text', data: { text } }] }
        : { user_id: t.id, message: [{ type: 'text', data: { text } }] };
      ws.send(JSON.stringify({
        action: t.kind === 'group' ? 'send_group_msg' : 'send_private_msg',
        params,
        echo,
      }));
    }

    ws.onopen = () => next();

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(String(event.data)); } catch { return; }
      const echo = String(data.echo ?? '');
      if (!echo.startsWith('digest-')) return;
      const t = list[Number(echo.slice('digest-'.length)) - 1];
      if (!t) return;
      const ok = data.status === 'ok' || data.retcode === 0;
      results.push({
        target: t,
        ok,
        error: ok ? '' : `${data.status ?? ''} ${data.retcode ?? ''} ${data.message ?? ''}`.trim(),
      });
      // 留一点间隔，避免同一条消息连发被风控
      setTimeout(next, 800);
    };

    ws.onerror = () => finish(new Error('连不上 NapCat（容器没跑？token 不对？）'));
  });
}

/* ---------------- 主流程 ---------------- */

const list = targets();
if (!list.length) {
  console.error('没有可用的发送目标：检查 config.json 的 digestTargets / ownerQq / digestGroupId');
  process.exit(1);
}

const [videos, words, w] = await Promise.all([
  popular().catch((e) => { console.error('热门抓取失败：', e.message); return []; }),
  hotwords(),
  weather().catch((e) => { console.error('天气抓取失败：', e.message); return null; }),
]);

if (!videos.length && !w) {
  console.error('热门和天气都没拿到，放弃发送');
  process.exit(1);
}

const text = build(videos, words, w ?? { temp: '?', feels: '?', desc: '', humidity: '?', max: '?', min: '?' });

if (DRY) {
  console.log(`===== 预览（将发给：${list.map(label).join('、')}）=====`);
  console.log(text);
  process.exit(0);
}

try {
  const results = await sendAll(text, list);
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`✔ ${label(r.target)}`);
    else { failed += 1; console.error(`✘ ${label(r.target)} — ${r.error || '发送失败'}`); }
  }
  const missing = list.filter((t) => !results.some((r) => r.target === t));
  for (const t of missing) { failed += 1; console.error(`✘ ${label(t)} — 没有收到 NapCat 回执`); }
  if (failed) process.exit(1);
  console.log(`已发送：${list.map(label).join('、')}`);
} catch (err) {
  console.error('发送失败：', err.message);
  process.exit(1);
}
