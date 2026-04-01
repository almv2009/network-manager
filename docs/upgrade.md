# Upgrade README

## Upgrading from the local single-user version

This codebase now assumes:

- authenticated access
- backend-managed case data
- organization-owned authorization
- D1 migrations
- Pages Functions routes

## Upgrade sequence

1. Back up any local-only data currently stored in the browser.
2. Provision organization-owned OIDC credentials and database bindings.
3. Apply migrations.
4. Seed or import the first organization, users, and cases.
5. Verify sign-in and `/api/me`.
6. Verify case access for worker, caregiver, and network roles.
7. Verify closed-case access removal for workers.
8. Verify admin invitation and case-membership management.

## Data migration note

The previous application stored the case record in localStorage. That is no longer the source of truth. Existing local browser data should be exported or re-entered into the database-backed case state model.
