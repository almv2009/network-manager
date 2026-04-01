# Deployment README

## Cloudflare Pages deployment

This application is designed to run in an organization-controlled Cloudflare account.

### Required bindings

- D1 database bound as `DB`
- R2 bucket bound as `DOCUMENTS_BUCKET` if document uploads are enabled

### Required environment variables

- `APP_BASE_URL`
- `SESSION_SECRET`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_SCOPES`
- `OIDC_PROVIDER_NAME`
- `INVITE_EMAIL_SENDER`
- `INVITE_EMAIL_WEBHOOK_URL`
- `INVITE_EMAIL_WEBHOOK_BEARER_TOKEN`
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
- organization admins must exist in the `users` table before production access can be granted
- if `INVITE_EMAIL_WEBHOOK_URL` is configured, invitation delivery is pushed to that organization-owned webhook; otherwise the admin UI returns an invite URL for manual sharing
- document uploads require the `DOCUMENTS_BUCKET` binding and use the configured file size and mime-type guardrails
