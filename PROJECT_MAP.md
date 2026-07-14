# 🗺️ PROJECT MAP — DUDEHUM (สารบัญสำหรับ Claude)

> อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง เพื่อกระโดดไปแก้จุดที่ต้องการโดยไม่ต้องไล่อ่านโค้ดทั้งหมด
> เลขบรรทัดอาจขยับได้ — ถ้าไม่ตรง ให้ Grep หา "anchor" (ข้อความในคอลัมน์ Anchor) แทน

---

## 1) ควบคุมเว็บ (เปิด/ปิด) — Claude สั่งรันเอง
| คำสั่ง user | ทำ |
|-------------|-----|
| "เปิดเว็บ" | `powershell -ExecutionPolicy Bypass -File landing-page/webctl.ps1 start` |
| "ปิดเว็บ" | `... webctl.ps1 stop` |
| "รีสตาร์ทเว็บ" | `... webctl.ps1 restart` |
| "เช็คสถานะ" | `... webctl.ps1 status` |
| เปิดลิงก์สาธารณะ | `... share.ps1` (cloudflared → ได้ลิงก์ `*.trycloudflare.com` ใหม่ทุกครั้ง) |

- เว็บรันที่ `http://localhost:5173` — Node เสิร์ฟทั้งไฟล์ static + API (origin เดียว)
- ไฟล์ static (html/css/js) แก้แล้วเห็นผลทันที (เสิร์ฟจากดิสก์สดๆ) — **ไม่ต้องรีสตาร์ท**
- แก้ `server/*.js` → ต้อง restart web
- ดับเบิลคลิกเปิดเอง: `เปิดเว็บ.bat` (เซิร์ฟเวอร์) + `เปิดลิงก์สาธารณะ.bat` (tunnel)

---

## 2) แก้เรื่องนี้ → ไปไฟล์นี้ (ทางลัดที่ใช้บ่อย)
| อยากแก้ | ไฟล์ | ตำแหน่ง / Anchor |
|---------|------|------------------|
| สีแบรนด์ / โทนสี | `css/style.css` | `:root` บนสุด (`--brand`, `--brand-grad`, `--navy`) |
| ปุ่ม / การ์ด / ฟอนต์ (ทั้งเว็บ) | `css/style.css` | ตาม section comment (ดูข้อ 5) |
| ไอคอน SVG (utility) | `css/style.css` | `/* ---------- Icons` |
| หน้าแรก (เนื้อหา) | `index.html` | ตาม `<!-- ===== ... -->` (ดูข้อ 4) |
| หน้าล็อกอิน/สมัคร/OTP/ลืมรหัส | `login.html` | ตาม `id="...Form"` (ดูข้อ 4) |
| หน้าบัญชีสมาชิก | `account.html` | ตาม `<section class="account__...">` |
| หน้าร้าน (shop) + หมวดหมู่/สินค้า | `shop.html` | JS: `var ICONS`, `var cats`, `var products` |
| สไตล์หน้า shop | `css/shop.css` | ตาม section comment |
| **หน้าแอดมิน** (ภาพรวม/สมาชิก/ออเดอร์/สินค้า/รายงาน) | `admin.html` | ไฟล์เดียว 5 แท็บ + inline `<style>` (guard = `Auth.me().isAdmin`) |
| **สถานะสินค้า** (ว่าง/จอง/ขายแล้ว) | `shop.html`+`account.html`+`server.js` | badge ใน `productCard`/`openDetail`; account = section "สินค้าของฉัน"; API `/api/products/{id}/status` |
| **flow ปุ่มซื้อ** (ทักแชทแทนจ่าย QR) | `shop.html` `#buyBtn` + `chat.html` `autoBuyMessage()` | ดูข้อ 4 (QR พร้อมเพย์ยังอยู่ครบ แค่ไม่ถูกเรียก) |
| ระบบ Auth ฝั่ง client (fetch) | `js/auth.js` | ฟังก์ชันตามชื่อ (ดูข้อ 6) |
| animation/เมนู/counter/ฟอร์ม | `js/main.js` | ตาม `/* ---- ... ---- */` |
| API / backend logic | `server/server.js` | ตาม `route === "/api/..."` (ดูข้อ 3) |
| อีเมล (เทมเพลต + ส่ง) | `server/mailer.js` | `welcomeEmail` / `otpEmail` / `resetEmail` |
| ตั้งค่าอีเมล/โดเมน (คีย์ลับ) | `server/data/mail.config.json` | (gitignored) apiKey, senderEmail, publicUrl |
| โลโก้ | `assets/logo.svg` (สี), `assets/logo-white.svg` (บนพื้นส้ม) | |

