import type { Env } from "./types";

function base64UrlEncode(input: Uint8Array) {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function signPayload(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function sealCookieValue(secret: string, value: Record<string, unknown>) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await signPayload(secret, payload);
  return `${payload}.${signature}`;
}

export async function unsealCookieValue<T>(secret: string, cookieValue: string | undefined | null): Promise<T | null> {
  if (!cookieValue) return null;
  const [payload, signature] = String(cookieValue).split(".");
  if (!payload || !signature) return null;
  const expected = await signPayload(secret, payload);
  if (expected !== signature) return null;
  try {
    const bytes = base64UrlDecode(payload);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function parseCookies(request: Request) {
  const raw = request.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  for (const entry of raw.split(/;\s*/)) {
    if (!entry) continue;
    const idx = entry.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(entry.slice(0, idx).trim());
    const value = decodeURIComponent(entry.slice(idx + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

export function buildSetCookie({
  name,
  value,
  maxAge,
  path = "/",
  httpOnly = true,
  secure = true,
  sameSite = "Lax",
}: {
  name: string;
  value: string;
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (typeof maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, path = "/") {
  return buildSetCookie({
    name,
    value: "",
    maxAge: 0,
    path,
  });
}

export function sessionCookieName(env: Env) {
  return String(env.SESSION_COOKIE_NAME || "nm_session").trim() || "nm_session";
}
