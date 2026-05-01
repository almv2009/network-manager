# Enterprise tenant configuration (readiness layer)

This app is still vendor-hosted, but now supports tenant-specific runtime selection from configuration.

## Resolution order

The runtime resolves tenant context in this order:

1. tenant header (only when `TENANT_ALLOW_HEADER_OVERRIDE=1`)
2. exact domain match
3. configured subdomain match
4. trusted authenticated claim header (`TENANT_TRUSTED_CLAIM_HEADER`)
5. default tenant fallback (`TENANT_DEFAULT_ID`) unless strict mode is enabled

## Core tenant env contract

- `TENANT_DEFAULT_ID`
- `TENANT_CONFIG_JSON`
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
- `TENANT_DEFAULT_EXTERNAL_DB_CONNECTION` (scaffold)
- `TENANT_DEFAULT_EXTERNAL_STORAGE_CONNECTION` (scaffold)

## Example `TENANT_CONFIG_JSON`

```json
[
  {
    "id": "default",
    "name": "Default tenant",
    "enabled": true,
    "domains": ["network.ataconsultancy.network", "network-manager-2zs.pages.dev"],
    "auth": { "mode": "local_vendor" },
    "database": { "mode": "d1", "d1Binding": "DB" },
    "storage": { "mode": "r2", "r2Binding": "DOCUMENTS_BUCKET" }
  },
  {
    "id": "future-enterprise-acme",
    "name": "Acme Enterprise",
    "enabled": true,
    "domains": ["network.acme.org"],
    "subdomains": ["acme"],
    "auth": { "mode": "sso_scaffold", "oidcConfigRef": "acme-oidc" },
    "database": {
      "mode": "external_postgres_scaffold",
      "externalConnectionName": "acme-postgres"
    },
    "storage": {
      "mode": "external_object_storage_scaffold",
      "externalConnectionName": "acme-blob"
    },
    "organizationIdAllowList": ["org_acme_01"]
  }
]
```

## Current provider status

- `d1` and `r2` providers are active.
- `external_postgres_scaffold` and `external_object_storage_scaffold` are intentionally scaffolded placeholders and return explicit runtime errors until implemented.
