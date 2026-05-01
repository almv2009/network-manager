# Hosting And Tenancy Model

## Current deployment model

The current Network Manager deployment is **ATA-hosted multi-tenant infrastructure**.

That means:

- the application is deployed once and used by multiple organizations
- ATA-managed infrastructure hosts the application runtime
- ATA-managed infrastructure stores structured app data and uploaded documents
- each organization is logically isolated by organization id, role permissions, and case-membership access rules

## What is separated per organization

- organization records
- licensed-seat allocation
- users and invitations
- case records
- case memberships
- journal entries
- uploaded documents

Document storage is separated under organization and case prefixes such as:

- `organizations/<organization_id>/cases/<case_id>/...`

## What this model does and does not mean

This model **does** provide:

- tenant separation by organization
- role-based access control
- case-membership-based access control
- centralized operational support
- centralized upgrades and maintenance

This model **does not** mean:

- each organization has its own server
- each organization has its own separate database deployment
- each organization has its own separate object-storage account

## If contractual data separation is required

If an organization requires a contractual claim that its data remains on its own infrastructure, the current deployment model is not sufficient on its own.

That would require one of these enterprise options:

1. **Single-tenant deployment per organization**
   - separate deployment
   - separate database
   - separate document storage
   - optionally separate auth configuration

2. **Bring-your-own storage / database**
   - organization-owned database connection
   - organization-owned object storage
   - tenant-specific configuration and support

## Recommended product model

For the current licensing model, the recommended default remains:

- ATA-hosted multi-tenant deployment
- one organization admin per organization
- platform owner assigns total licensed seats
- organization admin assigns those seats to individual users
- workers and supervisors can create private cases that are visible to their own case roster by default
- organization admins retain visibility across all organization cases

## Enterprise-ready tenancy foundation (current codebase)

The app now includes a tenant runtime layer so one vendor-hosted product can select per-tenant runtime settings without branching the codebase:

- tenant resolution: host domain, subdomain, optional trusted header, optional authenticated claim, then default tenant
- tenant config model: auth mode, database mode, storage mode, domain mappings, branding, and optional organization allow-list
- data provider abstraction:
  - `d1` (active/default)
  - `external_postgres_scaffold` (structural placeholder for organization-owned PostgreSQL)
- storage provider abstraction:
  - `r2` (active/default)
  - `external_object_storage_scaffold` (structural placeholder for organization-owned object storage)
  - `disabled`

This keeps the app vendor-hosted today while allowing tenant-specific infrastructure mapping later via configuration.
