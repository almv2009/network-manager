import { describe, expect, it } from "vitest";

import { bindTenantRuntimeContext, resolveTenantRuntimeForRequest } from "../functions/_lib/tenant-runtime";
import { resolveTenantFromRequest } from "../functions/_lib/tenancy";
import type { AppContext, D1Database, Env, R2Bucket } from "../functions/_lib/types";

function makeDb(label: string): D1Database {
  return {
    prepare() {
      throw new Error(`not implemented: ${label}`);
    },
    batch: async () => [],
    exec: async () => ({}),
  };
}

function makeBucket(): R2Bucket {
  return {
    async get() {
      return null;
    },
    async put() {
      return undefined;
    },
    async delete() {
      return undefined;
    },
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeDb("default"),
    DOCUMENTS_BUCKET: makeBucket(),
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-secret",
    OIDC_ISSUER_URL: "",
    OIDC_CLIENT_ID: "",
    OIDC_CLIENT_SECRET: "",
    ...overrides,
  };
}

function makeContext(request: Request, env: Env): AppContext {
  return {
    request,
    env,
    params: {},
    data: {},
    next: async () => new Response("ok"),
    waitUntil() {
      return;
    },
  };
}

describe("tenant resolution", () => {
  it("resolves the default tenant from APP_BASE_URL host", () => {
    const env = makeEnv();
    const request = new Request("https://network-manager.example.org/api/me");
    const resolved = resolveTenantFromRequest(request, env);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.resolution.tenant.id).toBe("local");
    expect(resolved.resolution.source).toBe("domain");
  });

  it("resolves a configured tenant by custom domain", () => {
    const env = makeEnv({
      TENANT_CONFIG_JSON: JSON.stringify([
        {
          id: "acme",
          name: "Acme Tenant",
          domains: ["acme.network.ataconsultancy.net"],
          auth: { mode: "local_vendor" },
          database: { mode: "d1", d1Binding: "DB" },
          storage: { mode: "r2", r2Binding: "DOCUMENTS_BUCKET" },
        },
      ]),
    });
    const request = new Request("https://acme.network.ataconsultancy.net/api/me");
    const resolved = resolveTenantFromRequest(request, env);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.resolution.tenant.id).toBe("acme");
    expect(resolved.resolution.source).toBe("domain");
  });

  it("blocks unresolved hosts when strict resolution is enabled", () => {
    const env = makeEnv({
      TENANT_STRICT_RESOLUTION: "1",
    });
    const request = new Request("https://unknown-host.example.org/api/me");
    const resolved = resolveTenantFromRequest(request, env);

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe("tenant_unresolved");
  });
});

describe("tenant runtime adapters", () => {
  it("selects D1 + R2 providers for the default tenant", () => {
    const env = makeEnv();
    const request = new Request("https://network-manager.example.org/api/me");
    const runtime = resolveTenantRuntimeForRequest(request, env);

    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;
    expect(runtime.runtime.dataProvider.mode).toBe("d1");
    expect(runtime.runtime.storageProvider.mode).toBe("r2");
  });

  it("returns a clear unavailable error for scaffolded external postgres tenants", () => {
    const env = makeEnv({
      TENANT_CONFIG_JSON: JSON.stringify([
        {
          id: "external-tenant",
          name: "External Tenant",
          domains: ["external.network.ataconsultancy.net"],
          auth: { mode: "sso_scaffold" },
          database: { mode: "external_postgres_scaffold", externalConnectionName: "external_pg_ref" },
          storage: { mode: "external_object_storage_scaffold", externalConnectionName: "external_storage_ref" },
        },
      ]),
    });
    const request = new Request("https://external.network.ataconsultancy.net/api/me");
    const runtime = resolveTenantRuntimeForRequest(request, env);

    expect(runtime.ok).toBe(false);
    if (runtime.ok) return;
    expect(runtime.code).toBe("tenant_data_provider_unavailable");
  });

  it("binds resolved tenant runtime onto request context", () => {
    const tenantDb = makeDb("tenant-db");
    const env = makeEnv({
      DB_TENANT_ACME: tenantDb as unknown as Env["DB"],
      TENANT_CONFIG_JSON: JSON.stringify([
        {
          id: "acme",
          name: "Acme",
          domains: ["acme.network.ataconsultancy.net"],
          auth: { mode: "local_vendor" },
          database: { mode: "d1", d1Binding: "DB_TENANT_ACME" },
          storage: { mode: "disabled" },
        },
      ]),
    });
    const request = new Request("https://acme.network.ataconsultancy.net/api/me");
    const runtimeResult = resolveTenantRuntimeForRequest(request, env);
    expect(runtimeResult.ok).toBe(true);
    if (!runtimeResult.ok) return;

    const context = makeContext(request, env);
    const bound = bindTenantRuntimeContext(context, runtimeResult.runtime);
    expect(bound.env.DB).toBe(tenantDb);
    expect(bound.data.tenantId).toBe("acme");
    expect(bound.data.tenantResolutionSource).toBe("domain");
  });
});