---

## 3) Backend — `server/server.js`
Utilities: `readUsers` L39 · `readPending` L48 · `readReset` L66 · `hashPassword` L85 · `verifyPassword` L90 · `generateOtp` L99 · `sign`/`verify` (cookie) L104/L109 · `serveStatic` L395

**API routes** (Anchor = `route === "..."`)
| Method | Path | บรรทัด | ทำอะไร |
|--------|------|--------|--------|
| POST | `/api/register` | L168 | สร้าง pending + ส่ง OTP (ยังไม่สร้างบัญชี) |
| POST | `/api/verify-otp` | L211 | ยืนยัน OTP → สร้างบัญชีจริง + login |
| POST | `/api/resend-otp` | L256 | ขอ OTP ใหม่ (cooldown 60วิ) |
| POST | `/api/login` | L279 | เข้าสู่ระบบ |
| POST | `/api/forgot-password` | L296 | ส่ง OTP รีเซ็ต (ตอบ generic กัน enumeration) |
| POST | `/api/reset-password` | L334 | ยืนยัน OTP + ตั้งรหัสใหม่ + login |
| POST | `/api/logout` | L373 | ล้าง cookie |
| GET | `/api/me` | | ดู user ปัจจุบัน + คืน `isAdmin` (frontend ใช้โชว์ลิงก์แอดมิน) |
| GET | `/api/products` | | ลิสต์สินค้าทั้งหมด (public) + flag `mine` + `status` (default `available`) |
| POST | `/api/products` | | ลงขายสินค้า (ต้อง login; owner = user; รับ `image` เป็น data-URL ได้; status เริ่ม `available`) |
| DELETE | `/api/products/{id}` | | ลบสินค้าของตัวเอง (เช็ค owner + ลบไฟล์รูป) |
| POST | `/api/products/{id}/status` | | เปลี่ยนสถานะสินค้า **เจ้าของเท่านั้น (403)** — รับ `available`/`reserved`/`sold` |
| GET | `/uploads/{file}` | (นอก /api) | เสิร์ฟรูปสินค้าที่อัปโหลด (`serveUploads`) |
| GET/POST | `/api/favorites` | | ดู/toggle ถูกใจ (`favorites.json` = {email:[pid]}) |
| GET/POST | `/api/cart` · DELETE `/api/cart/{id}` | | ตะกร้าต่อ user (`cart.json` = {email:[{id,qty}]}) |
| GET/POST | `/api/orders` | | ออเดอร์ (`orders.json`); POST รับ `{productId,qty}` หรือ `{fromCart:true}` |
| POST | `/api/messages` | | ส่งข้อความแชท: `{productId,text}` เริ่มจากสินค้า หรือ `{convId,text}` ตอบในห้อง |
| GET | `/api/chats` | | รายการห้องสนทนาของ user (otherName, lastText, unread) |
| GET | `/api/chats/{convId}` | | ข้อความในห้อง + mark read (`messages.json`, helper `convOf`/`userName`) |
| GET/POST | `/api/profile` | | ตั้ง/ดูพร้อมเพย์ของผู้ขาย (`profiles.json`, `normalizePromptpay`) |
| GET/POST | `/api/pay/{orderId}` | | GET=ข้อมูล QR (promptpay+ยอด+ผู้ขาย) · POST=mark paid — **ยังอยู่ครบ แต่ปุ่มซื้อไม่เรียกแล้ว** (ดูข้อ 4 flow ซื้อ) |
| POST | `/api/reports` | | ผู้ใช้กดรายงานห้องแชท `{convId,reason,detail}` → `reports.json` (แอดมินอ่านได้เฉพาะห้องที่ถูกรายงาน) |

