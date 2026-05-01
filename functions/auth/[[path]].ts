import type { CaseMembershipRole } from "../../shared/types";
import { getConfig, hasEnterpriseAuthConfig, hasLocalInviteAuthConfig, isPlatformOwnerEmail } from "../_lib/config";
import { audit } from "../_lib/audit";
import {
  countActiveOrganizationUsersByType,
  bindExternalIdentity,
  createOrganization,
  createInvitedUser,
  ensureCaseMembership,
  findActiveInvitationByEmailOrToken,
  findOrganizationByName,
  findOrganizationUserByEmail,
  findProvisionedUserForIdentity,
  getUserById,
  getOrganizationById,
  getLocalCredentialByUserId,
  markInvitationAccepted,
  revokeInvitation,
  revokeSiblingInvitationsForEmail,
  updateUserDisplayName,
  upsertLocalCredential,
} from "../_lib/db";
import { createLocalPasswordCredential, validateLocalPassword, verifyLocalPasswordCredential } from "../_lib/local-auth";
import { escapeHtml, isTransactionalEmailConfigured, sendTransactionalEmail } from "../_lib/mail";
import { beginOidcSignIn, consumeOidcCallback } from "../_lib/oidc";
import { errorJson, json, methodNotAllowed, redirect } from "../_lib/responses";
import { logOperationalError, logSecurityEvent } from "../_lib/security";
import { clearSessionCookie, createSession, currentSessionToken, deleteSession, resolveSession } from "../_lib/session";
import { bindTenantRuntimeContext, resolveTenantRuntimeForRequest } from "../_lib/tenant-runtime";
import { isTenantOrganizationAllowed, type TenantConfig } from "../_lib/tenancy";
import { verifyTurnstileIfEnforced } from "../_lib/turnstile";
import type { AppContext } from "../_lib/types";

function authPath(request: Request) {
  return new URL(request.url).pathname.replace(/^\/auth\/?/, "");
}

function sanitizeReturnTo(value: string | null | undefined) {
  return String(value || "/app").startsWith("/") ? String(value || "/app") : "/app";
}

function defaultDisplayName(email: string) {
  const localPart = String(email || "").trim().split("@")[0] || "Invited user";
  return localPart
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim() || "Invited user";
}

async function readJsonBody<T>(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return {} as T;
  return (await request.json()) as T;
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function emailDomain(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  const domain = normalized.split("@")[1] || "";
  return domain || null;
}

function resolveDashboardRedirect(context: AppContext, userType: string, email: string | null | undefined, fallbackPath: string) {
  if (userType === "org_admin") {
    return isPlatformOwnerEmail(context.env, email) ? "/owner" : "/admin";
  }
  return fallbackPath;
}

const localUsernamePattern = /^[A-Za-z0-9._@-]{3,40}$/;
const recoveryEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRecoveryTokenTtlMinutes = 30;

function validateLocalUsername(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "Create your account username before continuing.";
  }
  if (!localUsernamePattern.test(normalized)) {
    return "Usernames must be 3-40 characters and use only letters, numbers, periods, underscores, dashes, or @.";
  }
  return "";
}

function normalizeIdentifier(value: string | null | undefined) {
  return String(value || "").trim();
}

function isValidRecoveryEmail(value: string) {
  return recoveryEmailPattern.test(normalizeEmail(value));
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  const input = new TextEncoder().encode(value);
  return toHex(await crypto.subtle.digest("SHA-256", input));
}

function generateRecoveryToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function genericRecoveryMessage() {
  return "If an account exists for that email, recovery instructions have been sent.";
}

function resolveRecoveryBaseUrl(context: AppContext, fallbackBaseUrl: string) {
  const tenantBaseUrl = String(context.data?.tenantPublicBaseUrl || "").trim().replace(/\/+$/g, "");
  return tenantBaseUrl || fallbackBaseUrl;
}

async function isUsernameTaken(context: AppContext, username: string, excludeUserId?: string | null) {
  const results = await context.env.DB
    .prepare("SELECT id FROM users WHERE lower(display_name) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 10")
    .bind(String(username || "").trim())
    .all<{ id: string }>();
  const ids = (results.results || []).map((row) => String(row.id || "").trim()).filter(Boolean);
  if (!ids.length) return false;
  if (excludeUserId) {
    return ids.some((id) => id !== excludeUserId);
  }
  return true;
}

function genericLocalSignInFailure() {
  return errorJson(403, "auth_required", "The username or password did not match.");
}

