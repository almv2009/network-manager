import { describe, expect, it } from "vitest";

import { getConfig, isPlatformOwnerEmail } from "../functions/_lib/config";
import type { Env } from "../functions/_lib/types";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env["DB"],
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-secret",
    OIDC_ISSUER_URL: "",
    OIDC_CLIENT_ID: "",
    OIDC_CLIENT_SECRET: "",
    SUPPORT_EMAIL: "admin@ataconsultancy.net",
    ...overrides,
  };
}

describe("platform owner configuration", () => {
  it("does not grant owner access unless PLATFORM_OWNER_EMAILS is explicitly configured", () => {
    const env = makeEnv({ PLATFORM_OWNER_EMAILS: "" });

    expect(getConfig(env).platformOwnerEmails).toEqual([]);
    expect(isPlatformOwnerEmail(env, "admin@ataconsultancy.net")).toBe(false);
  });

  it("matches only explicitly configured platform owner emails", () => {
    const env = makeEnv({ PLATFORM_OWNER_EMAILS: "owner@example.org,admin@ataconsultancy.net" });

    expect(isPlatformOwnerEmail(env, "owner@example.org")).toBe(true);
    expect(isPlatformOwnerEmail(env, "admin@ataconsultancy.net")).toBe(true);
    expect(isPlatformOwnerEmail(env, "almv2009@gmail.com")).toBe(false);
  });
});
