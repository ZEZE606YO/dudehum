/* ============================================================
   DUDEHUM — Email sender (Brevo HTTP API)
   Uses only Node's built-in `https` — no third-party packages.

   Config is read from (in order):
     1. Environment variables: BREVO_API_KEY, MAIL_SENDER_EMAIL, MAIL_SENDER_NAME
     2. server/data/mail.config.json  (git-ignored)
   If no API key is found, runs in DEV MODE: emails are printed to
   the console instead of being sent, so the app keeps working.
   ============================================================ */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "data", "mail.config.json");

function loadConfig() {
  let cfg = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) { /* ignore malformed file */ }
  return {
    apiKey: process.env.BREVO_API_KEY || cfg.apiKey || "",
    senderEmail: process.env.MAIL_SENDER_EMAIL || cfg.senderEmail || "",
    senderName: process.env.MAIL_SENDER_NAME || cfg.senderName || "DUDEHUM",
    // Public base URL used for links inside emails (e.g. the tunnel/host URL)
    publicUrl: (process.env.MAIL_PUBLIC_URL || cfg.publicUrl || "http://localhost:5173").replace(/\/+$/, "")
  };
}

/* POST to Brevo. Resolves { ok, status, dev, body }. Never throws. */
function sendMail(opts) {
  const cfg = loadConfig();
  const to = opts.to;
  const toName = opts.toName || "";
  const subject = opts.subject || "";
  const html = opts.html || "";

  // ----- DEV MODE (no key configured) -----
  if (!cfg.apiKey || !cfg.senderEmail) {
    console.log("\n===== [MAIL:DEV] ยังไม่ได้ตั้งค่า Brevo — จำลองการส่งอีเมล =====");
    console.log("ถึง    :", toName ? `${toName} <${to}>` : to);
    console.log("หัวข้อ :", subject);
    console.log("(ตั้งค่า API key ใน server/data/mail.config.json เพื่อส่งจริง)\n");
    return Promise.resolve({ ok: true, dev: true, status: 0 });
  }

  const payload = JSON.stringify({
    sender: { name: cfg.senderName, email: cfg.senderEmail },
    to: [{ email: to, name: toName || to }],
    subject: subject,
    htmlContent: html
  });

  const options = {
    method: "POST",
    hostname: "api.brevo.com",
    path: "/v3/smtp/email",
    headers: {
      "api-key": cfg.apiKey,
      "Content-Type": "application/json",
      "accept": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) console.error("[MAIL] Brevo ส่งไม่สำเร็จ:", res.statusCode, body);
        resolve({ ok: ok, dev: false, status: res.statusCode, body: body });
      });
    });
    req.on("error", (err) => {
      console.error("[MAIL] เชื่อมต่อ Brevo ไม่ได้:", err.message);
      resolve({ ok: false, dev: false, status: 0, error: err.message });
    });
    req.write(payload);
    req.end();
  });
}