**Admin (เฉพาะ `ADMIN_EMAIL` = `np.chinnakit@gmail.com`)** — guard รวมศูนย์: `if (route.startsWith("/api/admin/")) { if(!isAdmin(me)) 403 }`
| Method | Path | ทำอะไร |
|--------|------|--------|
| GET | `/api/admin/stats` | ภาพรวม (จำนวน user/สินค้า/ออเดอร์, ยอดขาย, รายงานค้าง) |
| GET | `/api/admin/users` · GET `/api/admin/users/{email}` | ลิสต์สมาชิก · รายละเอียดรายคน (สินค้า/ออเดอร์/สรุปแชท) |
| POST | `/api/admin/users/{email}/ban` · DELETE `/api/admin/users/{email}` | แบน(toggle) · ลบถาวร (ห้ามแอดมิน/ตัวเอง) |
| GET | `/api/admin/orders` · POST `/api/admin/orders/{id}/status` · POST `.../tracking` | ออเดอร์ทั้งหมด · เปลี่ยนสถานะ · เลขพัสดุ |
| GET | `/api/admin/products` · DELETE `/api/admin/products/{id}` | สินค้าทั้งหมด · ลบใดๆ (admin override) |
| GET | `/api/admin/reports` · GET `.../{convId}/messages` · POST `.../{id}/resolve` | ลิสต์รายงาน · อ่านห้องที่ถูกรายงาน · ปิดเคส |

Storage: `readProducts`/`writeProducts` (`products.json`) · generic `readJsonFile`/`writeJsonFile` (fav/cart/orders/messages/reports) · `findProduct(id)` · `sessionUser(req)` = user จาก cookie (เช็กด้วยว่ายังอยู่จริง+ไม่ถูกแบน) · `isAdmin(user)` = `user.email === ADMIN_EMAIL`
ค่าคงที่บนสุด: `ADMIN_EMAIL` · **login + `sessionUser` บล็อกคนที่ `banned:true`** · `serveStatic` เพิ่ม `Cache-Control: no-cache` ให้ html/js/css
**รูปสินค้า**: อัปโหลดจากเครื่อง → บีบอัดฝั่ง client (canvas) → ส่ง data-URL → `saveProductImage()` เก็บไฟล์ที่ `server/data/uploads/` → เก็บ path `/uploads/xxx` ใน product.image. `readBody` cap = 8MB

ค่าคงที่ OTP อยู่บนสุด: `OTP_TTL_MS` (10นาที), `OTP_MAX_ATTEMPTS` (5), `RESEND_COOLDOWN_MS` (60วิ)
Session = httpOnly cookie `dh_session` เซ็นด้วย HMAC (secret ที่ `server/data/secret.key`)

---

## 4) หน้าเว็บ (HTML) — section anchors
**index.html** (`<!-- ===== X ===== -->`): Header/Nav L16 · Hero L41 · Why us L102 (`id="why"`) · Stats L146 (`id="stats"`) · Products L170 (`id="products"`) · FAQ L224 (`id="faq"`) · CTA/Contact L253 (`id="contact"`) · Footer L273

**login.html** — 5 สเต็ปในการ์ดเดียว (Anchor = `id="...Form"`): loginForm L45 · registerForm L62 · otpForm L82 · forgotForm L99 · resetForm L112. Logic ทั้งหมดอยู่ใน `<script>` ท้ายไฟล์ (ฟังก์ชัน `show(step)` สลับสเต็ป)

**account.html**: hero L35 · stat cards L43 · orders L62. Guard + logout ใน `<script>` ท้ายไฟล์ (ต้อง login ก่อน)

