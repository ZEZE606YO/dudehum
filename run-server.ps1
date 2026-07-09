# เปิดเว็บเซิร์ฟเวอร์ DUDEHUM (รันค้างไว้ อย่าปิดหน้าต่างนี้ถ้าอยากให้เว็บออนไลน์)
$Host.UI.RawUI.WindowTitle = "DUDEHUM Server - อย่าปิดหน้าต่างนี้ (เว็บจะดับ)"
Set-Location $PSScriptRoot
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host " DUDEHUM Web Server" -ForegroundColor Yellow
Write-Host " เว็บจะออนไลน์ตราบใดที่หน้าต่างนี้เปิดอยู่" -ForegroundColor Yellow
Write-Host " ปิดหน้าต่างนี้ = เว็บดับ" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow

# หา node ให้เจอ (เผื่อ PATH ยังไม่มี node)
$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source } else { Write-Host "ไม่พบ node.exe" -ForegroundColor Red; Read-Host; exit 1 }
}
& $node server/server.js
Write-Host "`n[เซิร์ฟเวอร์หยุดทำงานแล้ว] กด Enter เพื่อปิด" -ForegroundColor Red
Read-Host