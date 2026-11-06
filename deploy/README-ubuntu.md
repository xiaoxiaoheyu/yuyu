# 在 Ubuntu 云服务器上部署鱼鱼

> 适用：全新 4C4G（或 2C4G）腾讯云/阿里云轻量，Ubuntu 22.04 LTS。
> 全程约 40 分钟，命令可以直接复制粘贴。

---

## 0. 买机器时选什么

| 项 | 选 |
|---|---|
| 镜像类型 | **基于操作系统镜像** |
| 系统 | **Ubuntu 22.04 LTS**（不要 CentOS、不要应用镜像） |
| 登录 | 自定义密码（≥12 位）或 SSH 密钥 |
| 端口 | 安全组只需放行 **22（SSH）** |

> 不需要备案：鱼鱼用 3080 / 6099 / 3001 端口，不碰 80/443，也没有域名。

---

## 1. 登录服务器

在你自己电脑的 PowerShell 里：

```powershell
ssh root@<服务器IP>
```

第一次问 `yes/no` 输入 `yes`，再输密码（**输入时不显示字符**，正常）。

**检查点**：提示符变成 `root@VM-...:~#`。

---

## 2. 一键初始化

```bash
apt-get update -y && apt-get install -y git
mkdir -p /opt && cd /opt
git clone https://github.com/xiaoxiaoheyu/yuyu.git
cd yuyu
bash deploy/setup-ubuntu.sh
```

这个脚本会做五件事：设时区 → 装基础包 → 加 2G swap → 装 Node 20 → 装 Docker。

> GitHub 不通时用镜像：
> ```bash
> git clone https://gitclone.com/github.com/xiaoxiaoheyu/yuyu.git
> ```

**检查点**：

```
v20.x.x
Docker version 2x.x.x
Swap: 2.0Gi
```

---

## 3. 起 NapCat

```bash
cd /opt/yuyu
mkdir -p napcat
cp deploy/napcat-compose.yaml napcat/compose.yaml
cd napcat
nano compose.yaml
```

把 `WEBUI_TOKEN=change-me-please` 改成你自己的随机串（例：`yuyu2026token`）。
`Ctrl+O` 回车保存，`Ctrl+X` 退出。

```bash
docker compose up -d
docker ps
```

**检查点**：`docker ps` 里出现 `napcat`，状态 `Up`。

> 第一次拉镜像约 2 GB，国内走 `hub.rat.dev` 源，5–15 分钟。

---

## 4. 扫码登录 QQ（SSH 隧道，别开公网端口）

在**你自己电脑**上另开一个 PowerShell：

```powershell
ssh -L 6099:127.0.0.1:6099 root@<服务器IP>
```

保持窗口开着，浏览器打开：

```
http://127.0.0.1:6099/webui?token=你设的token
```

「QQ 登录」→ 用**小号**扫 → 手机确认。

> ⚠️ 扫码前别开代理/TUN。机房 IP 已经在国内，代理一开就变海外，QQ 会拒绝登录。

**检查点**：

```bash
docker logs napcat --tail 30 | grep -E "OneBot|适配器"
```

出现 `OneBot11 适配器初始化完成`。

---

## 5. 开 OneBot 通道

NapCat 面板 → **网络配置** → 新建 → **WebSocket 服务器**：

| 项 | 值 |
|---|---|
| 端口 | 3001 |
| Token | 自己定一串（记下来，后面要用） |
| 启用 | ✅ |

**检查点**：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001` 返回非 000。

---

## 6. 先手动跑一次 DSH

```bash
cd /opt/yuyu
npx --yes @deepseek-ai/dsh web --port 3080 --no-open
```

第一次会下载依赖，等它打印监听地址。`Ctrl+C` 停掉。

**检查点**：看到 `3080` 相关输出，没有报错。

---

## 7. 配成系统服务

```bash
cp deploy/yuyu-dsh.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now yuyu-dsh
systemctl status yuyu-dsh --no-pager
```

**检查点**：状态 `active (running)`。

访问方式（不要开 3080 到公网）：

```powershell
ssh -L 3080:127.0.0.1:3080 root@<服务器IP>
```

浏览器打开 `http://127.0.0.1:3080`。