function logLocalSignInFailure(context: AppContext, reason: string, identifier: string) {
  const normalized = String(identifier || "").trim().toLowerCase();
  const looksLikeEmail = normalized.includes("@");
  logSecurityEvent(context.request, "local_sign_in_failed", {
    outcome: "blocked",
    reason,
    identifierType: looksLikeEmail ? "email" : "username",
    identifierPrefix: normalized.slice(0, 4),
    emailDomain: looksLikeEmail ? emailDomain(normalized) : null,
  });
}

async function resolveLocalSignInUser(context: AppContext, identifier: string) {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return { user: null, ambiguous: false, candidateUserIds: [] as string[] };

  if (normalizedIdentifier.includes("@")) {
    const usernameMatches = await context.env.DB
      .prepare("SELECT id FROM users WHERE lower(display_name) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 3")
      .bind(normalizedIdentifier)
      .all<{ id: string }>();
    const emailMatches = await context.env.DB
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 3")
      .bind(normalizeEmail(normalizedIdentifier))
      .all<{ id: string }>();
    const ids = Array.from(
      new Set(
        [...(usernameMatches.results || []), ...(emailMatches.results || [])]
          .map((row) => String(row.id || "").trim())
          .filter(Boolean),
      ),
    );
    if (ids.length > 1) {
      return { user: null, ambiguous: true, candidateUserIds: ids };
    }
    if (ids.length === 1) {
      const user = await getUserById(context.env.DB, ids[0]);
      return { user: user || null, ambiguous: false, candidateUserIds: ids };
    }
    return { user: null, ambiguous: false, candidateUserIds: [] as string[] };
  }

  const usernameMatches = await context.env.DB
    .prepare("SELECT id FROM users WHERE lower(display_name) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 3")
    .bind(normalizedIdentifier)
    .all<{ id: string }>();
  const ids = (usernameMatches.results || []).map((row) => String(row.id || "").trim()).filter(Boolean);
  if (ids.length > 1) {
    return { user: null, ambiguous: true, candidateUserIds: ids };
  }
  if (ids.length === 1) {
    const user = await getUserById(context.env.DB, ids[0]);
    return { user: user || null, ambiguous: false, candidateUserIds: ids };
  }

  return { user: null, ambiguous: false, candidateUserIds: [] as string[] };
}

async function createSignedInResponse(context: AppContext, input: {
  userId: string;
  organizationId: string;
  email: string | null;
  provider: string;
  subject: string;
  redirectTo: string;
}) {
  const tenantCandidate = context.data?.tenant as TenantConfig | undefined;
  if (tenantCandidate?.id && !isTenantOrganizationAllowed(tenantCandidate, input.organizationId)) {
    return errorJson(403, "organization_membership_required", "Your account is not mapped to this tenant environment.");
  }

  const session = await createSession(context.env.DB, context.env, {
    userId: input.userId,
    organizationId: input.organizationId,
    oidcSubject: input.subject,
    oidcEmail: input.email,
  });

  await audit(context.env.DB, {
    organizationId: input.organizationId,
    actorUserId: input.userId,
    eventType: "sign_in",
    metadata: {
      email: input.email,
      provider: input.provider,
    },
  });

  return json(
    {
      ok: true,
      redirectTo: sanitizeReturnTo(input.redirectTo),
    },
    {
      status: 200,
      headers: {
        "set-cookie": session.cookie,
      },
    },
  );
}

