param(
  [string]$Profile = "web",
  [string]$Tag = "v0.4.6"
)
$ErrorActionPreference = "Stop"
$dest = Join-Path $env:USERPROFILE ".dsh\plugins\dsh-bili-whale"

Write-Host "== 1/2 下载 dsh-bili-whale $Tag ==" -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "fetch-github.mjs") "Alterssss/dsh-bili-whale" $Tag $dest

Write-Host "== 2/2 装进 profile: $Profile ==" -ForegroundColor Cyan
$link = "link:" + ($dest -replace '\\', '/')
npx --yes @deepseek-ai/dsh plugin --profile $Profile add $link

Write-Host ""
Write-Host "完成。接下来：" -ForegroundColor Green
Write-Host "  1. 重启 DSH，设置里出现「养鱼」"
Write-Host "  2. 填 B 站 Cookie（SESSDATA / bili_jct / buvid3）"
Write-Host "  3. 填主人的 mid 和昵称"
Write-Host "  4. 点「依赖体检」"
