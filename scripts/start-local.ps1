# 启动 taiping_blog 本地测试（edge + studio）
# 用法：pwsh -File scripts/start-local.ps1
# 说明：使用 WMI 创建独立进程，避免终端会话结束后子进程被回收。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$temp = $env:TEMP
$edgeLog = Join-Path $temp 'taiping-edge.out.log'
$edgeErr = Join-Path $temp 'taiping-edge.err.log'
$studioLog = Join-Path $temp 'taiping-studio.out.log'
$studioErr = Join-Path $temp 'taiping-studio.err.log'

if (-not (Test-Path (Join-Path $root 'apps/edge/.dev.vars'))) {
  Copy-Item (Join-Path $root 'apps/edge/.dev.vars.example') (Join-Path $root 'apps/edge/.dev.vars')
  Write-Host '已从示例创建 .dev.vars，请按需修改密钥后重试。'
}

function Start-Independent([string]$commandLine) {
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
  if ($result.ReturnValue -ne 0) {
    throw "进程创建失败 ReturnValue=$($result.ReturnValue)"
  }
  return $result.ProcessId
}

if (-not (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) {
  $pidEdge = Start-Independent "cmd.exe /c cd /d `"$root`" && pnpm -F @taiping/edge dev > `"$edgeLog`" 2> `"$edgeErr`""
  Write-Host "启动 edge :8787 PID=$pidEdge"
} else {
  Write-Host 'edge :8787 已在监听'
}

if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
  $pidStudio = Start-Independent "cmd.exe /c cd /d `"$root`" && pnpm -F @taiping/studio dev > `"$studioLog`" 2> `"$studioErr`""
  Write-Host "启动 studio :5173 PID=$pidStudio"
} else {
  Write-Host 'studio :5173 已在监听'
}

$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 2
    if ($h.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
}

if (-not $ready) {
  Write-Host 'edge 启动失败，最近错误日志：'
  Get-Content $edgeErr -ErrorAction SilentlyContinue | Select-Object -Last 40
  exit 1
}

Write-Host 'edge health:' (Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing).Content
$public = Invoke-WebRequest 'http://127.0.0.1:8787/' -UseBasicParsing
Write-Host "public home: $($public.StatusCode), paper-texture=$($public.Content -match 'paper-texture')"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$adminUser = if ($env:TAIPING_USER) { $env:TAIPING_USER } else { 'admin' }
$adminPass = $env:TAIPING_PASS
if (-not $adminPass) {
  Write-Host '缺少 TAIPING_PASS 环境变量，跳过后台接口自检（前台与后台页面不受影响）。'
  Write-Host '如需自检：$env:TAIPING_PASS = "<管理口令>" 后重跑本脚本。'
} else {
  $loginBody = @{ username = $adminUser; password = $adminPass; trusted = $true } | ConvertTo-Json -Compress
  $login = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/admin/auth/login' -Method POST `
    -ContentType 'application/json' -Headers @{ 'X-Requested-With' = 'XMLHttpRequest' } `
    -Body $loginBody `
    -WebSession $session -UseBasicParsing
  Write-Host "login: $($login.StatusCode) $($login.Content)"
  $ov = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/admin/overview' -WebSession $session -UseBasicParsing
  Write-Host "overview: $($ov.Content)"
}

$studioReady = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $s = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
    if ($s.StatusCode -eq 200) { $studioReady = $true; break }
  } catch {
    try {
      $s = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 2
      if ($s.StatusCode -eq 200) { $studioReady = $true; break }
    } catch {}
  }
  Start-Sleep -Seconds 1
}
Write-Host "studio ready: $studioReady"

Write-Host ''
Write-Host '访问地址：'
Write-Host '  前台        http://127.0.0.1:8787/'
Write-Host '  后台(同域)  http://127.0.0.1:8787/admin/'
Write-Host '  后台(HMR)   http://127.0.0.1:5173/ 或 http://localhost:5173/'
Write-Host '  账号        见 apps/edge/.dev.vars 的 ADMIN_USERNAME / ADMIN_PASSWORD'
Write-Host "日志: $edgeLog / $studioLog"
