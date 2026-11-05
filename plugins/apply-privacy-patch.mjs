/**
 * 给 dsh-bili-whale 打隐私补丁：发评论 / 发私信前，命中敏感模式就拒绝发送。
 *
 *   node plugins/apply-privacy-patch.mjs
 *
 * 幂等：重复执行不会重复插入。插件升级后会覆盖补丁，升级后重跑一次即可。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const PLUGIN = path.join(HOME, '.dsh', 'plugins', 'dsh-bili-whale');

if (!fs.existsSync(PLUGIN)) {
  console.error(`找不到插件目录：${PLUGIN}\n先运行 scripts/install-bili-whale.ps1`);
  process.exit(1);
}

const guardSrc = path.join(HERE, 'privacy-guard.mjs');
const guardDst = path.join(PLUGIN, 'tools', 'lib', 'privacy-guard.mjs');
fs.mkdirSync(path.dirname(guardDst), { recursive: true });
fs.copyFileSync(guardSrc, guardDst);
console.log(`✓ 已放置 ${guardDst}`);

function patch(file, anchor, call) {
  const full = path.join(PLUGIN, file);
  if (!fs.existsSync(full)) {
    console.warn(`- 跳过（不存在）：${file}`);
    return;
  }
  let text = fs.readFileSync(full, 'utf8');
  if (text.includes('privacy-guard.mjs')) {
    console.log(`- 已打过补丁：${file}`);
    return;
  }
  const importLine = "import { enforcePrivacy } from '../lib/privacy-guard.mjs'\n";
  const lines = text.split('\n');
  const firstImport = lines.findIndex((l) => l.startsWith('import '));
  lines.splice(firstImport < 0 ? 0 : firstImport, 0, importLine.trimEnd());
  text = lines.join('\n');

  if (!text.includes(anchor)) {
    console.warn(`- 找不到插入点，跳过：${file}`);
    return;
  }
  text = text.replace(anchor, `${anchor}\n${call}`);
  fs.writeFileSync(full, text, 'utf8');
  console.log(`✓ 已打补丁：${file}`);
}

patch('tools/commands/comment.mjs', "const body = String(message ?? '').trimStart()", "enforcePrivacy(body, { label: '评论' })");
patch('tools/commands/dm.mjs', "const MSG = String(opt.msg ?? '').trim()", "enforcePrivacy(MSG, { label: '私信' })");

console.log('\n完成。补丁在插件升级后会被覆盖，届时重跑本脚本即可。');
