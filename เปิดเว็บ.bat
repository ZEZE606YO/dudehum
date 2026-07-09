@echo off
chcp 65001 >nul
title DUDEHUM Server - อย่าปิดหน้าต่างนี้ (เว็บจะดับ)
cd /d "%~dp0"
echo ==================================================
echo   DUDEHUM Web Server
echo   เว็บจะออนไลน์ตราบใดที่หน้าต่างนี้เปิดอยู่
echo   ปิดหน้าต่างนี้ = เว็บดับ
echo ==================================================
echo.
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server\server.js
) else (
  node server\server.js
)
echo.
echo [เซิร์ฟเวอร์หยุดทำงานแล้ว]
pause
