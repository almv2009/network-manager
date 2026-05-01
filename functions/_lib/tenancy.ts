import type { Env } from "./types";

export type TenantAuthMode = "local_vendor" | "oidc_vendor" | "sso_scaffold";
export type TenantDatabaseMode = "d1" | "external_postgres_scaffold";
export type TenantStorageMode = "r2" | "external_object_storage_scaffold" | "disabled";

export type TenantDatabaseConfig = {
  mode: TenantDatabaseMode;
  d1Binding: string | null;
  externalConnectionName: string | null;
};

export type TenantStorageConfig = {
  mode: TenantStorageMode;
  r2Binding: string | null;
  externalConnectionName: string | null;
};

export type TenantAuthConfig = {
  mode: TenantAuthMode;
  oidcConfigRef: string | null;
};

export type TenantBrandingConfig = {
  name: string | null;
  logoUrl: string | null;
};

export type TenantConfig = {
  id: string;
  name: string;
  enabled: boolean;
  domains: string[];
  subdomains: string[];
  auth: TenantAuthConfig;
  database: TenantDatabaseConfig;
  storage: TenantStorageConfig;
  branding: TenantBrandingConfig;
  featureFlags: Record<string, boolean>;
  organizationIdAllowList: string[];
};

export type TenantResolutionSource = "header" | "domain" | "subdomain" | "claim" | "default";

export type TenantResolution = {
  tenant: TenantConfig;
  source: TenantResolutionSource;
  requestHost: string;
  requestedTenantId: string | null;
};

export type TenantCatalog = {
  defaultTenantId: string;
  tenants: TenantConfig[];
  byId: Record<string, TenantConfig>;
  parseWarnings: string[];
  baseHosts: string[];
  headerName: string;
  allowHeaderOverride: boolean;
  strictResolution: boolean;
  trustedClaimHeader: string;
};

export type TenantResolveResult =
  | { ok: true; resolution: TenantResolution; catalog: TenantCatalog }
  | { ok: false; status: 404 | 400; code: string; hint: string; catalog: TenantCatalog };

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeHost(value: unknown) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "";
  const withoutScheme = raw.replace(/^https?:\/\//, "");
  return withoutScheme.split("/")[0].replace(/:\d+$/, "");
}

function parseBooleanFlag(value: unknown, fallback = false) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseStringList(value: unknown) {
  return normalizeText(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTenantId(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function normalizeDomainList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeHost(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return parseStringList(value).map((entry) => normalizeHost(entry)).filter(Boolean);
  }
  return [] as string[];
}

function normalizeSubdomainList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTenantId(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return parseStringList(value).map((entry) => normalizeTenantId(entry)).filter(Boolean);
  }
  return [] as string[];
}

function parseAuthMode(value: unknown, fallback: TenantAuthMode): TenantAuthMode {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "oidc_vendor") return "oidc_vendor";
  if (normalized === "sso_scaffold") return "sso_scaffold";
  if (normalized === "local_vendor") return "local_vendor";
  return fallback;
}

function parseDatabaseMode(value: unknown, fallback: TenantDatabaseMode): TenantDatabaseMode {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "external_postgres_scaffold") return "external_postgres_scaffold";
  return fallback;
}

function parseStorageMode(value: unknown, fallback: TenantStorageMode): TenantStorageMode {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "external_object_storage_scaffold") return "external_object_storage_scaffold";
  if (normalized === "disabled") return "disabled";
  return fallback;
}

function parseFeatureFlags(value: unknown) {
  if (!isRecord(value)) return {};
  const output: Record<string, boolean> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    output[normalizeText(key)] = Boolean(rawValue);
  }
  return output;
}

function parseOrganizationAllowList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return parseStringList(value);
  }
  return [] as string[];
}

