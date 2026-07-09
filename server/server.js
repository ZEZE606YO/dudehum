/* ============================================================
   DUDEHUM — Real backend (Node.js, built-in modules ONLY)
   No third-party npm packages -> no supply-chain risk.

   - Serves the static site (../)
   - REST API for auth under /api/*
   - Passwords hashed with scrypt + per-user random salt
   - Stateless session via HMAC-signed, httpOnly cookie
   - Users persisted to server/data/users.json
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mailer = require("./mailer");

const PORT = process.env.PORT || 5173;
const ROOT = path.join(__dirname, "..");          // static site root
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PENDING_FILE = path.join(DATA_DIR, "pending.json");
const RESET_FILE = path.join(DATA_DIR, "reset.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const COOKIE = "dh_session";
const SESSION_DAYS = 7;

// OTP settings
const OTP_TTL_MS = 10 * 60 * 1000;   // OTP valid for 10 minutes
const OTP_MAX_ATTEMPTS = 5;          // wrong tries before OTP is voided
const RESEND_COOLDOWN_MS = 60 * 1000; // min gap between OTP emails

/* ---------- storage helpers ---------- */
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
}

/* Save a base64 data-URL image to uploads/, return public path or null */
function saveProductImage(dataUrl, id) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3 * 1024 * 1024) return null;   // 3MB cap after decode
  const file = id + "." + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), buf);
  return "/uploads/" + file;
}
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch (e) { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* Pending sign-ups awaiting OTP verification. Keyed by email. */
function readPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")); }
  catch (e) { return {}; }
}
function writePending(map) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(map, null, 2));
}
/* Drop expired pending entries so the file doesn't grow forever. */
function prunePending(map) {
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(map)) {
    if (!map[k] || map[k].exp < now) { delete map[k]; changed = true; }
  }
  return changed;
}

/* Password-reset requests awaiting OTP. Keyed by email. */
function readReset() {
  try { return JSON.parse(fs.readFileSync(RESET_FILE, "utf8")); }
  catch (e) { return {}; }
}
function writeReset(map) {
  fs.writeFileSync(RESET_FILE, JSON.stringify(map, null, 2));
}

/* Products listed for sale by users. Array. */
function readProducts() {
  try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8")); }
  catch (e) { return []; }
}
function writeProducts(list) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(list, null, 2));
}
/* Current logged-in user from cookie, or null */
function sessionUser(req) {
  return verify(parseCookies(req)[COOKIE]);
}

/* Server secret for signing session cookies (generated once, kept locally) */
function getSecret() {
  ensureData();
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("hex"));
  }
  return fs.readFileSync(SECRET_FILE, "utf8");
}
const SECRET = getSecret();

/* ---------- password hashing (scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const a = Buffer.from(hash, "hex");
  return a.length === test.length && crypto.timingSafeEqual(a, test);
}

/* Random 6-digit OTP code (as a string, zero-padded) */
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

