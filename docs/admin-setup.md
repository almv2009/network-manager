# Admin Setup README

## First organization admin

The first organization administrator must be created in the database by the organization during setup.

Example flow:

1. Create the organization row.
2. Create the first `users` row with `user_type='org_admin'`.
3. Leave `external_identity_id` null until the first successful sign-in.
4. On first sign-in, the backend binds the OIDC subject to that user automatically.

## Organization admin capabilities

- view organization users
- invite users
- add users to cases
- assign case roles
- revoke case access
- deactivate user access
- view audit events
- close cases

## Invitation model

- invitations are created by admins or authorized workers
- invited users are tied to an organization and optionally a case
- if the invited user does not exist yet, the first successful sign-in can create and bind the user automatically
- email delivery is not hard-coded to a vendor mailbox; if `INVITE_EMAIL_WEBHOOK_URL` is configured the backend posts invite payloads to the organization-owned mail/workflow system, otherwise the admin UI returns an invite URL for manual sharing