function parseTenantFromRecord(
  env: Env,
  record: Record<string, unknown>,
  fallbackTenantId: string,
  fallbackAuthMode: TenantAuthMode,
  fallbackDatabaseMode: TenantDatabaseMode,
  fallbackStorageMode: TenantStorageMode,
): TenantConfig | null {
  const id = normalizeTenantId(record.id);
  if (!id) return null;
  const name = normalizeText(record.name) || id;

  const databaseRecord = isRecord(record.database) ? record.database : {};
  const storageRecord = isRecord(record.storage) ? record.storage : {};
  const authRecord = isRecord(record.auth) ? record.auth : {};
  const brandingRecord = isRecord(record.branding) ? record.branding : {};

  const databaseMode = parseDatabaseMode(databaseRecord.mode, fallbackDatabaseMode);
  const storageMode = parseStorageMode(storageRecord.mode, fallbackStorageMode);
  const authMode = parseAuthMode(authRecord.mode, fallbackAuthMode);

  const d1Binding =
    normalizeText(databaseRecord.d1Binding) ||
    normalizeText(record.d1Binding) ||
    normalizeText(env.TENANT_DEFAULT_D1_BINDING) ||
    "DB";
  const r2Binding =
    normalizeText(storageRecord.r2Binding) ||
    normalizeText(record.r2Binding) ||
    normalizeText(env.TENANT_DEFAULT_R2_BINDING) ||
    "DOCUMENTS_BUCKET";

  return {
    id,
    name,
    enabled: record.enabled === undefined ? true : Boolean(record.enabled),
    domains: normalizeDomainList(record.domains),
    subdomains: normalizeSubdomainList(record.subdomains),
    auth: {
      mode: authMode,
      oidcConfigRef: normalizeText(authRecord.oidcConfigRef || record.oidcConfigRef) || null,
    },
    database: {
      mode: databaseMode,
      d1Binding: databaseMode === "d1" ? d1Binding : null,
      externalConnectionName:
        databaseMode === "external_postgres_scaffold"
          ? normalizeText(databaseRecord.externalConnectionName || record.externalDbConnectionName || env.TENANT_DEFAULT_EXTERNAL_DB_CONNECTION) || null
          : null,
    },
    storage: {
      mode: storageMode,
      r2Binding: storageMode === "r2" ? r2Binding : null,
      externalConnectionName:
        storageMode === "external_object_storage_scaffold"
          ? normalizeText(storageRecord.externalConnectionName || record.externalStorageConnectionName || env.TENANT_DEFAULT_EXTERNAL_STORAGE_CONNECTION) || null
          : null,
    },
    branding: {
      name: normalizeText(brandingRecord.name) || null,
      logoUrl: normalizeText(brandingRecord.logoUrl) || null,
    },
    featureFlags: parseFeatureFlags(record.featureFlags),
    organizationIdAllowList: parseOrganizationAllowList(record.organizationIdAllowList),
  };
}

function buildDefaultTenant(env: Env): TenantConfig {
  const appBaseHost = normalizeHost(env.APP_BASE_URL);
  const additionalBaseHosts = parseStringList(env.TENANT_BASE_HOSTS)
    .map((entry) => normalizeHost(entry))
    .filter(Boolean);
  const defaultTenantId = normalizeTenantId(env.TENANT_DEFAULT_ID || "local") || "local";
  const defaultAuthMode = parseAuthMode(env.TENANT_DEFAULT_AUTH_MODE, "local_vendor");
  const defaultDatabaseMode = parseDatabaseMode(env.TENANT_DEFAULT_DATABASE_MODE, "d1");
  const defaultStorageMode = parseStorageMode(env.TENANT_DEFAULT_STORAGE_MODE, "r2");
  const domains = Array.from(new Set([appBaseHost, ...additionalBaseHosts].filter(Boolean)));
  return {
    id: defaultTenantId,
    name: "Default tenant",
    enabled: true,
    domains,
    subdomains: [],
    auth: {
      mode: defaultAuthMode,
      oidcConfigRef: null,
    },
    database: {
      mode: defaultDatabaseMode,
      d1Binding:
        defaultDatabaseMode === "d1"
          ? normalizeText(env.TENANT_DEFAULT_D1_BINDING) || "DB"
          : null,
      externalConnectionName:
        defaultDatabaseMode === "external_postgres_scaffold"
          ? normalizeText(env.TENANT_DEFAULT_EXTERNAL_DB_CONNECTION) || null
          : null,
    },
    storage: {
      mode: defaultStorageMode,
      r2Binding:
        defaultStorageMode === "r2"
          ? normalizeText(env.TENANT_DEFAULT_R2_BINDING) || "DOCUMENTS_BUCKET"
          : null,
      externalConnectionName:
        defaultStorageMode === "external_object_storage_scaffold"
          ? normalizeText(env.TENANT_DEFAULT_EXTERNAL_STORAGE_CONNECTION) || null
          : null,
    },
    branding: {
      name: normalizeText(env.ORGANIZATION_BRANDING_NAME) || null,
      logoUrl: normalizeText(env.ORGANIZATION_BRANDING_LOGO_URL) || null,
    },
    featureFlags: {},
    organizationIdAllowList: [],
  };
}

