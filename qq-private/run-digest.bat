@echo off
chcp 65001 >nul
cd /d "%~dp0"
node daily-digest.mjs >> digest.log 2>&1