/* ----- Templates ----- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function welcomeEmail(name, email) {
  const safeName = esc(name || "ลูกค้า");
  const base = esc(loadConfig().publicUrl);
  return {
    to: email,
    toName: name,
    subject: "ยินดีต้อนรับสู่ DUDEHUM 🧡",
    html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f6f7fb;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(40,30,90,.15);">
    <div style="background:linear-gradient(120deg,#ee4d2d 0%,#ff7a1a 50%,#ffb443 100%);padding:36px 32px;color:#fff;">
      <h1 style="margin:0;font-size:26px;">ยินดีต้อนรับ, ${safeName}! 🧡</h1>
      <p style="margin:8px 0 0;opacity:.95;">ขอบคุณที่สมัครสมาชิกร้าน DUDEHUM</p>
    </div>
    <div style="padding:32px;color:#1a1c2b;line-height:1.7;">
      <p>บัญชีของคุณพร้อมใช้งานแล้ว 🎉 ตอนนี้คุณสามารถ:</p>
      <ul style="padding-left:18px;color:#565a73;">
        <li>🎁 รับโค้ดส่วนลดเฉพาะสมาชิก</li>
        <li>⭐ สะสมแต้มทุกการช้อป</li>
        <li>📦 ติดตามคำสั่งซื้อได้ในที่เดียว</li>
      </ul>
      <p style="margin-top:24px;">
        <a href="${base}/account.html"
           style="display:inline-block;background:#ee4d2d;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px;">
          เข้าสู่บัญชีของฉัน
        </a>
      </p>
      <p style="color:#98a;margin-top:28px;font-size:13px;">
        อีเมลนี้ส่งถึง ${esc(email)} เพราะมีการสมัครสมาชิกด้วยอีเมลนี้ที่ DUDEHUM
        หากคุณไม่ได้เป็นผู้สมัคร สามารถเพิกเฉยต่ออีเมลฉบับนี้ได้
      </p>
    </div>
  </div>
</div>`
  };
}

function otpEmail(name, email, code) {
  const safeName = esc(name || "ลูกค้า");
  const digits = esc(code).split("").map((d) =>
    `<span style="display:inline-block;min-width:44px;font-size:30px;font-weight:800;letter-spacing:2px;color:#ee4d2d;background:#fff3ee;border:1px solid #ffd9cb;border-radius:12px;padding:12px 0;margin:0 4px;">${d}</span>`
  ).join("");
  return {
    to: email,
    toName: name,
    subject: `รหัสยืนยัน DUDEHUM ของคุณคือ ${esc(code)}`,
    html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f6f7fb;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(40,30,90,.15);">
    <div style="background:linear-gradient(120deg,#ee4d2d 0%,#ff7a1a 50%,#ffb443 100%);padding:32px;color:#fff;">
      <h1 style="margin:0;font-size:24px;">ยืนยันการสมัครสมาชิก 🧡</h1>
      <p style="margin:8px 0 0;opacity:.95;">สวัสดี ${safeName} กรอกรหัสด้านล่างเพื่อยืนยันอีเมลของคุณ</p>
    </div>
    <div style="padding:32px;color:#1a1c2b;line-height:1.7;text-align:center;">
      <p style="margin:0 0 18px;color:#565a73;">รหัสยืนยัน (OTP) ของคุณคือ</p>
      <div style="white-space:nowrap;">${digits}</div>
      <p style="color:#565a73;margin-top:22px;">รหัสนี้ใช้ได้ภายใน <b>10 นาที</b> และใช้ได้ครั้งเดียว</p>
      <p style="color:#98a;margin-top:24px;font-size:13px;">
        ถ้าคุณไม่ได้สมัครสมาชิก DUDEHUM สามารถเพิกเฉยต่ออีเมลฉบับนี้ได้
        กรุณาอย่าเปิดเผยรหัสนี้ให้ผู้อื่น
      </p>
    </div>
  </div>
</div>`
  };
}

function resetEmail(name, email, code) {
  const safeName = esc(name || "ลูกค้า");
  const digits = esc(code).split("").map((d) =>
    `<span style="display:inline-block;min-width:44px;font-size:30px;font-weight:800;letter-spacing:2px;color:#ee4d2d;background:#fff3ee;border:1px solid #ffd9cb;border-radius:12px;padding:12px 0;margin:0 4px;">${d}</span>`
  ).join("");
  return {
    to: email,
    toName: name,
    subject: `รหัสรีเซ็ตรหัสผ่าน DUDEHUM คือ ${esc(code)}`,
    html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f6f7fb;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(40,30,90,.15);">
    <div style="background:linear-gradient(120deg,#ee4d2d 0%,#ff7a1a 50%,#ffb443 100%);padding:32px;color:#fff;">
      <h1 style="margin:0;font-size:24px;">รีเซ็ตรหัสผ่าน 🔑</h1>
      <p style="margin:8px 0 0;opacity:.95;">สวัสดี ${safeName} มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้</p>
    </div>
    <div style="padding:32px;color:#1a1c2b;line-height:1.7;text-align:center;">
      <p style="margin:0 0 18px;color:#565a73;">รหัสยืนยัน (OTP) สำหรับตั้งรหัสใหม่คือ</p>
      <div style="white-space:nowrap;">${digits}</div>
      <p style="color:#565a73;margin-top:22px;">รหัสนี้ใช้ได้ภายใน <b>10 นาที</b> และใช้ได้ครั้งเดียว</p>
      <p style="color:#98a;margin-top:24px;font-size:13px;">
        ถ้าคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลฉบับนี้ —
        รหัสผ่านเดิมของคุณจะยังใช้งานได้ตามปกติ และอย่าเปิดเผยรหัสนี้ให้ผู้อื่น
      </p>
    </div>
  </div>
</div>`
  };
}

module.exports = { sendMail, welcomeEmail, otpEmail, resetEmail, loadConfig };
