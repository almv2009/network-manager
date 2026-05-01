# Network Manager

Network Manager is a safeguarding workspace for licensed organizations. The current production model is ATA-hosted multi-tenant infrastructure with organization-scoped access, backend authorization, audit logging, and a formal case-closure workflow.

## Current hosting model

- ATA-managed application hosting
- ATA-managed database and document storage bindings
- organization-level tenant isolation
- role-based and case-membership-based access control
- platform owner controls organization licensing
- organization admins control user allocation, invitations, and access inside their organization

See:

- [docs/hosting-and-tenancy.md](./docs/hosting-and-tenancy.md)

## Architecture summary

- React + Vite frontend
- Cloudflare Pages Functions-compatible backend routes under `functions/`
- secure cookie session model
- SQL schema under `migrations/`
- backend role and case-state authorization
- organization-admin invitation and case-access management
- document upload endpoint backed by organization-owned object storage
- provider-neutral invite delivery service (Resend primary, organization-owned webhook fallback)

## Runtime modes

- default runtime
  - enterprise
  - the app now boots into the authenticated enterprise workspace unless `VITE_APP_RUNTIME=standalone` is set explicitly
- `VITE_APP_RUNTIME=standalone`
  - local single-workspace UI
  - local fallback for design work or environments that do not yet have enterprise auth configured
- `VITE_APP_RUNTIME=enterprise`
  - enables sign-in, backend case loading, admin routes, and enterprise authorization
  - should only be deployed where OIDC, D1, session secret, and any required storage bindings are configured

## Core business rules

- unauthenticated users are redirected to `/sign-in`
- access is scoped by organization, case membership, user role, and case status
- organization admins can view all organization cases
- workers and supervisors can create private cases that appear in their own case roster by default
- workers lose access automatically when a case is closed
- caregivers and active network members retain access after closure
- caregivers and network members can continue updating the closed-case workspace when their access remains active after closure
- supervisors lose routine access after closure unless enabled by organization policy
- organization admins manage users, invitations, and case memberships
- localStorage is no longer the source of truth for case data

## Local development

1. Install dependencies:

```bash
npm install
```

2. Provide environment variables:

```bash
cp .env.example .dev.vars
```

3. Configure Cloudflare bindings for local or remote development.

4. Apply migrations:

```bash
npm run db:migrate:local
```

5. Start the frontend:

```bash
npm run dev
```

6. Type-check Pages Functions:

```bash
npm run typecheck:server
```

7. Run backend rule tests:

```bash
npm run test:server
```

## Cloudflare deployment

```bash
npm run build
wrangler pages deploy dist --project-name network-manager --branch main
```

See:

- [docs/deployment.md](./docs/deployment.md)
- [docs/admin-setup.md](./docs/admin-setup.md)
- [docs/upgrade.md](./docs/upgrade.md)