/* ---------- session token (HMAC-signed, stateless) ---------- */
function sign(payloadObj) {
  const body = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

/* ---------- tiny http utils ---------- */
function json(res, status, obj, headers) {
  const data = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, headers || {}));
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 8e6) req.destroy();   // ~8MB guard (รองรับรูปที่บีบอัดแล้ว)
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { resolve({}); }
    });
  });
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function clearCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const route = url.pathname;

  // Step 1 of sign-up: validate, create a PENDING entry, email an OTP.
  // The real account is only created after /api/verify-otp succeeds.
  if (route === "/api/register" && req.method === "POST") {
    const b = await readBody(req);
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!name) return json(res, 400, { error: "กรุณากรอกชื่อ" });
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: "อีเมลไม่ถูกต้อง" });
    if (password.length < 6) return json(res, 400, { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });

    const users = readUsers();
    if (users.some((u) => u.email === email)) {
      return json(res, 409, { error: "อีเมลนี้ถูกใช้สมัครไปแล้ว" });
    }

    const pending = readPending();
    prunePending(pending);
    const otp = generateOtp();
    pending[email] = {
      name,
      email,
      pass: hashPassword(password),
      otp: hashPassword(otp),          // OTP stored hashed, never in plaintext
      exp: Date.now() + OTP_TTL_MS,
      attempts: 0,
      lastSent: Date.now()
    };
    writePending(pending);

    const mail = mailer.otpEmail(name, email, otp);
    const r = await mailer.sendMail(mail);
    if (r.dev) console.log("[MAIL] dev mode — OTP for", email, "=", otp);
    else if (r.ok) console.log("[MAIL] OTP email sent to", email);
    else {
      console.warn("[MAIL] OTP email FAILED for", email, r.status || r.error || "");
      delete pending[email];
      writePending(pending);
      return json(res, 502, { error: "ส่งอีเมล OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }

    return json(res, 200, { pending: true, email: email, ttl: OTP_TTL_MS });
  }

  // Step 2 of sign-up: verify the OTP, then create the account + log in.
  if (route === "/api/verify-otp" && req.method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    const otp = String(b.otp || "").trim();

    const pending = readPending();
    const p = pending[email];
    if (!p) return json(res, 400, { error: "ไม่พบคำขอสมัคร กรุณาสมัครใหม่อีกครั้ง" });
    if (Date.now() > p.exp) {
      delete pending[email]; writePending(pending);
      return json(res, 400, { error: "รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" });
    }
    if (p.attempts >= OTP_MAX_ATTEMPTS) {
      delete pending[email]; writePending(pending);
      return json(res, 429, { error: "กรอกรหัสผิดหลายครั้งเกินไป กรุณาสมัครใหม่" });
    }
    if (!verifyPassword(otp, p.otp)) {
      p.attempts += 1;
      writePending(pending);
      const left = OTP_MAX_ATTEMPTS - p.attempts;
      return json(res, 401, { error: "รหัส OTP ไม่ถูกต้อง" + (left > 0 ? ` (เหลืออีก ${left} ครั้ง)` : "") });
    }

    // Success — promote pending -> real user
    const users = readUsers();
    if (users.some((u) => u.email === email)) {
      delete pending[email]; writePending(pending);
      return json(res, 409, { error: "อีเมลนี้ถูกใช้สมัครไปแล้ว" });
    }
    const user = { name: p.name, email: p.email, pass: p.pass, verified: true, createdAt: Date.now() };
    users.push(user);
    writeUsers(users);
    delete pending[email];
    writePending(pending);

    // Welcome email (best-effort, don't block)
    mailer.sendMail(mailer.welcomeEmail(user.name, user.email)).then((r) => {
      if (!r.dev && !r.ok) console.warn("[MAIL] welcome email FAILED for", email);
    });

    const token = sign({ email: user.email, name: user.name, exp: Date.now() + SESSION_DAYS * 864e5 });
    return json(res, 200, { user: { name: user.name, email: user.email } }, { "Set-Cookie": sessionCookie(token) });
  }

  // Resend a fresh OTP for an existing pending sign-up (rate-limited).
  if (route === "/api/resend-otp" && req.method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    const pending = readPending();
    const p = pending[email];
    if (!p) return json(res, 400, { error: "ไม่พบคำขอสมัคร กรุณาสมัครใหม่อีกครั้ง" });
    if (Date.now() - (p.lastSent || 0) < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - p.lastSent)) / 1000);
      return json(res, 429, { error: `กรุณารอ ${wait} วินาทีก่อนขอรหัสใหม่` });
    }
    const otp = generateOtp();
    p.otp = hashPassword(otp);
    p.exp = Date.now() + OTP_TTL_MS;
    p.attempts = 0;
    p.lastSent = Date.now();
    writePending(pending);

    const r = await mailer.sendMail(mailer.otpEmail(p.name, email, otp));
    if (r.dev) console.log("[MAIL] dev mode — new OTP for", email, "=", otp);
    else if (!r.ok) return json(res, 502, { error: "ส่งอีเมล OTP ไม่สำเร็จ กรุณาลองใหม่" });
    return json(res, 200, { ok: true, email: email, ttl: OTP_TTL_MS });
  }

  if (route === "/api/login" && req.method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const users = readUsers();
    const user = users.find((u) => u.email === email);
    if (!user) return json(res, 401, { error: "ไม่พบบัญชีนี้ กรุณาสมัครสมาชิกก่อน" });
    if (!verifyPassword(password, user.pass)) {
      return json(res, 401, { error: "รหัสผ่านไม่ถูกต้อง" });
    }
    const token = sign({ email: user.email, name: user.name, exp: Date.now() + SESSION_DAYS * 864e5 });
    return json(res, 200, { user: { name: user.name, email: user.email } }, { "Set-Cookie": sessionCookie(token) });
  }

  // Forgot password — step 1: email an OTP to reset. Also used to resend.
  // Always returns a generic success (doesn't reveal whether the email exists),
  // except a cooldown 429 when a request was just made.
  if (route === "/api/forgot-password" && req.method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: "อีเมลไม่ถูกต้อง" });

    const reset = readReset();
    prunePending(reset); // same shape (has .exp) so pruning works

    const existing = reset[email];
    if (existing && Date.now() - (existing.lastSent || 0) < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.lastSent)) / 1000);
      return json(res, 429, { error: `กรุณารอ ${wait} วินาทีก่อนขอรหัสใหม่` });
    }

    const users = readUsers();
    const user = users.find((u) => u.email === email);
    // Only actually generate + send if the account exists.
    if (user) {
      const otp = generateOtp();
      reset[email] = {
        email,
        otp: hashPassword(otp),
        exp: Date.now() + OTP_TTL_MS,
        attempts: 0,
        lastSent: Date.now()
      };
      writeReset(reset);
      const r = await mailer.sendMail(mailer.resetEmail(user.name, email, otp));
      if (r.dev) console.log("[MAIL] dev mode — reset OTP for", email, "=", otp);
      else if (r.ok) console.log("[MAIL] reset OTP email sent to", email);
      else console.warn("[MAIL] reset OTP email FAILED for", email, r.status || r.error || "");
    } else {
      console.log("[RESET] forgot-password for unknown email (no send):", email);
    }
    return json(res, 200, { ok: true, ttl: OTP_TTL_MS });
  }

  // Forgot password — step 2: verify OTP + set a new password, then log in.
  if (route === "/api/reset-password" && req.method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    const otp = String(b.otp || "").trim();
    const password = String(b.password || "");
    if (password.length < 6) return json(res, 400, { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });

    const reset = readReset();
    const r = reset[email];
    if (!r) return json(res, 400, { error: "ไม่พบคำขอรีเซ็ต กรุณาเริ่มใหม่อีกครั้ง" });
    if (Date.now() > r.exp) {
      delete reset[email]; writeReset(reset);
      return json(res, 400, { error: "รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" });
    }
    if (r.attempts >= OTP_MAX_ATTEMPTS) {
      delete reset[email]; writeReset(reset);
      return json(res, 429, { error: "กรอกรหัสผิดหลายครั้งเกินไป กรุณาเริ่มใหม่" });
    }
    if (!verifyPassword(otp, r.otp)) {
      r.attempts += 1; writeReset(reset);
      const left = OTP_MAX_ATTEMPTS - r.attempts;
      return json(res, 401, { error: "รหัส OTP ไม่ถูกต้อง" + (left > 0 ? ` (เหลืออีก ${left} ครั้ง)` : "") });
    }

    const users = readUsers();
    const user = users.find((u) => u.email === email);
    if (!user) {
      delete reset[email]; writeReset(reset);
      return json(res, 400, { error: "ไม่พบบัญชีนี้" });
    }
    user.pass = hashPassword(password);
    writeUsers(users);
    delete reset[email];
    writeReset(reset);

    const token = sign({ email: user.email, name: user.name, exp: Date.now() + SESSION_DAYS * 864e5 });
    return json(res, 200, { user: { name: user.name, email: user.email } }, { "Set-Cookie": sessionCookie(token) });
  }

  if (route === "/api/logout" && req.method === "POST") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
  }

  if (route === "/api/me" && req.method === "GET") {
    const token = parseCookies(req)[COOKIE];
    const payload = verify(token);
    if (!payload) return json(res, 200, { user: null });
    return json(res, 200, { user: { name: payload.name, email: payload.email } });
  }

  // ---- Products (user listings) ----
  // List all products (public). Marks which ones belong to the caller.
  if (route === "/api/products" && req.method === "GET") {
    const me = sessionUser(req);
    const list = readProducts().map((p) => ({
      id: p.id, name: p.name, price: p.price, oldPrice: p.oldPrice,
      desc: p.desc, icon: p.icon, image: p.image || null, ownerName: p.ownerName,
      mine: !!(me && me.email === p.ownerEmail)
    }));
    return json(res, 200, { products: list });
  }

  // Create a product (must be logged in)
  if (route === "/api/products" && req.method === "POST") {
    const me = sessionUser(req);
    if (!me) return json(res, 401, { error: "กรุณาเข้าสู่ระบบก่อนลงขายสินค้า" });
    const b = await readBody(req);
    const name = String(b.name || "").trim().slice(0, 80);
    const desc = String(b.desc || "").trim().slice(0, 300);
    const icon = String(b.icon || "bag").trim().slice(0, 20);
    const price = Math.round(Number(b.price));
    const oldPrice = b.oldPrice ? Math.round(Number(b.oldPrice)) : 0;
    if (!name) return json(res, 400, { error: "กรุณากรอกชื่อสินค้า" });
    if (!(price >= 0 && price <= 10000000)) return json(res, 400, { error: "ราคาไม่ถูกต้อง" });
    if (oldPrice && oldPrice < price) return json(res, 400, { error: "ราคาเดิมต้องมากกว่าหรือเท่ากับราคาขาย" });

    const id = "p_" + crypto.randomBytes(6).toString("hex");
    const image = b.image ? saveProductImage(b.image, id) : null;   // รูปจากเครื่อง (ถ้ามี)
    const list = readProducts();
    const product = {
      id, name, desc, icon, price, oldPrice, image,
      ownerEmail: me.email, ownerName: me.name,
      createdAt: Date.now()
    };
    list.unshift(product);
    writeProducts(list);
    return json(res, 200, { product: { id, name, price, oldPrice, desc, icon, image, ownerName: me.name, mine: true } });
  }

  // Delete own product
  if (route.startsWith("/api/products/") && req.method === "DELETE") {
    const me = sessionUser(req);
    if (!me) return json(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const id = decodeURIComponent(route.slice("/api/products/".length));
    const list = readProducts();
    const item = list.find((p) => p.id === id);
    if (!item) return json(res, 404, { error: "ไม่พบสินค้านี้" });
    if (item.ownerEmail !== me.email) return json(res, 403, { error: "ลบได้เฉพาะสินค้าของคุณเอง" });
    if (item.image) { try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(item.image))); } catch (e) {} }
    writeProducts(list.filter((p) => p.id !== id));
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "not found" });
}

/* ---------- static files ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
  ".webp": "image/webp", ".woff2": "font/woff2"
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  // prevent path traversal
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("403"); }

  fs.stat(filePath, (err, stat) => {
    let target = filePath;
    if (!err && stat.isDirectory()) target = path.join(filePath, "index.html");
    fs.readFile(target, (e, data) => {
      if (e) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found"); }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}

/* ---------- uploaded images ---------- */
function serveUploads(req, res, url) {
  const name = path.basename(decodeURIComponent(url.pathname));   // กัน path traversal
  const filePath = path.join(UPLOADS_DIR, name);
  fs.readFile(filePath, (e, data) => {
    if (e) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("404"); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
    res.end(data);
  });
}

/* ---------- server ---------- */
ensureData();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(() => json(res, 500, { error: "server error" }));
  } else if (url.pathname.startsWith("/uploads/")) {
    serveUploads(req, res, url);
  } else {
    serveStatic(req, res, url);
  }
});
server.listen(PORT, () => {
  console.log("DUDEHUM server running -> http://localhost:" + PORT);
  console.log("Static root:", ROOT);
});
