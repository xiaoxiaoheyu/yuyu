@echo off
chcp 65001 >nul
cd /d "%~dp0"
node daily-digest.mjs --dry
echo.
echo （上面是预览，没有真的发送）
pause
