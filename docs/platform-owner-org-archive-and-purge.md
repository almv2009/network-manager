# Platform Owner Workspace Archive And Purge

This app supports **archive / restore** in-product. That is the safe owner workflow.

## In-product action

- Use the **Owner dashboard**
- Open **Organization licensing and seat allocation**
- Choose **Archive workspace**

Archive blocks the workspace from being used while preserving the record, audit history, users, and case data.

## Restore

- Use the same owner control and choose **Restore workspace**

## Manual purge

Hard delete is intentionally not exposed in the UI. If a full purge is required, use a controlled maintenance procedure against D1 and document storage.

Minimum purge order:

1. Export any records that must be retained.
2. Archive the workspace first.
3. Delete R2 documents for the organization prefix:
   - `organizations/<organization_id>/...`
4. Delete D1 rows for the organization in dependency order:
   - `case_documents`
   - `journal_entries`
   - `case_memberships`
   - `invitations`
   - `cases`
   - `support_tickets`
   - `billing_events`
   - `audit_events`
   - `auth_sessions`
   - `local_credentials`
   - `users`
   - `organizations`
5. Record the purge action outside the app with:
   - organization id
   - operator
   - timestamp
   - reason

## Operational note

Use purge only when legal, retention, and recovery requirements have been checked. Archive is the default owner action.
