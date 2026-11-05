# yuyu-framework

一套「B 站 + QQ」双通道 AI 助手的**框架**：只放胶水代码、配置模板和安装脚本，
不放任何个人信息、Cookie、账号或聊天记录。你要做的只是填自己的配置。

> 这是一个**自用向**的脚手架，不是开箱即用的产品。它需要你有：
> Node 18+、DSH（DeepSeek Harness）、Docker，以及一个愿意用来试错的小号。

---

## 它能拼出什么

```
B 站评论区/私信  ←→  DSH 插件 dsh-bili-whale（上游）
QQ 群             ←→  DSH 插件 dsh-qq-relay（上游）
QQ 私聊           ←→  本仓库的 qq-private/bridge.mjs（自研，独立运行）
```

三个通道共用一份人设（`persona.md`）和一份跨平台记忆（`memory.md`），
所以「她」在哪都是同一个人。

---

## 目录

```
qq-private/             QQ 私聊桥（完整可用，不依赖 DSH）
  bridge.mjs
  config.example.json
  启动私聊.bat
plugins/                给上游插件打的小补丁
  privacy-guard.mjs     发送前的隐私红线（拦手机号/密钥/路径…）
  apply-privacy-patch.mjs
scripts/                安装脚本
  fetch-github.mjs      用 jsDelivr 镜像下载 GitHub 仓库（绕开直连不通）
  install-bili-whale.ps1
  install-qq-relay.ps1
docs/
  architecture.md       架构、名词解释、踩坑记录
persona.example.md      人设模板
```

---

## 快速开始

> 第一次部署？直接看 **[docs/getting-started.md](docs/getting-started.md)**，那是一份带检查点的分步清单。

### 0. 前置

| 需要 | 说明 |
|---|---|
| Node 18+ | `node -v` 检查 |
| DSH | `npx @deepseek-ai/dsh web` 能起来 |
| Docker Desktop | 跑 NapCat 用 |
| B 站小号 + QQ 小号 | **别用主号** |

### 1. 装 B 站插件

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-bili-whale.ps1
```

装完重启 DSH，设置里会出现「养鱼」。填：B 站 Cookie（`SESSDATA`/`bili_jct`/`buvid3`）、
主人的 mid 和昵称，然后点「依赖体检」。

### 2. 装 QQ 群插件 + NapCat

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-qq-relay.ps1
```

然后按 [docs/architecture.md](docs/architecture.md) 第 4 节起一个 NapCat 容器、
扫码登录小号、在 NapCat 里开一个 OneBot WebSocket 服务（端口 3001 + token），
最后在 DSH 的插件面板里填 `ws://127.0.0.1:3001`、token、小号 QQ、群号。

### 3. 起私聊桥

```powershell
cd qq-private
copy config.example.json config.json
notepad config.json
```

改这几个字段：`onebotToken`、`ownerQq`（你自己的 QQ）、`botQq`（小号 QQ）、`ownerTitle`（她怎么称呼你）。
然后双击 `启动私聊.bat`。

### 4. 写人设

复制 `persona.example.md` 到 `%USERPROFILE%\.bili-ai\persona.md`，按自己的喜好改。
B 站插件和私聊桥都会读这一份。

### 5. （可选）打隐私补丁

```powershell
node .\plugins\apply-privacy-patch.mjs
```

它会给 B 站插件的「发评论」「发私信」加一道本地拦截：命中手机号、身份证、邮箱、
`sk-` 密钥、`SESSDATA`、本地路径、微信号、住址关键词时**直接拒绝发送**。

> 补丁在插件升级后会被覆盖，升级后重跑一次即可。

---

## 你需要自己准备的东西

| 东西 | 从哪拿 |
|---|---|
| B 站 Cookie | 浏览器 F12 → 应用 → Cookie → `https://www.bilibili.com`，复制 `SESSDATA`、`bili_jct`、`buvid3` |
| QQ 小号 | 注册一个，只用来跑机器人 |
| DeepSeek API Key | <https://platform.deepseek.com> |
| 群号 | 建一个只有你和机器人的群 |

---

## 它不包含什么

- ❌ 任何人的 Cookie、API Key、QQ 号、B 站 mid
- ❌ 任何人的人设、日记、聊天记忆
- ❌ 上游插件的源码（用脚本从上游下载）
- ❌ NapCat 镜像（自行 `docker pull`）

---

## 许可与署名

本仓库代码：MIT。

上游依赖（**不在本仓库内**，由脚本下载）：

| 项目 | 许可 | 说明 |
|---|---|---|
| [Alterssss/dsh-bili-whale](https://github.com/Alterssss/dsh-bili-whale) | MIT | B 站 插件 |
| [FablerTan/dsh-qq-relay](https://github.com/FablerTan/dsh-qq-relay) | MIT | QQ 群插件 |
| [NapNeko/NapCatQQ](https://github.com/NapNeko/NapCatQQ) | 自定义（非商用、修改版不得公开） | QQ 协议端，仅以 Docker 镜像方式使用，不在此分发 |

---

## 风险提示

- 用脚本自动发评论/私信**违反 B 站、QQ 的用户协议**，可能禁言、封号。**只用小号。**
- NapCat 是非官方协议端，风险落在那一个 QQ 号上。
- 本框架默认让模型拥有较高文件权限，请自行评估；生产环境建议用独立系统账户隔离。
