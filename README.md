# Network Manager

Network Manager is an organization-owned safeguarding workspace designed for enterprise deployment. It now assumes authenticated access, organization-owned identity, backend case authorization, audit logging, and a formal case-closure workflow.

## Customer-owned tenant deployment model

### What the organization owns

- identity provider configuration and user lifecycle
- OIDC application registration and secrets
- database
- storage bucket or container
- audit log retention and monitoring
- environment variables and branding
- deployment account and security controls

### What the vendor provides

- application code
- OIDC-ready auth abstraction
- backend authorization rules
- admin UI and API structure
- migration scripts
- deployment packaging and documentation

### What must be configured per organization

- OIDC issuer URL, client ID, and client secret
- session secret
- D1 database binding
- document storage binding
- organization branding variables
- case-closure supervisor policy
- invite email integration if email delivery is required

## Architecture summary

- React + Vite frontend
- Cloudflare Pages Functions-compatible backend routes under `functions/`
- secure cookie session model
- SQL schema under `migrations/`
- backend role and case-state authorization
- organization-admin invitation and case-access management
- document upload endpoint backed by organization-owned object storage
- invite delivery webhook scaffold for organization-owned messaging systems

## Runtime modes

- `VITE_APP_RUNTIME=standalone`
  - local single-workspace UI
  - safe default for environments that do not yet have enterprise auth configured
- `VITE_APP_RUNTIME=enterprise`
  - enables sign-in, backend case loading, admin routes, and enterprise authorization
  - should only be deployed where OIDC, D1, session secret, and any required storage bindings are configured

## Core business rules

- unauthenticated users are redirected to `/sign-in`
- access is scoped by organization, case membership, user role, and case status
- workers lose access automatically when a case is closed
- caregivers and active network members retain access after closure
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
