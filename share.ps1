# เปิดเว็บ DUDEHUM ให้เข้าผ่านลิงก์สาธารณะด้วย Cloudflare Tunnel (ฟรี ไม่ต้องสมัคร)
#
# วิธีใช้:
#   1) เปิดเซิร์ฟเวอร์เว็บก่อน:   npm start        (รันที่ http://localhost:5173)
#   2) เปิดอีกหน้าต่างแล้วรัน:    powershell -ExecutionPolicy Bypass -File share.ps1
#   3) รอสักครู่ จะได้ลิงก์ https://xxxx.trycloudflare.com  ส่งให้ใครก็เข้าได้
#
# หมายเหตุ: ลิงก์จะใช้ได้ตราบใดที่คอมเปิดอยู่ + หน้าต่างนี้ยังรัน  (กด Ctrl+C เพื่อปิด)
#           ลิงก์จะเปลี่ยนใหม่ทุกครั้งที่รันสคริปต์นี้ — ถ้าจะให้ลิงก์ในอีเมลถูกต้อง
#           อย่าลืมอัปเดต "publicUrl" ใน server/data/mail.config.json ให้ตรงลิงก์ใหม่

param([int]$Port = 5173)

$cf = @(
  "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  "C:\Program Files\cloudflared\cloudflared.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $cf) {
  $c = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($c) { $cf = $c.Source }
}
if (-not $cf) {
  Write-Host "ไม่พบ cloudflared — ติดตั้งด้วย:  winget install Cloudflare.cloudflared"
  exit 1
}

Write-Host "กำลังเปิด Cloudflare Tunnel ชี้ไปที่ http://localhost:$Port ..."
Write-Host "(รอ URL สักครู่ กด Ctrl+C เพื่อหยุด)`n"
& $cf tunnel --url "http://localhost:$Port" --no-autoupdate
