@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QQ 私聊桥 - 鱼鱼
echo ============================================
echo  QQ 私聊桥启动中（群聊走 DSH 插件，不受影响）
echo  窗口别关，关了就收不到私聊
echo  停止：Ctrl+C 或关闭窗口
echo ============================================
echo.
node bridge.mjs
echo.
echo 已退出。
pause
