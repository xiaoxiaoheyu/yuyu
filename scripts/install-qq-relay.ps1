param(
  [string]$Profile = "web",
  [string]$Tag = "v0.25.6"
)
$ErrorActionPreference = "Stop"
$dest = Join-Path $env:USERPROFILE ".dsh\plugins\dsh-qq-relay"

Write-Host "== 1/2 下载 dsh-qq-relay $Tag ==" -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "fetch-github.mjs") "FablerTan/dsh-qq-relay" $Tag $dest

Write-Host "== 2/2 装进 profile: $Profile ==" -ForegroundColor Cyan
$link = "link:" + ($dest -replace '\\', '/')
npx --yes @deepseek-ai/dsh plugin --profile $Profile add $link

Write-Host ""
Write-Host "完成。接下来：" -ForegroundColor Green
Write-Host "  1. 重启 DSH，插件面板里找到 dsh-qq-relay"
Write-Host "  2. 填 wsUrl / accessToken / selfId / 群号"
Write-Host "  3. 点「保存并重连」"
