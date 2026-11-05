# 从零到能聊天：完整步骤

> 给第一次拿到这个仓库的人。按顺序做，每一步都有「检查点」，没通过就别往下走。
> 全程大约 **1～2 小时**，大头花在 Docker 和扫码上。

---

## 0. 准备清单

| 需要 | 检查命令 | 没有会怎样 |
|---|---|---|
| Windows 10/11 | — | 脚本是 PowerShell 写的 |
| Node.js 18+ | `node -v` | 私聊桥跑不起来 |
| DSH | `npx @deepseek-ai/dsh web` 能打开网页 | B站和QQ群都用不了 |
| Docker Desktop | 托盘图标绿色，`docker ps` 不报错 | QQ 完全用不了 |
| DeepSeek API Key | <https://platform.deepseek.com> | 私聊桥不能生成回复 |
| B 站小号 | 能登录、等级越低越好 | 用主号有封号风险 |
| QQ 小号 | 能扫码登录 | 同上 |

> **两个小号是硬要求**：B站 和 QQ 的机器人各用一个号，不要拿主号试。

---

## 1. 拿到代码

```powershell
git clone https://github.com/xiaoxiaoheyu/yuyu.git
cd yuyu
```

没有 git 就下载 zip 解压。

**检查点**：目录里能看到 `README.md`、`qq-private\`、`scripts\`。

---

## 2. 装 B 站插件

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-bili-whale.ps1
```

脚本做两件事：用 jsDelivr 镜像下载插件源码 → 用 `dsh plugin add` 登记进 `web` 配置档。

**检查点**：输出里出现 `+ dsh-bili-whale <- ...`，没有 `incompatible` 报错。

### 2.1 重启 DSH 并配置

1. 关掉 DSH（终端 `Ctrl+C`），重新 `npx @deepseek-ai/dsh web`
2. 打开新地址 → **设置 → 养鱼**
3. **B 站登录**：扫码，或者手动粘贴 `SESSDATA` / `bili_jct` / `buvid3`
   - 复制方法：浏览器 F12 → **应用** → Cookie → `https://www.bilibili.com` → 双击「值」复制
   - `SESSDATA` 是 HttpOnly，`document.cookie` 读不到，必须从面板复制
4. **她是谁**：填角色名、怎么称呼你、你的 B 站 mid 和昵称
5. 点 **保存**
6. 点 **依赖体检**

**检查点**：体检里 Cookie、Node、数据目录都是 ✓；「主人的身份」不再打 ✗。

### 2.2 给她权限（否则她会一直等你点同意）

打开 **工作区 → 未分组 → bili-whale** 会话，输入：

```
/permission
```

选 **完全权限**（简单直接）或 **Auto**（模型替你审，更稳但要多装 Auto review）。

**检查点**：会话里再让她跑个命令，不再弹「是否批准」。

---

## 3. 起 NapCat（QQ 协议端）

### 3.1 写 compose 文件

```powershell
mkdir $env:USERPROFILE\napcat-docker
cd $env:USERPROFILE\napcat-docker
```

把仓库里的 `deploy\napcat-compose.yaml` 复制过来，改名 `compose.yaml`，
把 `WEBUI_TOKEN=change-me-please` 改成一串你自己定的随机字符。

### 3.2 启动容器

```powershell
docker compose up -d
```

第一次会拉镜像（几百 MB，国内建议用镜像源，compose 里已经写了 `hub.rat.dev`）。

**检查点**：`docker ps` 里看到 `napcat`，状态 `Up`。

### 3.3 扫码登录

浏览器打开（token 换成你刚才设的）：

```
http://127.0.0.1:6099/webui?token=你的token
```

左侧 **QQ 登录** → 用**QQ 小号**扫 → 手机上确认。

**检查点**：NapCat 面板显示 QQ 在线；终端日志里出现 `OneBot11 适配器初始化完成`。

> ⚠️ 扫码成功前**不要开代理/TUN**。电脑出口在海外、手机在国内，QQ 会判定
> 「设备不在同一网络」并拒绝登录（`ErrCode 10`）。

### 3.4 开 OneBot 通道

NapCat 面板 → **网络配置** → 新建 → **WebSocket 服务器**：

| 项 | 填 |
|---|---|
| 端口 | `3001` |
| Token | 自己定一串（私聊桥和插件都要用） |
| 启用 | ✅ |

