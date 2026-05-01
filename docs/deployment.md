# Deployment README

## Cloudflare Pages deployment

This application is designed to run in an organization-controlled Cloudflare account.

### Required bindings

- D1 database bound as `DB`
- R2 bucket bound as `DOCUMENTS_BUCKET` if document uploads are enabled

### Required environment variables

- `APP_BASE_URL`
- `TENANT_DEFAULT_ID`
- `TENANT_CONFIG_JSON` (optional JSON tenant catalog override)
- `TENANT_ALLOW_HEADER_OVERRIDE`
- `TENANT_HEADER_NAME`
- `TENANT_STRICT_RESOLUTION`
- `TENANT_BASE_HOSTS`
- `TENANT_TRUSTED_CLAIM_HEADER`
- `TENANT_DEFAULT_AUTH_MODE`
- `TENANT_DEFAULT_DATABASE_MODE`
- `TENANT_DEFAULT_STORAGE_MODE`
- `TENANT_DEFAULT_D1_BINDING`
- `TENANT_DEFAULT_R2_BINDING`
- `TENANT_DEFAULT_EXTERNAL_DB_CONNECTION` (scaffold only)
- `TENANT_DEFAULT_EXTERNAL_STORAGE_CONNECTION` (scaffold only)
- `SESSION_SECRET`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_SCOPES`
- `OIDC_PROVIDER_NAME`
- `MAIL_FROM_ADDRESS`
- `INVITE_EMAIL_SENDER`
- `MAIL_REPLY_TO_ADDRESS`
- `INVITE_EMAIL_WEBHOOK_URL`
- `INVITE_EMAIL_WEBHOOK_BEARER_TOKEN`
- `RESEND_API_KEY` (secret)
- `SUPPORT_EMAIL`
- `ORGANIZATION_BRANDING_NAME`
- `ORGANIZATION_BRANDING_LOGO_URL`
- `CASE_CLOSED_SUPERVISOR_ACCESS`
- `DOCUMENTS_STORAGE_PROVIDER`
- `DOCUMENT_UPLOAD_MAX_BYTES`
- `DOCUMENT_ALLOWED_MIME_TYPES`

### Deployment steps

```bash
npm install
npm run build
wrangler pages deploy dist --project-name network-manager --branch main
```

### Resend secret setup

Set the Resend API key as a Cloudflare Pages secret (do not place it in `wrangler.toml`):

```bash
wrangler pages secret put RESEND_API_KEY --project-name network-manager
```

Set these as plaintext vars in `wrangler.toml` (`[vars]`) or Pages environment variables:

- `MAIL_FROM_ADDRESS=noreply@ataconsultancy.network`
- `INVITE_EMAIL_SENDER=Safeguarding Together <noreply@ataconsultancy.network>`
- `MAIL_REPLY_TO_ADDRESS=admin@ataconsultancy.net`
- `SUPPORT_EMAIL=admin@ataconsultancy.net`

### Database setup

```bash
wrangler d1 migrations apply NETWORK_MANAGER_DB --remote
```

To seed a demo environment:

```bash
wrangler d1 execute NETWORK_MANAGER_DB --remote --file migrations/0002_demo_seed.sql
```

### Notes

- OIDC callback URL must be `${APP_BASE_URL}/auth/callback`
- sign-out is handled by `/auth/sign-out`
- tenant runtime is resolved centrally from host/subdomain/header/claim using `functions/_lib/tenancy.ts`
- all API/auth handlers now run through a tenant-bound runtime context (`functions/_lib/tenant-runtime.ts`)
- organization admins must exist in the `users` table before production access can be granted
- invitation delivery first attempts Resend when configured; if Resend is not configured or fails and `INVITE_EMAIL_WEBHOOK_URL` is set, delivery is pushed to that organization-owned webhook; otherwise the admin UI returns an invite URL for manual sharing
- document uploads require the `DOCUMENTS_BUCKET` binding and use the configured file size and mime-type guardrails

## Live readiness checklist

Before production release, confirm all of the following:

- `DB` is bound and the D1 migrations have been applied remotely
- `DOCUMENTS_BUCKET` is bound if document upload/download is part of the deployment
- `APP_BASE_URL`, `SESSION_SECRET`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are set
- at least one active `org_admin` user exists in the organization
- invitation delivery is configured through either:
  - Resend with `RESEND_API_KEY` (secret) and `MAIL_FROM_ADDRESS`, or
  - `INVITE_EMAIL_WEBHOOK_URL` (organization-owned mail workflow webhook)
- `SUPPORT_EMAIL` is set to the real operational mailbox for this deployment
- if Stripe is intentionally disabled for public checkout, that is a deliberate decision and not a missing configuration accident

The admin dashboard now includes a deployment-readiness section that surfaces the critical auth, database, storage, and invite-delivery checks at runtime.
