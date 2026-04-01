import { getConfig } from "./config";
import { audit } from "./audit";
import { clearCookie, parseCookies } from "./cookies";
import { createId, first, getOrganizationById, getUserById } from "./db";
import type { AppContext, AuthSessionRecord, D1Database, Env, ResolvedSession } from "./types";

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(db: D1Database, env: Env, input: { userId: string; organizationId: string; oidcSubject: string; oidcEmail?: string | null }) {
  const config = getConfig(env);
  if (!config.sessionSecret) {
    throw new Error("SESSION_SECRET is required to create an auth session.");
  }
  const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const sessionTokenHash = await sha256Hex(`${rawToken}.${config.sessionSecret}`);
  const id = createId("session");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      "INSERT INTO auth_sessions (id, organization_id, user_id, session_token_hash, oidc_subject, oidc_email, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.organizationId,
      input.userId,
      sessionTokenHash,
      input.oidcSubject,
      input.oidcEmail || null,
      expiresAt,
      createdAt,
      createdAt,
    )
    .run();

  return {
    token: rawToken,
    expiresAt,
    cookie: `${config.sessionCookieName}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${config.sessionTtlHours * 60 * 60}`,
  };
}

export async function deleteSession(db: D1Database, env: Env, rawToken: string | null | undefined) {
  if (!rawToken) return;
  const config = getConfig(env);
  if (!config.sessionSecret) return;
  const sessionTokenHash = await sha256Hex(`${rawToken}.${config.sessionSecret}`);
  const session = await first<AuthSessionRecord>(
    db,
    "SELECT * FROM auth_sessions WHERE session_token_hash = ?",
    sessionTokenHash,
  );
  if (session) {
    await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(session.id).run();
    await audit(db, {
      organizationId: session.organization_id,
      actorUserId: session.user_id,
      eventType: "sign_out",
      metadata: { sessionId: session.id },
    });
  }
}

export async function resolveSession(request: Request, env: Env, db: D1Database): Promise<ResolvedSession | null> {
  const config = getConfig(env);
  if (!config.sessionSecret) return null;
  const cookies = parseCookies(request);
  const rawToken = cookies[config.sessionCookieName];
  if (!rawToken) return null;
  const sessionTokenHash = await sha256Hex(`${rawToken}.${config.sessionSecret}`);
  const session = await first<AuthSessionRecord>(
    db,
    "SELECT * FROM auth_sessions WHERE session_token_hash = ?",
    sessionTokenHash,
  );
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(session.id).run();
    return null;
  }

  await db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), session.id).run();

  const user = await getUserById(db, session.user_id);
  const organization = await getOrganizationById(db, session.organization_id);
  if (!user || !organization) return null;

  return {
    session,
    user,
    organization,
    permissions: {
      isOrgAdmin: user.userType === "org_admin",
      canManageOrganization: user.userType === "org_admin",
    },
  };
}

export function clearSessionCookie(env: Env) {
  return clearCookie(String(env.SESSION_COOKIE_NAME || "nm_session").trim() || "nm_session");
}

export function currentSessionToken(context: AppContext) {
  const cookieName = String(context.env.SESSION_COOKIE_NAME || "nm_session").trim() || "nm_session";
  return parseCookies(context.request)[cookieName];
}
