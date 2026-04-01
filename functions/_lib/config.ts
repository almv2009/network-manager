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
  inviteEmailSender: string;
  inviteEmailWebhookUrl: string | null;
  inviteEmailWebhookBearerToken: string | null;
  brandingName: string;
  brandingLogoUrl: string | null;
  closedSupervisorAccess: boolean;
  documentStorageProvider: string;
  documentUploadMaxBytes: number;
  documentAllowedMimeTypes: string[];
};

function optionalValue(value: string | undefined) {
  return String(value || "").trim();
}

export function getConfig(env: Env): AppConfig {
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
    inviteEmailSender: String(env.INVITE_EMAIL_SENDER || "no-reply@example.org").trim() || "no-reply@example.org",
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
  };
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