**检查点**：浏览器能访问 `http://127.0.0.1:3001`（会提示连不上或 404，说明端口活着）。

---

## 4. 装 QQ 群插件

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-qq-relay.ps1
```

重启 DSH → **插件面板 → dsh-qq-relay → 连接**：

| 字段 | 填 |
|---|---|
| `wsUrl` | `ws://127.0.0.1:3001` |
| `accessToken` | 3.4 里那串 |
| `selfId` | QQ 小号号码 |
| 群白名单 | 你的测试群号 |

点 **保存并重连**。

**检查点**：状态显示「已连接」；在群里 @ 小号，她会回。

> 群聊触发的会话也是「询问」权限，同样需要 `/permission` 设成完全权限，
> 或者在插件的「预设」页把 QQ 群聊预设的权限调好。

---

## 5. 起 QQ 私聊桥

```powershell
cd qq-private
copy config.example.json config.json
notepad config.json
```

改四个字段：

```json
{
  "onebotToken": "3.4 里那串",
  "ownerQq": 你自己的QQ,
  "botQq": QQ小号,
  "ownerTitle": "她怎么称呼你"
}
```

双击 **`启动私聊.bat`**，窗口里出现 `已连接 NapCat，等待私聊消息…` 就成了。

**检查点**：用主号私聊小号，她回你。

---

## 6. 写人设

```powershell
mkdir $env:USERPROFILE\.bili-ai -Force
copy persona.example.md $env:USERPROFILE\.bili-ai\persona.md
notepad $env:USERPROFILE\.bili-ai\persona.md
```

改「称呼」那一节，把「鱼摆摆」换成她想叫你的名字；
同时把 `qq-private\config.json` 的 `ownerTitle` 改成一样的。

**检查点**：B站 和 QQ 私聊里，她叫你的是同一个名字。

---

## 7. 打隐私补丁（推荐）

```powershell
node .\plugins\apply-privacy-patch.mjs
```

之后她发评论/私信时，如果内容里出现手机号、身份证、邮箱、`sk-` 密钥、
`SESSDATA`、本地路径、微信号、住址关键词，**会被本地直接拒绝发送**。

**检查点**：脚本输出 `✓ 已打补丁：tools/commands/comment.mjs` 和 `dm.mjs`。

---

## 8. 四个验收测试

| # | 怎么做 | 期望 |
|---|---|---|
| 1 | 群里 @ 小号说一句话 | 几十秒内回复 |
| 2 | 主号私聊小号 | 回复，且叫你的自定义称呼 |
| 3 | B 站评论区 @ 她的号（用另一个号） | 回复 |
| 4 | 主号 B 站私信她 | 回复（不再弹审批） |

四个都过 = 完成。

---

## 9. 常见失败点

| 现象 | 原因 | 处理 |
|---|---|---|
| `install-bili-whale.ps1` 报 `incompatible` | npm 上的版本比 DSH 内置的旧 | 改用 DSH 自带的同版本包 `link:`（见脚本注释） |
| 插件面板里看不到「养鱼」 | 没重启 DSH，或装错了 profile | 确认装的是 `web` 档，重启一次 |
| QQ 扫码 `ErrCode 10` | 电脑走了代理，出口在海外 | 关 TUN / 全局代理，让出口变回国内 |
| QQ 扫码 `ErrCode 3` | 二维码过期 | 面板里刷新再扫 |
| 群里 @ 没反应 | 群号没进白名单 / relay 没连上 | 面板点「保存并重连」 |
| B 站私信不回 | 会话在等审批 | `/permission` 设完全权限 |
| 重启 Docker 后 QQ 掉线 | 老镜像不保存登录态 | 重新扫码；或换新版镜像 |
| 私聊桥窗口一关就收不到 | 它是前台进程 | 别关窗口；或做成开机自启 |

---

## 10. 以后每天怎么开

1. 打开 **Docker Desktop**，等容器起来
2. `npx @deepseek-ai/dsh web`
3. 双击 `qq-private\启动私聊.bat`
4. 浏览器打开终端打印的地址

想省事就把 Docker 和私聊桥都设成开机自启（`Win+R` → `shell:startup` 放快捷方式），
电脑电源设置里「插电时不睡眠」。