export const onRequest = async (context: AppContext) => {
  const tenantRuntimeResult = resolveTenantRuntimeForRequest(context.request, context.env, {
    authenticatedTenantClaim: String(context.data?.tenantClaim || ""),
  });
  if (!tenantRuntimeResult.ok) {
    logSecurityEvent(context.request, "tenant_resolution_failed", {
      outcome: "blocked",
      reason: tenantRuntimeResult.code,
    });
    return errorJson(tenantRuntimeResult.status, tenantRuntimeResult.code, tenantRuntimeResult.hint);
  }
  const tenantRuntime = tenantRuntimeResult.runtime;
  context = bindTenantRuntimeContext(context, tenantRuntime);

  const path = authPath(context.request);
  const config = getConfig(context.env);
  const tenantBaseUrl = String(context.data?.tenantPublicBaseUrl || "").trim().replace(/\/+$/g, "");
  const oidcEnabledForTenant = tenantRuntime.tenant.auth.mode === "oidc_vendor" && hasEnterpriseAuthConfig(context.env);
  const localAuthEnabledForTenant = tenantRuntime.tenant.auth.mode === "local_vendor" && hasLocalInviteAuthConfig(context.env);

  try {
    if (path === "sign-in") {
      const url = new URL(context.request.url);
      const inviteToken = String(url.searchParams.get("invite") || "").trim();
      const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
      const shouldResetForInvite = Boolean(inviteToken);
      if (shouldResetForInvite) {
        const existingToken = currentSessionToken(context);
        if (existingToken) {
          await deleteSession(context.env.DB, context.env, existingToken);
        }
      }
      const clearCookieHeader = shouldResetForInvite ? clearSessionCookie(context.env) : "";

      if (oidcEnabledForTenant) {
        const { authUrl, setCookie } = await beginOidcSignIn(context.env, {
          returnTo,
          inviteToken,
          baseUrlOverride: tenantBaseUrl || config.appBaseUrl,
        });
        return redirect(authUrl, 302, {
          "set-cookie": clearCookieHeader ? `${clearCookieHeader}, ${setCookie}` : setCookie,
        });
      }
      if (localAuthEnabledForTenant) {
        const nextUrl = new URL(`${tenantBaseUrl || config.appBaseUrl}/sign-in`);
        nextUrl.searchParams.set("auth", "local");
        nextUrl.searchParams.set("returnTo", returnTo);
        if (inviteToken) nextUrl.searchParams.set("invite", inviteToken);
        return redirect(`${nextUrl.pathname}${nextUrl.search}`, 302, clearCookieHeader ? { "set-cookie": clearCookieHeader } : undefined);
      }
      return redirect("/access-denied?reason=auth_not_configured", 302);
    }

  if (path === "local-invite") {
    if (context.request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!localAuthEnabledForTenant) {
      return redirect("/access-denied?reason=auth_not_configured", 302);
    }
    const body = await readJsonBody<{ inviteToken?: string; displayName?: string; password?: string; returnTo?: string }>(context.request);
    const inviteToken = String(body.inviteToken || "").trim();
    if (!inviteToken) {
      return errorJson(400, "bad_request", "An invitation token is required to continue.");
    }
    const inviteTurnstile = await verifyTurnstileIfEnforced({
      env: context.env,
      request: context.request,
      payload: body,
      expectedAction: "invite_account_setup",
      scope: "auth",
    });
    if (!inviteTurnstile.ok) {
      logSecurityEvent(context.request, "turnstile_rejected", {
        outcome: "blocked",
        route: "auth_local_invite",
        reason: inviteTurnstile.code,
      });
      return errorJson(403, inviteTurnstile.code, inviteTurnstile.hint);
    }

    const invitation = await findActiveInvitationByEmailOrToken(context.env.DB, {
      email: "",
      inviteToken,
    });
    if (!invitation) {
      return errorJson(404, "not_found", "This invitation link is no longer available. Ask the administrator to send a new one.");
    }
    const requestedDisplayName = String(body.displayName || "").trim();
    const usernameValidationError = validateLocalUsername(requestedDisplayName);
    if (usernameValidationError) {
      return errorJson(400, "bad_request", usernameValidationError);
    }

    let user = await findOrganizationUserByEmail(
      context.env.DB,
      invitation.organizationId,
      invitation.email,
    );
    const existingCredential = user ? await getLocalCredentialByUserId(context.env.DB, user.id) : null;
    if (user && existingCredential) {
      await revokeInvitation(context.env.DB, invitation.organizationId, invitation.id);
      return errorJson(
        409,
        "bad_request",
        "This invite link has already been superseded by an existing account. Sign in with your username/email and password.",
      );
    }
    if (await isUsernameTaken(context, requestedDisplayName, user?.id || null)) {
      return errorJson(409, "bad_request", "That username is already in use. Choose another username.");
    }
    if (!user) {
      user = await createInvitedUser(context.env.DB, {
        organizationId: invitation.organizationId,
        email: invitation.email,
        displayName: requestedDisplayName || defaultDisplayName(invitation.email),
        userType: invitation.userType,
        externalIdentityId: null,
      });
    } else if (user.displayName !== requestedDisplayName) {
      user = await updateUserDisplayName(context.env.DB, user.id, requestedDisplayName);
    }

    if (!user) {
      return errorJson(500, "request_failed", "The invited account could not be created.");
    }
    if (!user.active) {
      return errorJson(403, "inactive_user", "This account is inactive. Contact the organization administrator.");
    }

    const userCredential = await getLocalCredentialByUserId(context.env.DB, user.id);
    if (!userCredential) {
      const passwordError = validateLocalPassword(String(body.password || ""));
      if (passwordError) {
        return errorJson(400, "bad_request", `Set a password before continuing. ${passwordError}`);
      }
      const credential = await createLocalPasswordCredential(String(body.password || ""));
      await upsertLocalCredential(context.env.DB, {
        userId: user.id,
        ...credential,
      });
    }

    if (invitation.caseId && invitation.caseRole) {
      await ensureCaseMembership(context.env.DB, {
        caseId: invitation.caseId,
        userId: user.id,
        role: invitation.caseRole as CaseMembershipRole,
        invitedBy: invitation.invitedBy,
      });
    }

    const acceptedInvitation = await markInvitationAccepted(context.env.DB, invitation.id);
    await revokeSiblingInvitationsForEmail(
      context.env.DB,
      invitation.organizationId,
      invitation.email,
      invitation.id,
    );
    const organization = await getOrganizationById(context.env.DB, invitation.organizationId);
    if (!organization) {
      return errorJson(404, "organization_membership_required", "The organization tied to this invitation could not be found.");
    }

    await audit(context.env.DB, {
      organizationId: organization.id,
      caseId: acceptedInvitation?.caseId || invitation.caseId,
      actorUserId: user.id,
      eventType: "invite_accepted",
      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        authMode: "local_invite",
      },
    });

    return createSignedInResponse(context, {
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      provider: "Local invite link",
      subject: `local_invite:${invitation.id}`,
      redirectTo: resolveDashboardRedirect(context, user.userType, user.email, body.returnTo || "/account"),
    });
  }

  if (path === "local-recovery/request") {
    if (context.request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!localAuthEnabledForTenant) {
      return errorJson(503, "auth_not_configured", "Local sign-in is not configured for this deployment.");
    }
    const body = await readJsonBody<{ mode?: "password" | "username"; email?: string }>(context.request);
    const mode = body.mode === "password" ? "password" : "username";
    const email = normalizeEmail(body.email);
    if (!email || !isValidRecoveryEmail(email)) {
      return errorJson(400, "bad_request", "Enter a valid email address.");
    }
    const recoveryTurnstile = await verifyTurnstileIfEnforced({
      env: context.env,
      request: context.request,
      payload: body,
      expectedAction: "local_recovery_request",
      scope: "auth",
    });
    if (!recoveryTurnstile.ok) {
      logSecurityEvent(context.request, "turnstile_rejected", {
        outcome: "blocked",
        route: "auth_local_recovery_request",
        reason: recoveryTurnstile.code,
      });
      return errorJson(403, recoveryTurnstile.code, recoveryTurnstile.hint);
    }

    const accountRows = await context.env.DB
      .prepare(
        `SELECT u.id AS user_id, u.display_name, u.email, u.organization_id, o.name AS organization_name
           FROM users u
           JOIN organizations o ON o.id = u.organization_id
          WHERE lower(u.email) = lower(?)
            AND u.active = 1
            AND u.email NOT LIKE '%@deleted.local'
          ORDER BY u.created_at DESC
          LIMIT 10`,
      )
      .bind(email)
      .all<{ user_id: string; display_name: string; email: string; organization_id: string; organization_name: string }>();
    const accounts = (accountRows.results || []).filter((row) => row.user_id && row.display_name && row.organization_name);

    logSecurityEvent(context.request, "local_recovery_requested", {
      outcome: "accepted",
      mode,
      hasMatch: accounts.length > 0,
      accountCount: accounts.length,
      emailDomain: emailDomain(email),
    });

    if (!accounts.length || !isTransactionalEmailConfigured(context.env)) {
      return json({ ok: true, message: genericRecoveryMessage() });
    }

    try {
      if (mode === "username") {
        const accountLines = accounts.map((account) => `- ${account.display_name} (${account.organization_name})`);
        await sendTransactionalEmail(context.env, {
          to: email,
          subject: "Your Network Manager username reminder",
          text: [
            "A username reminder was requested for your Network Manager account.",
            "",
            "You can sign in with the following username(s):",
            ...accountLines,
            "",
            "If you did not request this, you can ignore this email.",
          ].join("\n"),
          html: [
            "<p>A username reminder was requested for your Network Manager account.</p>",
            "<p>You can sign in with the following username(s):</p>",
            `<ul>${accounts
              .map(
                (account) =>
                  `<li><strong>${escapeHtml(account.display_name)}</strong> (${escapeHtml(account.organization_name)})</li>`,
              )
              .join("")}</ul>`,
            "<p>If you did not request this, you can ignore this email.</p>",
          ].join(""),
        });
      } else {
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + passwordRecoveryTokenTtlMinutes * 60_000).toISOString();
        const resetBaseUrl = resolveRecoveryBaseUrl(context, config.appBaseUrl);
        const statements = [];
        const resetLinks: Array<{ displayName: string; organizationName: string; link: string }> = [];

        for (const account of accounts) {
          const rawToken = generateRecoveryToken();
          const tokenHash = await sha256Hex(rawToken);
          const tokenId = createId("recovery");
          statements.push(
            context.env.DB
              .prepare(
                `INSERT INTO account_recovery_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
                 VALUES (?, ?, 'password_reset', ?, ?, NULL, ?)`,
              )
              .bind(tokenId, account.user_id, tokenHash, expiresAt, createdAt),
          );
          resetLinks.push({
            displayName: account.display_name,
            organizationName: account.organization_name,
            link: `${resetBaseUrl}/sign-in?recovery=${encodeURIComponent(rawToken)}`,
          });
        }

        if (statements.length) {
          await context.env.DB.batch(statements);
        }

        await sendTransactionalEmail(context.env, {
          to: email,
          subject: "Reset your Network Manager password",
          text: [
            "A password reset was requested for your Network Manager account.",
            "",
            ...resetLinks.flatMap((entry) => [
              `${entry.displayName} (${entry.organizationName})`,
              entry.link,
              "",
            ]),
            `These links expire in ${passwordRecoveryTokenTtlMinutes} minutes and can be used once.`,
            "If you did not request this, you can ignore this email.",
          ].join("\n"),
          html: [
            "<p>A password reset was requested for your Network Manager account.</p>",
            "<p>Use one of the links below:</p>",
            `<ul>${resetLinks
              .map(
                (entry) =>
                  `<li><strong>${escapeHtml(entry.displayName)}</strong> (${escapeHtml(entry.organizationName)}): <a href="${escapeHtml(
                    entry.link,
                  )}">${escapeHtml(entry.link)}</a></li>`,
              )
              .join("")}</ul>`,
            `<p>These links expire in ${passwordRecoveryTokenTtlMinutes} minutes and can be used once.</p>`,
            "<p>If you did not request this, you can ignore this email.</p>",
          ].join(""),
        });
      }
    } catch (error) {
      logOperationalError(context.request, "local_recovery_send_failed", error, {
        outcome: "failed",
        mode,
        emailDomain: emailDomain(email),
      });
    }

    return json({ ok: true, message: genericRecoveryMessage() });
  }

  if (path === "local-recovery/reset") {
    if (context.request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!localAuthEnabledForTenant) {
      return errorJson(503, "auth_not_configured", "Local sign-in is not configured for this deployment.");
    }
    const body = await readJsonBody<{ token?: string; password?: string }>(context.request);
    const token = normalizeIdentifier(body.token);
    const password = String(body.password || "");
    if (!token || !password) {
      return errorJson(400, "bad_request", "Recovery token and new password are required.");
    }
    const recoveryTurnstile = await verifyTurnstileIfEnforced({
      env: context.env,
      request: context.request,
      payload: body,
      expectedAction: "local_recovery_reset",
      scope: "auth",
    });
    if (!recoveryTurnstile.ok) {
      logSecurityEvent(context.request, "turnstile_rejected", {
        outcome: "blocked",
        route: "auth_local_recovery_reset",
        reason: recoveryTurnstile.code,
      });
      return errorJson(403, recoveryTurnstile.code, recoveryTurnstile.hint);
    }
    const passwordError = validateLocalPassword(password);
    if (passwordError) {
      return errorJson(400, "bad_request", passwordError);
    }

    const tokenHash = await sha256Hex(token);
    const tokenRow = await context.env.DB
      .prepare(
        `SELECT rt.id, rt.user_id, rt.expires_at, rt.used_at, u.organization_id, u.email, u.active
           FROM account_recovery_tokens rt
           JOIN users u ON u.id = rt.user_id
          WHERE rt.token_hash = ?
            AND rt.purpose = 'password_reset'
          LIMIT 1`,
      )
      .bind(tokenHash)
      .first<{ id: string; user_id: string; expires_at: string; used_at: string | null; organization_id: string; email: string; active: number }>();

    const expiresAtEpoch = tokenRow?.expires_at ? Date.parse(tokenRow.expires_at) : Number.NaN;
    if (
      !tokenRow ||
      tokenRow.used_at ||
      !Number.isFinite(expiresAtEpoch) ||
      expiresAtEpoch < Date.now() ||
      tokenRow.active !== 1
    ) {
      logSecurityEvent(context.request, "local_recovery_reset_failed", {
        outcome: "blocked",
        reason: "invalid_or_expired_token",
      });
      return errorJson(400, "bad_request", "This recovery link is invalid or expired. Request a new one.");
    }

    const nextCredential = await createLocalPasswordCredential(password);
    await upsertLocalCredential(context.env.DB, {
      userId: tokenRow.user_id,
      ...nextCredential,
    });

    const completedAt = new Date().toISOString();
    await context.env.DB.batch([
      context.env.DB.prepare("UPDATE account_recovery_tokens SET used_at = ? WHERE id = ?").bind(completedAt, tokenRow.id),
      context.env.DB
        .prepare("UPDATE account_recovery_tokens SET used_at = COALESCE(used_at, ?) WHERE user_id = ? AND purpose = 'password_reset'")
        .bind(completedAt, tokenRow.user_id),
    ]);

    await audit(context.env.DB, {
      organizationId: tokenRow.organization_id,
      actorUserId: tokenRow.user_id,
      eventType: "password_reset_completed",
      metadata: {
        provider: "local_recovery",
        email: tokenRow.email,
      },
    });

    logSecurityEvent(context.request, "local_recovery_reset_completed", {
      outcome: "accepted",
      emailDomain: emailDomain(tokenRow.email),
    });

    return json({
      ok: true,
      message: "Password updated. Sign in with your username and new password.",
    });
  }

  if (path === "local-sign-in") {
    if (context.request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!localAuthEnabledForTenant) {
      return errorJson(503, "auth_not_configured", "Local sign-in is not configured for this deployment.");
    }
    const body = await readJsonBody<{ identifier?: string; email?: string; password?: string; returnTo?: string }>(context.request);
    const identifier = String(body.identifier || body.email || "").trim();
    const password = String(body.password || "");
    if (!identifier || !password) {
      return errorJson(400, "bad_request", "Username and password are required.");
    }
    const localSignInTurnstile = await verifyTurnstileIfEnforced({
      env: context.env,
      request: context.request,
      payload: body,
      expectedAction: "local_sign_in",
      scope: "auth",
    });
    if (!localSignInTurnstile.ok) {
      logSecurityEvent(context.request, "turnstile_rejected", {
        outcome: "blocked",
        route: "auth_local_sign_in",
        reason: localSignInTurnstile.code,
      });
      return errorJson(403, localSignInTurnstile.code, localSignInTurnstile.hint);
    }

    const resolved = await resolveLocalSignInUser(context, identifier);
    let user = resolved.user;
    let passwordAlreadyVerified = false;

    if (!user && resolved.ambiguous && resolved.candidateUserIds.length) {
      const matchedUsers: NonNullable<Awaited<ReturnType<typeof getUserById>>>[] = [];

      for (const candidateUserId of resolved.candidateUserIds) {
        const candidateUser = await getUserById(context.env.DB, candidateUserId);
        if (!candidateUser || !candidateUser.active) continue;

        const candidateCredential = await getLocalCredentialByUserId(context.env.DB, candidateUser.id);
        if (!candidateCredential) continue;

        const candidatePasswordVerified = await verifyLocalPasswordCredential({
          password,
          passwordHash: candidateCredential.password_hash,
          passwordSalt: candidateCredential.password_salt,
          passwordIterations: candidateCredential.password_iterations,
        });

        if (!candidatePasswordVerified) continue;
        matchedUsers.push(candidateUser);
      }

      if (!matchedUsers.length) {
        logLocalSignInFailure(context, "invalid_password", identifier);
        return genericLocalSignInFailure();
      }

      if (matchedUsers.length === 1) {
        user = matchedUsers[0];
      } else {
        const platformOwnerMatches = matchedUsers.filter(
          (candidate) => candidate.userType === "org_admin" && isPlatformOwnerEmail(context.env, candidate.email),
        );
        if (platformOwnerMatches.length === 1) {
          user = platformOwnerMatches[0];
        } else {
          return errorJson(
            409,
            "auth_required",
            "That username matches multiple accounts. Contact your admin to confirm your username.",
          );
        }
      }
      passwordAlreadyVerified = true;
    }

    if (!user) {
      logLocalSignInFailure(context, "user_not_found", identifier);
      return genericLocalSignInFailure();
    }
    const organization = await getOrganizationById(context.env.DB, user.organizationId);
    if (!organization) {
      logLocalSignInFailure(context, "organization_not_found", identifier);
      return genericLocalSignInFailure();
    }
    if (!user.active) {
      logLocalSignInFailure(context, "inactive_user", identifier);
      return genericLocalSignInFailure();
    }
    if (!passwordAlreadyVerified) {
      const credential = await getLocalCredentialByUserId(context.env.DB, user.id);
      if (!credential) {
        logLocalSignInFailure(context, "password_not_initialized", identifier);
        return genericLocalSignInFailure();
      }
      const verified = await verifyLocalPasswordCredential({
        password,
        passwordHash: credential.password_hash,
        passwordSalt: credential.password_salt,
        passwordIterations: credential.password_iterations,
      });
      if (!verified) {
        logLocalSignInFailure(context, "invalid_password", identifier);
        return genericLocalSignInFailure();
      }
    }

    return createSignedInResponse(context, {
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      provider: "Local password",
      subject: `local_password:${user.id}`,
      redirectTo: resolveDashboardRedirect(context, user.userType, user.email, body.returnTo || "/app"),
    });
  }

  if (path === "bootstrap-admin") {
    if (context.request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!localAuthEnabledForTenant) {
      return errorJson(503, "auth_not_configured", "Bootstrap setup is not configured for this deployment.");
    }
    const body = await readJsonBody<{ organizationName?: string; displayName?: string; email?: string; password?: string }>(context.request);
    const organizationName = String(body.organizationName || "").trim();
    const displayName = String(body.displayName || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!organizationName || !displayName || !email || !password) {
      return errorJson(400, "bad_request", "Organization name, full name, work email, and password are required.");
    }
    const bootstrapTurnstile = await verifyTurnstileIfEnforced({
      env: context.env,
      request: context.request,
      payload: body,
      expectedAction: "bootstrap_admin",
      scope: "auth",
    });
    if (!bootstrapTurnstile.ok) {
      logSecurityEvent(context.request, "turnstile_rejected", {
        outcome: "blocked",
        route: "auth_bootstrap_admin",
        reason: bootstrapTurnstile.code,
      });
      return errorJson(403, bootstrapTurnstile.code, bootstrapTurnstile.hint);
    }
    const usernameValidationError = validateLocalUsername(displayName);
    if (usernameValidationError) {
      return errorJson(400, "bad_request", usernameValidationError);
    }
    const passwordError = validateLocalPassword(password);
    if (passwordError) {
      return errorJson(400, "bad_request", passwordError);
    }

    let organization = await findOrganizationByName(context.env.DB, organizationName);
    if (organization) {
      const activeAdminCount = await countActiveOrganizationUsersByType(context.env.DB, organization.id, "org_admin");
      if (activeAdminCount > 0) {
        return errorJson(
          409,
          "organization_exists",
          "This workspace already has an organization admin account. Sign in with your username/email and password, or ask the current admin to invite you.",
        );
      }
    } else {
      organization = await createOrganization(context.env.DB, {
        name: organizationName,
        settingsJson: {
          brandingName: organizationName,
        },
      });
      if (!organization) {
        return errorJson(500, "request_failed", "The workspace could not be created.");
      }
      await audit(context.env.DB, {
        organizationId: organization.id,
        actorUserId: null,
        eventType: "organization_created",
        metadata: {
          name: organization.name,
          bootstrap: true,
        },
      });
    }

    let user = await findOrganizationUserByEmail(context.env.DB, organization.id, email);
    if (user) {
      if (user.userType !== "org_admin") {
        return errorJson(409, "request_failed", "That email is already provisioned in this workspace with a non-admin role.");
      }
      if (!user.active) {
        return errorJson(403, "inactive_user", "This admin account is inactive. Contact support to restore it.");
      }
    } else {
      if (await isUsernameTaken(context, displayName)) {
        return errorJson(409, "bad_request", "That username is already in use. Choose another username.");
      }
      user = await createInvitedUser(context.env.DB, {
        organizationId: organization.id,
        email,
        displayName,
        userType: "org_admin",
        externalIdentityId: null,
      });
    }

    if (!user) {
      return errorJson(500, "request_failed", "The organization admin account could not be created.");
    }

    const credential = await createLocalPasswordCredential(password);
    await upsertLocalCredential(context.env.DB, {
      userId: user.id,
      ...credential,
    });

    await audit(context.env.DB, {
      organizationId: organization.id,
      actorUserId: user.id,
      eventType: "owner_bootstrapped",
      metadata: {
        email: user.email,
      },
    });

    return createSignedInResponse(context, {
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      provider: "Organization account bootstrap",
      subject: `bootstrap:${organization.id}:${user.id}`,
      redirectTo: `${resolveDashboardRedirect(context, user.userType, user.email, "/app")}?openBilling=1&setup=account`,
    });
  }

  if (path === "callback") {
    if (!oidcEnabledForTenant) {
      return redirect("/access-denied?reason=auth_not_configured", 302);
    }
    const callback = await consumeOidcCallback(context.env, context.request, {
      baseUrlOverride: tenantBaseUrl || config.appBaseUrl,
    });
    if (!callback.ok) {
      logSecurityEvent(context.request, "oidc_callback_failed", {
        outcome: "blocked",
        reason: callback.error,
      });
      return redirect(`/access-denied?reason=${encodeURIComponent(callback.error)}`, 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const subject = callback.identity.subject;
    if (!subject) {
      logSecurityEvent(context.request, "oidc_callback_failed", {
        outcome: "blocked",
        reason: "missing_subject",
      });
      return redirect("/access-denied?reason=user_not_provisioned", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    let user = await findProvisionedUserForIdentity(context.env.DB, callback.identity.email, subject);
    let organizationId = user?.organizationId || null;

    if (!user) {
      const invitation = await findActiveInvitationByEmailOrToken(context.env.DB, {
        email: callback.identity.email || "",
        inviteToken: callback.inviteToken,
      });
      if (invitation) {
        const createdUser = await createInvitedUser(context.env.DB, {
          organizationId: invitation.organizationId,
          email: invitation.email,
          displayName: callback.identity.displayName,
          userType: invitation.userType,
          externalIdentityId: subject,
        });
        user = createdUser;
        organizationId = invitation.organizationId;
        if (invitation.caseId && invitation.caseRole) {
          await ensureCaseMembership(context.env.DB, {
            caseId: invitation.caseId,
            userId: createdUser!.id,
            role: invitation.caseRole as CaseMembershipRole,
            invitedBy: invitation.invitedBy,
          });
        }
        await markInvitationAccepted(context.env.DB, invitation.id);
        await revokeSiblingInvitationsForEmail(
          context.env.DB,
          invitation.organizationId,
          invitation.email,
          invitation.id,
        );
        await audit(context.env.DB, {
          organizationId: invitation.organizationId,
          caseId: invitation.caseId,
          actorUserId: createdUser?.id || null,
          eventType: "invite_accepted",
          metadata: {
            invitationId: invitation.id,
            email: invitation.email,
          },
        });
      }
    } else if (!user.externalIdentityId) {
      user = await bindExternalIdentity(context.env.DB, user.id, subject, callback.identity.email);
      organizationId = user?.organizationId || organizationId;
    }

    if (!user || !organizationId) {
      logSecurityEvent(context.request, "oidc_callback_failed", {
        outcome: "blocked",
        reason: "user_not_provisioned",
        emailDomain: emailDomain(callback.identity.email),
      });
      return redirect("/access-denied?reason=user_not_provisioned", 302, {
        "set-cookie": callback.clearCookie,
      });
    }
    if (!user.active) {
      logSecurityEvent(context.request, "oidc_callback_failed", {
        outcome: "blocked",
        reason: "inactive_user",
        emailDomain: emailDomain(user.email),
      });
      return redirect("/access-denied?reason=inactive_user", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const organization = await getOrganizationById(context.env.DB, organizationId);
    if (!organization) {
      logSecurityEvent(context.request, "oidc_callback_failed", {
        outcome: "blocked",
        reason: "organization_not_found",
      });
      return redirect("/access-denied?reason=organization_membership_required", 302, {
        "set-cookie": callback.clearCookie,
      });
    }
    if (!isTenantOrganizationAllowed(tenantRuntime.tenant, organization.id)) {
      return redirect("/access-denied?reason=organization_membership_required", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const session = await createSession(context.env.DB, context.env, {
      userId: user.id,
      organizationId: organization.id,
      oidcSubject: subject,
      oidcEmail: callback.identity.email,
    });

    await audit(context.env.DB, {
      organizationId: organization.id,
      actorUserId: user.id,
      eventType: "sign_in",
      metadata: {
        email: user.email,
        provider: config.oidcProviderName,
      },
    });

    return redirect(callback.returnTo || "/app", 302, {
      "set-cookie": `${callback.clearCookie}, ${session.cookie}`,
    });
  }

  if (path === "sign-out") {
    const rawToken = currentSessionToken(context);
    await deleteSession(context.env.DB, context.env, rawToken);
    const url = new URL(context.request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const nextUrl = new URL(returnTo, tenantBaseUrl || config.appBaseUrl);
    nextUrl.searchParams.set("signedOut", "1");
    return redirect(`${nextUrl.pathname}${nextUrl.search}`, 302, {
      "set-cookie": clearSessionCookie(context.env),
    });
  }

    if (path === "session") {
      if (!localAuthEnabledForTenant) {
        return errorJson(503, "auth_not_configured", "Enterprise sign-in is not configured for this deployment.");
      }
      const session = await resolveSession(context.request, context.env, context.env.DB);
      if (!session) {
        return errorJson(401, "auth_required", "Sign in before accessing Network Manager.");
      }
      if (!session.user.active) {
        return errorJson(403, "inactive_user", "Your account is inactive. Contact your organization administrator.");
      }
      return redirect("/app");
    }

    return errorJson(404, "not_found", "Unknown auth route.");
  } catch (error) {
    logOperationalError(context.request, "auth_request_failed", error, {
      outcome: "failed",
      path,
      tenantId: String(context.data?.tenantId || ""),
    });
    if (path === "sign-in" || path === "callback" || path === "sign-out") {
      return redirect("/access-denied?reason=auth_failed", 302);
    }
    return errorJson(500, "request_failed", "Authentication request failed.");
  }
};
