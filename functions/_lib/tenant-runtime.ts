import type { AppContext, D1Database, Env, R2Bucket } from "./types";
import {
  type TenantConfig,
  type TenantResolution,
  resolveTenantFromRequest,
  resolveTenantPublicBaseUrl,
} from "./tenancy";

export type TenantDataProvider =
  | {
      mode: "d1";
      available: true;
      bindingName: string;
      db: D1Database;
    }
  | {
      mode: "external_postgres_scaffold";
      available: false;
      externalConnectionName: string | null;
      reason: string;
    };

export type TenantStorageProvider =
  | {
      mode: "r2";
      available: boolean;
      bindingName: string;
      bucket: R2Bucket | null;
      reason?: string;
    }
  | {
      mode: "external_object_storage_scaffold";
      available: false;
      externalConnectionName: string | null;
      bucket: null;
      reason: string;
    }
  | {
      mode: "disabled";
      available: true;
      bucket: null;
    };

export type TenantRuntime = {
  tenant: TenantConfig;
  resolution: TenantResolution;
  dataProvider: TenantDataProvider;
  storageProvider: TenantStorageProvider;
  publicBaseUrl: string;
};

export type TenantRuntimeResult =
  | { ok: true; runtime: TenantRuntime }
  | { ok: false; status: number; code: string; hint: string };

function isD1Database(value: unknown): value is D1Database {
  return typeof value === "object" && value !== null && typeof (value as D1Database).prepare === "function";
}

function isR2Bucket(value: unknown): value is R2Bucket {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as R2Bucket).get === "function" &&
    typeof (value as R2Bucket).put === "function"
  );
}

function resolveDataProvider(env: Env, tenant: TenantConfig): TenantDataProvider {
  if (tenant.database.mode === "external_postgres_scaffold") {
    return {
      mode: "external_postgres_scaffold",
      available: false,
      externalConnectionName: tenant.database.externalConnectionName,
      reason:
        "This tenant is configured for external PostgreSQL, but the provider is scaffolded only. Add an implementation before go-live.",
    };
  }

  const bindingName = tenant.database.d1Binding || "DB";
  const bindingCandidate = (env as Record<string, unknown>)[bindingName];
  if (!isD1Database(bindingCandidate)) {
    return {
      mode: "external_postgres_scaffold",
      available: false,
      externalConnectionName: tenant.database.externalConnectionName,
      reason: `D1 binding "${bindingName}" is not available for tenant "${tenant.id}".`,
    };
  }
  return {
    mode: "d1",
    available: true,
    bindingName,
    db: bindingCandidate,
  };
}

function resolveStorageProvider(env: Env, tenant: TenantConfig): TenantStorageProvider {
  if (tenant.storage.mode === "disabled") {
    return {
      mode: "disabled",
      available: true,
      bucket: null,
    };
  }

  if (tenant.storage.mode === "external_object_storage_scaffold") {
    return {
      mode: "external_object_storage_scaffold",
      available: false,
      externalConnectionName: tenant.storage.externalConnectionName,
      bucket: null,
      reason:
        "This tenant is configured for external object storage, but the provider is scaffolded only. Add an implementation before go-live.",
    };
  }

  const bindingName = tenant.storage.r2Binding || "DOCUMENTS_BUCKET";
  const bindingCandidate = (env as Record<string, unknown>)[bindingName];
  if (!isR2Bucket(bindingCandidate)) {
    return {
      mode: "r2",
      available: false,
      bindingName,
      bucket: null,
      reason: `R2 binding "${bindingName}" is not available for tenant "${tenant.id}".`,
    };
  }
  return {
    mode: "r2",
    available: true,
    bindingName,
    bucket: bindingCandidate,
  };
}

export function resolveTenantRuntimeForRequest(
  request: Request,
  env: Env,
  options: { authenticatedTenantClaim?: string | null } = {},
): TenantRuntimeResult {
  const tenantResult = resolveTenantFromRequest(request, env, {
    authenticatedTenantClaim: options.authenticatedTenantClaim,
  });
  if (!tenantResult.ok) {
    return {
      ok: false,
      status: tenantResult.status,
      code: tenantResult.code,
      hint: tenantResult.hint,
    };
  }

  const { resolution, catalog } = tenantResult;
  const tenant = resolution.tenant;
  const dataProvider = resolveDataProvider(env, tenant);
  if (!dataProvider.available) {
    return {
      ok: false,
      status: 503,
      code: "tenant_data_provider_unavailable",
      hint: dataProvider.reason,
    };
  }
  const storageProvider = resolveStorageProvider(env, tenant);
  const publicBaseUrl = resolveTenantPublicBaseUrl(tenant, env, request, catalog);
  return {
    ok: true,
    runtime: {
      tenant,
      resolution,
      dataProvider,
      storageProvider,
      publicBaseUrl,
    },
  };
}

export function bindTenantRuntimeContext(context: AppContext, runtime: TenantRuntime): AppContext {
  const nextEnv: Env = {
    ...context.env,
    DB: runtime.dataProvider.db,
    DOCUMENTS_BUCKET: runtime.storageProvider.bucket || undefined,
  };
  return {
    ...context,
    env: nextEnv,
    data: {
      ...(context.data || {}),
      tenant: runtime.tenant,
      tenantRuntime: runtime,
      tenantId: runtime.tenant.id,
      tenantResolutionSource: runtime.resolution.source,
      tenantPublicBaseUrl: runtime.publicBaseUrl,
      tenantDataProviderMode: runtime.dataProvider.mode,
      tenantStorageProviderMode: runtime.storageProvider.mode,
    },
  };
}

