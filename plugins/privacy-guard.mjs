/**
 * 隐私红线（本地兜底，2026-11-05 加）
 *
 * 目的：评论区/私信里有人套话、或者她自己被注入后想把敏感信息写出去时，
 * 在真正发送前拦一道。命中任意一条 → 拒绝发送，让 agent 改写。
 *
 * 只拦"强特征"，避免误伤正常回复（版本号、普通数字、英文句子都放行）。
 */
const RULES = [
  { name: '手机号', re: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
  { name: '身份证号', re: /(?<!\d)\d{17}[\dXx](?!\d)/ },
  { name: '邮箱', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  { name: 'API Key', re: /sk-[A-Za-z0-9]{16,}/ },
  { name: 'Cookie 字段', re: /(SESSDATA|bili_jct|buvid3)\s*[=:]/i },
  { name: '本地文件路径', re: /[A-Za-z]:\\[^\s"']{3,}|\/Users\/[^\s"']+/ },
  { name: '微信号', re: /(微信|vx|v信|wechat)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/i },
  { name: '住址细节', re: /(我家住|住址|门牌号|小区名|宿舍号)/ },
  { name: '疑似密钥长串', re: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{60,}={0,2}(?![A-Za-z0-9+/])/ },
];

export function checkPrivacy(text) {
  const s = String(text ?? '');
  for (const rule of RULES) {
    const m = rule.re.exec(s);
    if (m) return { ok: false, rule: rule.name, sample: m[0].slice(0, 12) + (m[0].length > 12 ? '…' : '') };
  }
  return { ok: true };
}

/** 发送前调用：命中就打印原因并退出（退出码 3），调用方无需再管。 */
export function enforcePrivacy(text, { label = '内容' } = {}) {
  const r = checkPrivacy(text);
  if (!r.ok) {
    console.error(`[隐私红线] 拒绝发送：${label}命中「${r.rule}」（${r.sample}）。请改写，不要包含任何个人信息。`);
    process.exit(3);
  }
}