function buildEnterprisePlaceholderTenant(env: Env): TenantConfig {
  return {
    id: "enterprise_placeholder",
    name: "Enterprise placeholder tenant",
    enabled: false,
    domains: [],
    subdomains: [],
    auth: {
      mode: "sso_scaffold",
      oidcConfigRef: "enterprise-oidc-placeholder",
    },
    database: {
      mode: "external_postgres_scaffold",
      d1Binding: null,
      externalConnectionName: normalizeText(env.TENANT_DEFAULT_EXTERNAL_DB_CONNECTION) || "enterprise-postgres-connection",
    },
    storage: {
      mode: "external_object_storage_scaffold",
      r2Binding: null,
      externalConnectionName: normalizeText(env.TENANT_DEFAULT_EXTERNAL_STORAGE_CONNECTION) || "enterprise-object-storage-connection",
    },
    branding: {
      name: null,
      logoUrl: null,
    },
    featureFlags: {},
    organizationIdAllowList: [],
  };
}

export function resolveTenantCatalog(env: Env): TenantCatalog {
  const defaultTenant = buildDefaultTenant(env);
  const defaultAuthMode = defaultTenant.auth.mode;
  const defaultDatabaseMode = defaultTenant.database.mode;
  const defaultStorageMode = defaultTenant.storage.mode;
  const parseWarnings: string[] = [];

  const parsedTenants: TenantConfig[] = [defaultTenant, buildEnterprisePlaceholderTenant(env)];
  const rawConfig = normalizeText(env.TENANT_CONFIG_JSON);
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.tenants)
          ? parsed.tenants
          : [];
      for (const record of records) {
        if (!isRecord(record)) continue;
        const tenant = parseTenantFromRecord(
          env,
          record,
          defaultTenant.id,
          defaultAuthMode,
          defaultDatabaseMode,
          defaultStorageMode,
        );
        if (tenant) {
          parsedTenants.push(tenant);
        }
      }
    } catch {
      parseWarnings.push("TENANT_CONFIG_JSON could not be parsed as JSON.");
    }
  }

  const byId: Record<string, TenantConfig> = {};
  for (const tenant of parsedTenants) {
    byId[tenant.id] = tenant;
  }

  const requestedDefaultTenantId = normalizeTenantId(env.TENANT_DEFAULT_ID || defaultTenant.id) || defaultTenant.id;
  const defaultTenantId = byId[requestedDefaultTenantId] ? requestedDefaultTenantId : defaultTenant.id;

  const appBaseHost = normalizeHost(env.APP_BASE_URL);
  const baseHosts = [
    ...new Set(
      [
        ...parseStringList(env.TENANT_BASE_HOSTS).map((entry) => normalizeHost(entry)),
        appBaseHost,
      ].filter(Boolean),
    ),
  ];

  return {
    defaultTenantId,
    tenants: Object.values(byId),
    byId,
    parseWarnings,
    baseHosts,
    headerName: normalizeText(env.TENANT_HEADER_NAME).toLowerCase() || "x-sgt-tenant-id",
    allowHeaderOverride: parseBooleanFlag(env.TENANT_ALLOW_HEADER_OVERRIDE, false),
    strictResolution: parseBooleanFlag(env.TENANT_STRICT_RESOLUTION, false),
    trustedClaimHeader: normalizeText(env.TENANT_TRUSTED_CLAIM_HEADER).toLowerCase() || "x-sgt-auth-tenant",
  };
}

function matchByDomain(catalog: TenantCatalog, requestHost: string) {
  return catalog.tenants.find(
    (tenant) => tenant.enabled && tenant.domains.some((domain) => domain === requestHost),
  );
}

function matchBySubdomain(catalog: TenantCatalog, requestHost: string) {
  const firstLabel = requestHost.split(".")[0] || "";
  for (const tenant of catalog.tenants) {
    if (!tenant.enabled || !tenant.subdomains.length) continue;
    for (const subdomain of tenant.subdomains) {
      if (subdomain !== firstLabel) continue;
      for (const baseHost of catalog.baseHosts) {
        if (requestHost === `${subdomain}.${baseHost}`) {
          return tenant;
        }
      }
    }
  }
  return null;
}

function resolveAuthenticatedClaim(request: Request, catalog: TenantCatalog, explicitClaim?: string | null) {
  const headerClaim = normalizeTenantId(request.headers.get(catalog.trustedClaimHeader));
  const claim = normalizeTenantId(explicitClaim || headerClaim);
  if (!claim) return null;
  const tenant = catalog.byId[claim];
  return tenant?.enabled ? tenant : null;
}

