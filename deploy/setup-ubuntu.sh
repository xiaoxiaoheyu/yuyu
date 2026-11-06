#!/usr/bin/env bash
# 鱼鱼 Ubuntu 初始化：时区 / swap / Node 20 / Docker
# 用法：bash deploy/setup-ubuntu.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 1/5 设置时区 Asia/Shanghai =="
timedatectl set-timezone Asia/Shanghai || true

echo "== 2/5 安装基础包 =="
apt-get update -y
apt-get install -y curl git unzip htop ca-certificates

echo "== 3/5 配置 2G swap =="
if swapon --show | grep -q '/swapfile'; then
  echo "swap 已存在，跳过"
else
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  echo "swap 已开启"
fi

echo "== 4/5 安装 Node 20 =="
if command -v node >/dev/null 2>&1 && node -v | grep -q '^v20'; then
  echo "Node 已存在：$(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "== 5/5 安装 Docker =="
if command -v docker >/dev/null 2>&1; then
  echo "Docker 已存在：$(docker -v)"
else
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo ""
echo "===== 结果 ====="
node -v
docker -v
free -h | head -3
echo ""
echo "下一步："
echo "  mkdir -p /opt && cd /opt"
echo "  git clone https://github.com/xiaoxiaoheyu/yuyu.git"
echo "  cd yuyu && bash deploy/setup-ubuntu.sh   # 可重复执行"
