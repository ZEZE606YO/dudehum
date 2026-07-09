# ============================================================
#  DUDEHUM - web on/off control (operated by Claude on request)
#  Usage:  powershell -ExecutionPolicy Bypass -File webctl.ps1 <action>
#  action = start | stop | restart | status
# ============================================================
param(
  [ValidateSet('start','stop','restart','status')]
  [string]$Action = 'status'
)
$ErrorActionPreference = 'SilentlyContinue'

$root   = $PSScriptRoot
$port   = 5173
$outLog = Join-Path $env:TEMP 'dudehum-server.out.log'
$errLog = Join-Path $env:TEMP 'dudehum-server.err.log'

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { $node = $c.Source }
}

function Get-WebPid {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { return ($conn.OwningProcess | Select-Object -First 1) }
  return $null
}
function Get-TunnelPid {
  $t = Get-Process cloudflared -ErrorAction SilentlyContinue
  if ($t) { return ($t.Id | Select-Object -First 1) }
  return $null
}

function Do-Start {
  $ex = Get-WebPid
  if ($ex) { Write-Host "[=] web already ON (PID $ex)"; return }
  Start-Process -FilePath $node -ArgumentList "server/server.js" -WorkingDirectory $root `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
  Start-Sleep -Seconds 3
  $now = Get-WebPid
  if ($now) { Write-Host "[ON] web started (PID $now) -> http://localhost:$port" }
  else { Write-Host "[!] failed to start, see log: $errLog" }
}

function Do-Stop {
  $wpid = Get-WebPid
  if (-not $wpid) { Write-Host "[=] web already OFF"; return }
  Stop-Process -Id $wpid -Force
  Start-Sleep -Seconds 1
  Write-Host "[OFF] web stopped (was PID $wpid)"
}

function Do-Status {
  $wpid = Get-WebPid
  $tpid = Get-TunnelPid
  if ($wpid) { Write-Host "web (Node)     : ON  (PID $wpid, port $port)" }
  else        { Write-Host "web (Node)     : OFF" }
  if ($tpid) { Write-Host "link (tunnel)  : ON  (cloudflared PID $tpid)" }
  else        { Write-Host "link (tunnel)  : OFF" }
}

switch ($Action) {
  'start'   { Do-Start }
  'stop'    { Do-Stop }
  'restart' { Do-Stop; Do-Start }
  'status'  { Do-Status }
}
