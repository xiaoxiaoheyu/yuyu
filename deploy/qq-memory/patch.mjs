/**
 * 给 dsh-qq-relay 的 relay.js 打「共享记忆」补丁（幂等）。
 *
 *   node patch.mjs /root/.dsh/plugins/dsh-qq-relay
 *
 * 只改四处，每处都带 `yuyu-memory` 标记：
 *   1. 引入 lib/model/memory.js
 *   2. personaText() 末尾追加最近记忆
 *   3. dispatchBatch() 记住本批最后一条群消息
 *   4. sendReply() 把回复写回 memory.md
 *
 * 找不到原文就整体回滚并报错（插件升级版本差异大时会这样）。
 */
import fs from 'node:fs'
import path from 'node:path'

const MARK = 'yuyu-memory'
const pluginDir = process.argv[2]
if (!pluginDir) {
  console.error('用法：node patch.mjs <插件目录>')
  process.exit(2)
}

const relayPath = path.join(pluginDir, 'lib', 'controller', 'relay.js')
const memoryPath = path.join(pluginDir, 'lib', 'model', 'memory.js')
if (!fs.existsSync(relayPath)) {
  console.error('找不到 ' + relayPath)
  process.exit(2)
}
if (!fs.existsSync(memoryPath)) {
  console.error('先把 memory.js 放到 ' + memoryPath)
  process.exit(2)
}

const original = fs.readFileSync(relayPath, 'utf8')
let next = original

/** @type {{name: string, from: string, to: string}[]} */
const edits = [
  {
    name: 'import',
    from: "import { formatIncomingPrompt } from '../model/prompt.js'",
    to: "import { formatIncomingPrompt } from '../model/prompt.js'\n"
      + "import { memoryPersonaSuffix, rememberInbound, rememberReply } from '../model/memory.js' // " + MARK,
  },
  {
    name: 'personaText',
    from: [
      '  function personaText() {',
      '    const persona = config.persona',
      "    if (persona === null || typeof persona !== 'object' || persona.enabled !== true) return ''",
      "    return typeof persona.text === 'string' ? persona.text.trim() : ''",
      '  }',
    ].join('\n'),
    to: [
      '  function personaText() {',
      '    const persona = config.persona',
      '    const base = persona === null || typeof persona !== \'object\' || persona.enabled !== true',
      "      ? ''",
      "      : (typeof persona.text === 'string' ? persona.text.trim() : '')",
      '    return base + memoryPersonaSuffix() // ' + MARK,
      '  }',
    ].join('\n'),
  },
  {
    name: 'dispatchBatch',
    from: '    const text = formatIncomingPrompt({ groupId, groupName, messages, persona: personaText(), now: now() })\n'
      + "    if (text === '') return",
    to: '    const text = formatIncomingPrompt({ groupId, groupName, messages, persona: personaText(), now: now() })\n'
      + "    if (text === '') return\n"
      + '    rememberInbound(groupId, messages) // ' + MARK,
  },
  {
    name: 'sendReply',
    from: "  async function sendReply(groupId, text, replyTo = '') {\n"
      + '    const chunks = buildReplyChunks(text, config.replyChunkSize)',
    to: "  async function sendReply(groupId, text, replyTo = '') {\n"
      + '    rememberReply(groupId, text) // ' + MARK + '\n'
      + '    const chunks = buildReplyChunks(text, config.replyChunkSize)',
  },
]

const applied = []
for (const edit of edits) {
  if (next.includes(edit.to)) {
    console.log('· 已打过：' + edit.name)
    continue
  }
  if (!next.includes(edit.from)) {
    console.error('✘ 找不到原文：' + edit.name + '（插件版本可能变了）')
    console.error('  未写入任何修改，relay.js 保持原样')
    process.exit(1)
  }
  next = next.replace(edit.from, edit.to)
  applied.push(edit.name)
}

fs.writeFileSync(relayPath + '.yuyu-memory.bak', original, 'utf8')
fs.writeFileSync(relayPath, next, 'utf8')
console.log(applied.length > 0 ? '✔ 已写入：' + applied.join(', ') : '✔ 无需修改（已是最新）')
console.log('  备份：' + relayPath + '.yuyu-memory.bak')
