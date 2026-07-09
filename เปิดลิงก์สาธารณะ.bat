@echo off
chcp 65001 >nul
title DUDEHUM Tunnel - อย่าปิดหน้าต่างนี้ (ลิงก์จะดับ)
echo ==================================================
echo   Cloudflare Tunnel — เปิดให้คนอื่นเข้าผ่านลิงก์
echo   รอสักครู่จะได้ลิงก์ https://xxxx.trycloudflare.com
echo   (เปิด "เปิดเว็บ.bat" ให้เซิร์ฟเวอร์รันก่อนด้วย)
echo.
echo   * ลิงก์จะเปลี่ยนใหม่ทุกครั้ง อย่าลืมอัปเดต publicUrl
echo     ใน server\data\mail.config.json ให้ตรงลิงก์ใหม่
echo ==================================================
echo.
set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist %CF% set CF=cloudflared
%CF% tunnel --url http://localhost:5173 --no-autoupdate
echo.
echo [Tunnel หยุดทำงานแล้ว]
pause