**shop.html**: Header L14 · Banners L65 · Quick nav L86 · Categories L99 · Flash sale L105 · Recommended L115. ข้อมูล+ไอคอนใน `<script>`: `ICONS` (map), `cats` (20), `products` (12), `ic(name)` (สร้าง `<svg class="icon">`)
> **ระบบสินค้า User ลงขายเอง**: ส่วน "สินค้าในร้าน" (`#recoProducts`) โหลดจาก `GET /api/products` ผ่าน `loadProducts()` + `productCard(p)` (มี `esc()` กัน XSS; แสดง `<img>` ถ้ามี `p.image` ไม่งั้นใช้ไอคอน). ปุ่ม `#sellBtn` เปิด modal `#sellModal` (ฟอร์ม `#sellForm`: อัปโหลดรูป `#imgInput` → `compressImage()` → `pendingImage`; หรือเลือกไอคอน `#iconSelect` จาก `ICON_LABELS`). ลบสินค้าของตัวเองผ่านปุ่ม `.s-del`. **กดการ์ด → เปิดหน้ารายละเอียดสไตล์ Shopee** `#detailModal` ผ่าน `openDetail(p)` (ใช้ข้อมูลจาก `loadedProducts`; การ์ดมี `data-id`; ปุ่มลบไม่เปิด detail). มี: รูปใหญ่, เรตติ้ง(mock), **Flash Sale banner + นับถอยหลัง** `#dTimer` (`startTimer`/`stopTimer`, โชว์เฉพาะมีส่วนลด, `.s-detail__flash.on`), ตัวเลือกจำนวน `#qtyVal`, ปุ่มรถเข็น/ซื้อ, การ์ดผู้ขาย, รายละเอียด. **ปุ่มทุกอันต่อ backend จริงแล้ว**: ถูกใจ `#favBtn` (toggle + `favSet`/`updateFavHeart`), เพิ่มตะกร้า `#cartBtn`, ซื้อ `#buyBtn` (**ทักแชท+ส่งข้อความสนใจอัตโนมัติ** ดูโน้ตด้านล่าง), แชท `#chatBtn` (ไป chat.html), แชร์ `#shareBtn` (copy link), ดูร้านค้า `#viewShopBtn` (กรอง `loadedProducts` ตาม owner + `.s-shopbar`). ตะกร้า: ไอคอนหัวเว็บ `#cartIcon` → `#cartModal` (renderCart/checkout), badge `#cartBadge` (`setCartBadge`/`loadCartCount`). แจ้งเตือน = `toast()` (`#toast`). helper `postJSON()`. CSS `.s-detail__*`/`.s-seller__*`/`.s-cart-*`/`.s-toast` ใน shop.css
> **สถานะสินค้า**: การ์ด/detail โชว์ badge `.s-status` (จองแล้ว=เหลือง, ขายแล้ว=เทา); `sold` = การ์ดจาง `.s-product--sold` + ปุ่มซื้อ/รถเข็น/แชทใน detail `disabled`. `p.status` มาจาก API (default `available`)
> **flow ปุ่มซื้อ (ใหม่)**: `#buyBtn` ไม่เปิด QR แล้ว → `location.href = "chat.html?product=..&name=..&pname=..&price=..&buy=1"` (เจ้าของสินค้าเอง = toast กัน). chat.html เห็น `buy=1` → `autoBuyMessage()` POST `/api/messages {productId,text}` (convId เดิม/ใหม่อัตโนมัติ) แล้ว `openConv()`. **QR พร้อมเพย์เดิมยังอยู่ครบ** แค่ไม่ถูกเรียก

**account.html**: "คำสั่งซื้อล่าสุด" `#orders` โหลดจาก `GET /api/orders` (+ เลขพัสดุ `o.tracking` ถ้ามี) + สถิติ `#statOrders` + **ตั้งค่าพร้อมเพย์** `#ppInput`/`#ppSave` + **สินค้าของฉัน** `#myProducts` (dropdown `.my-status` เปลี่ยนสถานะ → `POST /api/products/{id}/status`, อัปเดตทันทีไม่รีเฟรช) — สคริปต์ + `<style>` ท้ายไฟล์

**ชำระเงินพร้อมเพย์ (offline 100%)** — ⚠️ ตอนนี้เรียกจาก **checkout ตะกร้า** (`#checkoutBtn`) เท่านั้น (ปุ่มซื้อเดี่ยวเปลี่ยนไปทักแชทแล้ว): `openPayment(orderId)` เปิด `#payModal`. Server คำนวณ payload EMVCo เอง (`promptpayPayload`+`crc16ccitt` ใน server.js, verified CRC ถูกต้อง) ส่งใน `GET /api/pay`. Client เรนเดอร์ QR ในเครื่องด้วย **`js/qrcode.js`** (qrcode-generator MIT, บันเดิลไว้ — ไม่พึ่งบริการนอก, เลขพร้อมเพย์ไม่ออกเน็ต). แสดง **ชื่อผู้รับ** `.s-pay-recipient` + คำเตือนให้ตรวจสอบชื่อในแอปธนาคาร + ปุ่ม "ยืนยันว่าโอนแล้ว" (`POST /api/pay/{id}`). ผู้ขายต้องตั้งพร้อมเพย์ในหน้าบัญชีก่อน

**chat.html** (+ `css/chat.css`): หน้าแชทเต็ม — ซ้ายรายการห้อง `#chatList` (`loadChats`), ขวาห้องสนทนา `#messages`+`#chatForm` (`openConv`/`renderMessages`). เข้าจาก: "แชทเลย" → `chat.html?product={id}&name={owner}` (`openPending`) · **จากปุ่มซื้อ** → เพิ่ม `&buy=1&pname=&price=` → `autoBuyMessage()` ส่งข้อความสนใจอัตโนมัติ. polling 4 วิ. auth-guarded
> **คำเตือน "คนกลาง"** `.chat__warn` โผล่ก่อนเริ่มสนทนา (`WARN`) · **ปุ่มรายงาน** `#reportBtn` → `#reportModal` (เลือกหมวด 6 อย่าง) → `POST /api/reports` (แอดมินเห็นเฉพาะห้องที่ถูกรายงาน)
> demo Flash Sale ถูกซ่อน (`#flashSaleCard` display:none) — ตัวแปร `products`/`card()` เดิมยังอยู่แต่ไม่ได้ใช้