---

## 8. 装两个插件

```bash
cd /opt/yuyu
node scripts/fetch-github.mjs Alterssss/dsh-bili-whale v0.4.6 ~/.dsh/plugins/dsh-bili-whale
npx --yes @deepseek-ai/dsh plugin --profile web add "link:$HOME/.dsh/plugins/dsh-bili-whale"

node scripts/fetch-github.mjs FablerTan/dsh-qq-relay v0.25.6 ~/.dsh/plugins/dsh-qq-relay
npx --yes @deepseek-ai/dsh plugin --profile web add "link:$HOME/.dsh/plugins/dsh-qq-relay"

systemctl restart yuyu-dsh
```

**检查点**：`systemctl status yuyu-dsh` 仍是 running；网页设置里能看到「养鱼」和 `dsh-qq-relay`。

---

## 9. 配置 B 站（网页里操作）

1. 设置 → **养鱼** → B 站登录 → **扫码**（用 B 站小号扫，别拷 Cookie）
2. 填「她是谁」：角色名、称呼、**你的 B 站 mid 和昵称**
3. 点 **保存**
4. 点 **依赖体检**，全绿为止

**给她权限**：工作区 → 未分组 → `bili-whale` 会话 → `/permission` → 完全权限。

---

## 10. 配置 QQ 群（网页里操作）

插件面板 → `dsh-qq-relay` → 连接：

| 字段 | 值 |
|---|---|
| wsUrl | `ws://127.0.0.1:3001` |
| accessToken | 第 5 步的 token |
| selfId | QQ 小号号码 |
| 群白名单 | 你的群号 |

点 **保存并重连**。群会话也要 `/permission` 设完全权限。

---

## 11. 私聊桥 + 每日简报

```bash
cd /opt/yuyu/qq-private
cp config.example.json config.json
nano config.json
```

至少改：`onebotToken`、`ownerQq`、`botQq`、`ownerTitle`、`cityName`。

先手动验证：

```bash
node bridge.mjs
```

看到「已连接 NapCat，等待私聊消息…」后 `Ctrl+C`，然后：

```bash
cp ../deploy/yuyu-bridge.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now yuyu-bridge
```

简报用 cron：

```bash
crontab -e
```

加一行（每天 08:00）：

```
0 8 * * * cd /opt/yuyu/qq-private && /usr/bin/node daily-digest.mjs >> digest.log 2>&1
```

---

## 12. 验收

| # | 测什么 | 期望 |
|---|---|---|
| 1 | 群里 @ 小号 | 回复 |
| 2 | 主号私聊小号 | 回复，称呼正确 |
| 3 | B 站评论 @ 她 | 回复 |
| 4 | B 站私信她 | 回复（不弹审批） |
| 5 | 手动跑简报 | 收到消息 |

---

## 日常运维

| 操作 | 命令 |
|---|---|
| 看 DSH 日志 | `journalctl -u yuyu-dsh -f` |
| 看私聊桥日志 | `journalctl -u yuyu-bridge -f` |
| 看 NapCat 日志 | `docker logs napcat --tail 50` |
| 重启全部 | `systemctl restart yuyu-dsh yuyu-bridge && docker restart napcat` |
| 看内存 | `free -h` |
| 看磁盘 | `df -h /` |

## 常见问题

| 现象 | 处理 |
|---|---|
| QQ 掉线（日志出现二维码） | WebUI 重新扫码；尽量别重启容器 |
| `docker compose` 拉不动 | 确认 compose 里是 `hub.rat.dev` 源 |
| `git clone` 失败 | 换 `gitclone.com` 镜像 |
| DSH 起不来 | `journalctl -u yuyu-dsh -n 50` 看报错 |
| 内存告警 | `free -h`，swap 用超 50% 就该升配 |
