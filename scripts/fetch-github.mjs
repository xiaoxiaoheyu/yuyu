/**
 * 从 GitHub 下载整个仓库（走 jsDelivr 镜像，绕开直连不通）。
 *
 *   node fetch-github.mjs <owner/repo> <tag> <目标目录>
 *   node fetch-github.mjs Alterssss/dsh-bili-whale v0.4.6 "%USERPROFILE%\.dsh\plugins\dsh-bili-whale"
 */
import fs from 'node:fs';
import path from 'node:path';

const [repo, tag, dest] = process.argv.slice(2);
if (!repo || !tag || !dest) {
  console.error('用法: node fetch-github.mjs <owner/repo> <tag> <目标目录>');
  process.exit(1);
}

const api = `https://data.jsdelivr.com/v1/packages/gh/${repo}@${tag}`;
const metaRes = await fetch(api, { signal: AbortSignal.timeout(30_000) });
if (!metaRes.ok) {
  console.error(`拿不到仓库信息（HTTP ${metaRes.status}）：${api}`);
  process.exit(1);
}
const meta = await metaRes.json();

const files = [];
(function walk(node, prefix) {
  for (const child of node.files ?? []) {
    if (child.type === 'directory') walk(child, `${prefix}${child.name}/`);
    else files.push(`${prefix}${child.name}`);
  }
})(meta, '');

console.log(`仓库 ${repo}@${tag}：${files.length} 个文件 → ${dest}`);

let ok = 0;
const failed = [];
for (const file of files) {
  const url = `https://cdn.jsdelivr.net/gh/${repo}@${tag}/${file.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = path.join(dest, file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      ok += 1;
      break;
    } catch (err) {
      if (attempt === 3) failed.push(`${file} (${err.message})`);
    }
  }
}

console.log(`完成：${ok}/${files.length}`);
if (failed.length) {
  console.error('失败：\n' + failed.join('\n'));
  process.exit(2);
}