**admin.html** (self-contained, inline `<style>`+`<script>`): guard `Auth.me()` → ถ้าไม่ใช่ `isAdmin` โชว์ `#denied`. Sidebar 5 แท็บ (`switchTab`): **ภาพรวม** (`renderOverview` /stats) · **สมาชิก** (`renderUsers`+ค้นหา, กดแถว→`openUser()` modal: แบน/ลบ) · **ออเดอร์** (`renderOrders`: `<select>` เปลี่ยนสถานะ **มี confirm+กันเมาส์วีล** + ช่องเลขพัสดุ) · **สินค้า** (`renderProducts`: ลบใดๆ) · **รายงาน** (`renderReports`→`openReport()` แสดงบทสนทนาแบบแชท). ทุกจุด `esc()` กัน XSS
> ⚠️ **บั๊กที่เคยเจอ**: attribute `hidden` โดน `.admin{display:grid}` ทับ → ต้องมี `[hidden]{display:none!important}` · `<select>` เปลี่ยนค่าเองตอน scroll wheel → กันด้วย `blur()` + confirm ก่อนบันทึก

---

## 5) CSS
**style.css** (ใช้ทุกหน้า) — section: Base L33 · Icons L66 · Buttons L77 · Header L108 · Hero L160 · Sections L261 · Grid L278 · Feature cards L283 · Stats L303 · Pricing L309 · FAQ L347 · CTA L369 · Footer L400 · Reveal L416 · Responsive L420 · Product cards L458 · **Auth pages L472** · **Account page L590**

**shop.css** (เฉพาะหน้า shop): Header L11 · Banners L66 · Quick nav L87 · Section title L93 · Category grid L96 · Flash sale L103 · Responsive L123

---

## 6) JS ฝั่ง client
**auth.js** — `window.Auth` object: `api()` L9 · `register` L23 · `verifyOtp` L27 · `resendOtp` L31 · `login` L34 · `forgotPassword` L38 · `resetPassword` L42 · `logout` L45 · `me` L49 · `requireAuth` L54. ท้ายไฟล์: อัปเดต `#loginNav` ตามสถานะ login

**main.js** (โหลดใน index): Sticky header L29 · Mobile menu L37 · Reveal L57 · Counters L73 · CTA form L109 · Footer year L126.
⚠️ มีบล็อก Theme toggle L7 หลงเหลือแต่ **inert** (ลบ dark mode + ปุ่มไปแล้ว) — ถ้าเจอให้ข้าม

---

## 7) กติกาดีไซน์ (ห้ามลืม)
- **ขาว–ส้มเท่านั้น** ทุกหน้า — ไม่มี dark mode (ลบแล้ว), navy ใช้แค่ในโลโก้
- **ห้ามอีโมจิ** — ใช้ไอคอนเส้น SVG `<svg class="icon" viewBox="0 0 24 24">` (stroke=currentColor เลยได้สีส้มตาม context)
- **ชื่อในข้อความ = "DUDEHUM"** (คงไว้ — ห้ามเปลี่ยนเป็น DH Group แม้โลโก้เขียน DH Group)
- ฟอนต์: IBM Plex Sans Thai (เนื้อหา) + Sora (หัวข้อ) ผ่านตัวแปร `--font-sans`/`--font-display`

---

## 8) ข้อมูล/ไฟล์ลับ (gitignored — อย่าแตะด้วยมือ, อย่า commit)
`server/data/` : `users.json` (บัญชี+รหัส hash; มี `banned:true` ถ้าถูกแบน) · `pending.json`/`reset.json` (รอ OTP) · `products.json` (สินค้า user ลงขาย; มี `status`) · `orders.json` (มี `tracking`) · `messages.json` · `reports.json` (รายงานแชท) · `favorites.json`/`cart.json`/`profiles.json` · `secret.key` (กุญแจ session) · `mail.config.json` (Brevo API key)
> `mail.config.json` **เพิ่งถูกเอาออกจาก git แล้ว** (untracked) — ⚠️ แต่ key เดิมยังอยู่ใน commit history เก่า **ควร rotate Brevo key**. ตอน deploy ใหม่ให้ก๊อปจาก `mail.config.example.json`
