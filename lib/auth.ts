// Admin session: a cookie holding "<expiry>.<signature>", signed with ADMIN_PASSWORD.
// Changing the password therefore logs out every open session.
// Uses Web Crypto only, so it runs both in middleware (edge) and in route handlers.

export const SESSION_COOKIE = "admin_session";
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.ADMIN_PASSWORD ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function createSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await sign(String(expires))}`;
}

export async function isValidSession(cookie: string | undefined) {
  if (!cookie || !process.env.ADMIN_PASSWORD) return false;
  const [expires, mac] = cookie.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return timingSafeEqual(mac, await sign(expires));
}

export function isValidPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && timingSafeEqual(password, expected);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
