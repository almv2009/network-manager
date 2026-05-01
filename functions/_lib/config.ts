import type { DeploymentReadinessCheck, DeploymentReadinessReport } from "../../shared/types";
import { getTenantReadinessCheck } from "./tenancy";
import type { Env } from "./types";

export type AppConfig = {
  appBaseUrl: string;
  sessionCookieName: string;
  sessionTtlHours: number;
  sessionSecret: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScopes: string;
  oidcProviderName: string;
  mailFromAddress: string;
  mailReplyToAddress: string;
  inviteEmailSender: string;
  inviteEmailWebhookUrl: string | null;
  inviteEmailWebhookBearerToken: string | null;
  brandingName: string;
  brandingLogoUrl: string | null;
  closedSupervisorAccess: boolean;
  documentStorageProvider: string;
  documentUploadMaxBytes: number;
  documentAllowedMimeTypes: string[];
  platformOwnerEmails: string[];
};

export type AuthMode = "oidc" | "local_invite" | "missing";

function optionalValue(value: string | undefined) {
  return String(value || "").trim();
}

export function getConfig(env: Env): AppConfig {
  const platformOwnerEmails = String(env.PLATFORM_OWNER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return {
    appBaseUrl: optionalValue(env.APP_BASE_URL).replace(/\/+$/g, ""),
    sessionCookieName: String(env.SESSION_COOKIE_NAME || "nm_session").trim() || "nm_session",
    sessionTtlHours: Math.max(1, Number.parseInt(String(env.SESSION_TTL_HOURS || "12"), 10) || 12),
    sessionSecret: optionalValue(env.SESSION_SECRET),
    oidcIssuerUrl: optionalValue(env.OIDC_ISSUER_URL).replace(/\/+$/g, ""),
    oidcClientId: optionalValue(env.OIDC_CLIENT_ID),
    oidcClientSecret: optionalValue(env.OIDC_CLIENT_SECRET),
    oidcScopes: String(env.OIDC_SCOPES || "openid profile email").trim() || "openid profile email",
    oidcProviderName: String(env.OIDC_PROVIDER_NAME || "Microsoft Entra External ID").trim() || "Microsoft Entra External ID",
    mailFromAddress:
      String(env.MAIL_FROM_ADDRESS || env.RESEND_FROM_EMAIL || "noreply@ataconsultancy.network").trim() ||
      "noreply@ataconsultancy.network",
    mailReplyToAddress:
      String(env.MAIL_REPLY_TO_ADDRESS || env.RESEND_REPLY_TO || "admin@ataconsultancy.net").trim() ||
      "admin@ataconsultancy.net",
    inviteEmailSender:
      String(env.INVITE_EMAIL_SENDER || "Safeguarding Together <noreply@ataconsultancy.network>").trim() ||
      "Safeguarding Together <noreply@ataconsultancy.network>",
    inviteEmailWebhookUrl: String(env.INVITE_EMAIL_WEBHOOK_URL || "").trim() || null,
    inviteEmailWebhookBearerToken: String(env.INVITE_EMAIL_WEBHOOK_BEARER_TOKEN || "").trim() || null,
    brandingName: String(env.ORGANIZATION_BRANDING_NAME || "Network Manager").trim() || "Network Manager",
    brandingLogoUrl: String(env.ORGANIZATION_BRANDING_LOGO_URL || "").trim() || null,
    closedSupervisorAccess: String(env.CASE_CLOSED_SUPERVISOR_ACCESS || "0").trim() === "1",
    documentStorageProvider: String(env.DOCUMENTS_STORAGE_PROVIDER || "r2").trim() || "r2",
    documentUploadMaxBytes: Math.max(1024, Number.parseInt(String(env.DOCUMENT_UPLOAD_MAX_BYTES || `${10 * 1024 * 1024}`), 10) || 10 * 1024 * 1024),
    documentAllowedMimeTypes: String(
      env.DOCUMENT_ALLOWED_MIME_TYPES || "application/pdf,image/png,image/jpeg,image/webp,text/plain"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    platformOwnerEmails,
  };
}

export function isPlatformOwnerEmail(env: Env, email: string | null | undefined) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return getConfig(env).platformOwnerEmails.includes(normalized);
}

export function hasEnterpriseAuthConfig(env: Env) {
  const config = getConfig(env);
  return Boolean(
    config.appBaseUrl &&
      config.sessionSecret &&
      config.oidcIssuerUrl &&
      config.oidcClientId &&
      config.oidcClientSecret,
  );
}

export function hasLocalInviteAuthConfig(env: Env) {
  const config = getConfig(env);
  return Boolean(config.appBaseUrl && config.sessionSecret);
}

export function getAuthMode(env: Env): AuthMode {
  if (hasEnterpriseAuthConfig(env)) return "oidc";
  if (hasLocalInviteAuthConfig(env)) return "local_invite";
  return "missing";
}

export function getDeploymentReadiness(env: Env): DeploymentReadinessReport {
  const config = getConfig(env);
  const checks: DeploymentReadinessCheck[] = [];
  const tenantReadiness = getTenantReadinessCheck(env);

  checks.push({
    key: "tenant_runtime",
    label: "Tenant runtime configuration",
    required: true,
    status: tenantReadiness.status,
    detail: tenantReadiness.detail,
    missing: tenantReadiness.missing,
  });

  const dbBound = Boolean(env.DB && typeof env.DB.prepare === "function");
  checks.push({
    key: "database",
    label: "D1 database binding",
    required: true,
    status: dbBound ? "ready" : "missing",
    detail: dbBound ? "The D1 database binding is available." : "Bind the D1 database as DB for enterprise case storage and auth state.",
    missing: dbBound ? [] : ["DB"],
  });

  const authBootstrapMissing = [
    !config.appBaseUrl ? "APP_BASE_URL" : null,
    !config.sessionSecret ? "SESSION_SECRET" : null,
  ].filter(Boolean) as string[];
  const authMode = getAuthMode(env);
  checks.push({
    key: "authentication",
    label: "Authentication",
    required: true,
    status: authMode === "missing" ? "missing" : "ready",
    detail:
      authMode === "oidc"
        ? "OIDC organization sign-in and secure session configuration are present."
        : authMode === "local_invite"
          ? "Local invite-link sign-in is configured. Add OIDC if you want organization-account sign-in."
          : "Authentication is not configured. Add APP_BASE_URL and SESSION_SECRET at minimum.",
    missing: authMode === "missing" ? authBootstrapMissing : [],
  });

  const enterpriseSsoMissing = [
    !config.oidcIssuerUrl ? "OIDC_ISSUER_URL" : null,
    !config.oidcClientId ? "OIDC_CLIENT_ID" : null,
    !config.oidcClientSecret ? "OIDC_CLIENT_SECRET" : null,
  ].filter(Boolean) as string[];
  checks.push({
    key: "enterprise_sso",
    label: "Enterprise SSO",
    required: false,
    status: enterpriseSsoMissing.length ? "warning" : "ready",
    detail: enterpriseSsoMissing.length
      ? "OIDC is not configured. The app will use local invite-link sign-in until provider values are added."
      : "OIDC organization-account sign-in is configured.",
    missing: enterpriseSsoMissing,
  });

  const documentsConfigured =
    config.documentStorageProvider.toLowerCase() === "disabled" ||
    Boolean(env.DOCUMENTS_BUCKET && typeof env.DOCUMENTS_BUCKET.get === "function" && typeof env.DOCUMENTS_BUCKET.put === "function");
  checks.push({
    key: "documents",
    label: "Document storage",
    required: true,
    status: documentsConfigured ? "ready" : "missing",
    detail: documentsConfigured
      ? "Document upload and retrieval storage is configured."
      : "Bind DOCUMENTS_BUCKET or explicitly disable document storage before go-live.",
    missing: documentsConfigured ? [] : ["DOCUMENTS_BUCKET"],
  });

  const resendConfigured = Boolean(
    optionalValue(env.RESEND_API_KEY) &&
      optionalValue(env.MAIL_FROM_ADDRESS || env.RESEND_FROM_EMAIL),
  );
  const emailMissing = resendConfigured
    ? []
    : ["RESEND_API_KEY", "MAIL_FROM_ADDRESS"];
  checks.push({
    key: "invite_delivery",
    label: "Invitation email delivery",
    required: false,
    status: resendConfigured ? "ready" : "warning",
    detail: resendConfigured
      ? "Invitations are delivered through Resend."
      : "Resend mail delivery is not configured. Admins will need to share invite URLs manually.",
    missing: emailMissing,
  });

  const supportEmail = optionalValue(env.SUPPORT_EMAIL);
  checks.push({
    key: "support_contact",
    label: "Support contact",
    required: false,
    status: supportEmail ? "ready" : "warning",
    detail: supportEmail
      ? `Support contact is set to ${supportEmail}.`
      : "SUPPORT_EMAIL is not set. The app will fall back to the built-in default support address.",
    missing: supportEmail ? [] : ["SUPPORT_EMAIL"],
  });

  const turnstileConfigured = Boolean(optionalValue(env.TURNSTILE_SECRET_KEY));
  checks.push({
    key: "bot_protection",
    label: "Bot and abuse protection",
    required: false,
    status: turnstileConfigured ? "ready" : "warning",
    detail: turnstileConfigured
      ? "Turnstile secret is configured. Enable enforcement flags when client tokens are wired."
      : "TURNSTILE_SECRET_KEY is not set. Configure Turnstile for public-form and sign-in abuse controls.",
    missing: turnstileConfigured ? [] : ["TURNSTILE_SECRET_KEY"],
  });

  return {
    generatedAt: new Date().toISOString(),
    ready: checks.every((check) => !check.required || check.status === "ready"),
    checks,
  };
}
