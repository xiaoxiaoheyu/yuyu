param(
  [string]$Time = "08:00"
)
$ErrorActionPreference = "Stop"
$bat = Join-Path $PSScriptRoot "run-digest.bat"
if (-not (Test-Path $bat)) { throw "找不到 run-digest.bat" }
if (-not (Test-Path (Join-Path $PSScriptRoot "config.json"))) { throw "缺少 config.json，先复制 config.example.json 并填写" }

$cmd = 'schtasks /Create /F /TN "YuyuDailyDigest" /TR "' + $bat + '" /SC DAILY /ST ' + $Time
cmd /c $cmd
if ($LASTEXITCODE -ne 0) { throw "创建计划任务失败（可能需要管理员权限）" }

Write-Host ""
Write-Host "已注册：每天 $Time 自动发简报" -ForegroundColor Green
Write-Host "查看：schtasks /Query /TN YuyuDailyDigest"
Write-Host "删除：schtasks /Delete /TN YuyuDailyDigest /F"
Write-Host "立即测试：双击 发送简报.bat"