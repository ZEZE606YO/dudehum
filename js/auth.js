/* ============================================
   DUDEHUM — Auth client (talks to the real backend)
   Session lives in an httpOnly cookie set by the server,
   so the browser JS never handles raw tokens/passwords.
   ============================================ */
window.Auth = (function () {
  "use strict";

  async function api(path, method, body) {
    const res = await fetch(path, {
      method: method || "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    return data;
  }

  // Returns { pending: true, email } — an OTP has been emailed. Account not created yet.
  async function register(name, email, password) {
    return await api("/api/register", "POST", { name, email, password });
  }
  // Verify the emailed OTP -> creates the account and logs in. Returns the user.
  async function verifyOtp(email, otp) {
    return (await api("/api/verify-otp", "POST", { email, otp })).user;
  }
  // Ask the server to email a fresh OTP for a pending sign-up.
  async function resendOtp(email) {
    return await api("/api/resend-otp", "POST", { email });
  }
  async function login(email, password) {
    return (await api("/api/login", "POST", { email, password })).user;
  }
  // Request a password-reset OTP by email (also used to resend).
  async function forgotPassword(email) {
    return await api("/api/forgot-password", "POST", { email });
  }
  // Verify reset OTP + set a new password -> logs in. Returns the user.
  async function resetPassword(email, otp, password) {
    return (await api("/api/reset-password", "POST", { email, otp, password })).user;
  }
  async function logout() {
    try { await api("/api/logout", "POST", {}); } catch (e) {}
  }
  /* Returns the current user object or null */
  async function me() {
    try { return (await api("/api/me")).user; }
    catch (e) { return null; }
  }
  /* Redirect to login if not authenticated. Resolves with the user or null. */
  async function requireAuth(redirect) {
    const user = await me();
    if (!user) { window.location.href = redirect || "login.html"; return null; }
    return user;
  }

  return { register, verifyOtp, resendOtp, login, forgotPassword, resetPassword, logout, me, requireAuth };
})();

/* Reflect logged-in state on any element with id="loginNav" */
(async function () {
  var nav = document.getElementById("loginNav");
  if (!nav) return;
  var user = await window.Auth.me();
  if (user) {
    nav.textContent = "👤 " + (user.name || "บัญชีของฉัน").split(" ")[0];
    nav.setAttribute("href", "shop.html");
  }
})();