export function resolveTenantFromRequest(
  request: Request,
  env: Env,
  options: { authenticatedTenantClaim?: string | null } = {},
): TenantResolveResult {
  const catalog = resolveTenantCatalog(env);
  const requestHost = normalizeHost(new URL(request.url).host);
  const requestedHeaderTenantId = normalizeTenantId(
    catalog.allowHeaderOverride ? request.headers.get(catalog.headerName) : "",
  );

  if (requestedHeaderTenantId) {
    const tenant = catalog.byId[requestedHeaderTenantId];
    if (!tenant || !tenant.enabled) {
      return {
        ok: false,
        status: 404,
        code: "tenant_not_found",
        hint: "The requested tenant does not exist.",
        catalog,
      };
    }
    return {
      ok: true,
      catalog,
      resolution: {
        tenant,
        source: "header",
        requestHost,
        requestedTenantId: requestedHeaderTenantId,
      },
    };
  }

  const domainTenant = matchByDomain(catalog, requestHost);
  if (domainTenant) {
    return {
      ok: true,
      catalog,
      resolution: {
        tenant: domainTenant,
        source: "domain",
        requestHost,
        requestedTenantId: null,
      },
    };
  }

  const subdomainTenant = matchBySubdomain(catalog, requestHost);
  if (subdomainTenant) {
    return {
      ok: true,
      catalog,
      resolution: {
        tenant: subdomainTenant,
        source: "subdomain",
        requestHost,
        requestedTenantId: null,
      },
    };
  }

  const claimTenant = resolveAuthenticatedClaim(request, catalog, options.authenticatedTenantClaim);
  if (claimTenant) {
    return {
      ok: true,
      catalog,
      resolution: {
        tenant: claimTenant,
        source: "claim",
        requestHost,
        requestedTenantId: normalizeTenantId(options.authenticatedTenantClaim || request.headers.get(catalog.trustedClaimHeader)),
      },
    };
  }

  const fallbackTenant = catalog.byId[catalog.defaultTenantId];
  if (!fallbackTenant || !fallbackTenant.enabled) {
    return {
      ok: false,
      status: 404,
      code: "tenant_not_found",
      hint: "No default tenant is configured for this deployment.",
      catalog,
    };
  }
  if (catalog.strictResolution) {
    return {
      ok: false,
      status: 404,
      code: "tenant_unresolved",
      hint: "Tenant could not be resolved from the request host or tenant headers.",
      catalog,
    };
  }
  return {
    ok: true,
    catalog,
    resolution: {
      tenant: fallbackTenant,
      source: "default",
      requestHost,
      requestedTenantId: null,
    },
  };
}

export function listTenantHosts(tenant: TenantConfig, catalog: TenantCatalog) {
  const hosts = new Set<string>();
  for (const domain of tenant.domains) {
    hosts.add(domain);
  }
  for (const subdomain of tenant.subdomains) {
    for (const baseHost of catalog.baseHosts) {
      hosts.add(`${subdomain}.${baseHost}`);
    }
  }
  return hosts;
}

export function resolveTenantPublicBaseUrl(tenant: TenantConfig, env: Env, request: Request, catalog?: TenantCatalog) {
  const requestUrl = new URL(request.url);
  const requestProtocol = requestUrl.protocol === "http:" ? "http" : "https";
  const activeCatalog = catalog || resolveTenantCatalog(env);
  const hosts = listTenantHosts(tenant, activeCatalog);
  const preferredHost =
    tenant.domains[0] ||
    Array.from(hosts)[0] ||
    normalizeHost(env.APP_BASE_URL) ||
    normalizeHost(requestUrl.host);
  if (!preferredHost) {
    return `${requestProtocol}://${requestUrl.host}`;
  }
  const localHost = preferredHost === "localhost" || preferredHost.startsWith("127.0.0.1");
  const scheme = localHost ? "http" : "https";
  return `${scheme}://${preferredHost}`;
}

export function isTenantOrganizationAllowed(tenant: TenantConfig, organizationId: string | null | undefined) {
  const normalized = normalizeText(organizationId);
  if (!normalized) return false;
  if (!tenant.organizationIdAllowList.length) return true;
  return tenant.organizationIdAllowList.includes(normalized);
}

export function getTenantReadinessCheck(env: Env) {
  const catalog = resolveTenantCatalog(env);
  const issues: string[] = [];
  if (!catalog.byId[catalog.defaultTenantId]) {
    issues.push("TENANT_DEFAULT_ID does not map to a configured tenant.");
  }
  if (catalog.parseWarnings.length) {
    issues.push(...catalog.parseWarnings);
  }

  const enabledTenants = catalog.tenants.filter((tenant) => tenant.enabled);
  if (!enabledTenants.length) {
    issues.push("No enabled tenants are configured.");
  }

  return {
    status: issues.length ? "warning" : "ready",
    detail: issues.length
      ? "Tenant configuration has warnings. Review TENANT_CONFIG_JSON and tenant defaults."
      : "Tenant configuration is loaded and ready for per-tenant runtime selection.",
    missing: issues,
  };
}
