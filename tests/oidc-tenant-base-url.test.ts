import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginOidcSignIn, consumeOidcCallback } from "../functions/_lib/oidc";
import type { Env } from "../functions/_lib/types";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {
      prepare() {
        throw new Error("not implemented");
      },
      batch: async () => [],
      exec: async () => ({}),
    },
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-session-secret",
    OIDC_ISSUER_URL: "https://issuer.example.org",
    OIDC_CLIENT_ID: "client-id",
    OIDC_CLIENT_SECRET: "client-secret",
    OIDC_SCOPES: "openid profile email",
    ...overrides,
  };
}

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("oidc tenant base url override", () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            issuer: "https://issuer.example.org",
            authorization_endpoint: "https://issuer.example.org/auth",
            token_endpoint: "https://issuer.example.org/token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.endsWith("/token")) {
        const body = new URLSearchParams(String(init?.body || ""));
        const payload = toBase64Url(
          JSON.stringify({
            sub: "oidc-subject-1",
            email: "worker@example.org",
            name: "Tenant Worker",
          }),
        );
        const jwt = `header.${payload}.sig`;
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            id_token: jwt,
            redirectUriUsed: body.get("redirect_uri"),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("not-found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses tenant base url in oidc sign-in redirect_uri", async () => {
    const env = makeEnv();
    const result = await beginOidcSignIn(env, {
      returnTo: "/app",
      baseUrlOverride: "https://acme.network.ataconsultancy.net",
    });
    const authUrl = new URL(result.authUrl);
    expect(authUrl.searchParams.get("redirect_uri")).toBe("https://acme.network.ataconsultancy.net/auth/callback");
  });

  it("uses tenant base url in oidc callback token exchange redirect_uri", async () => {
    const env = makeEnv();
    const signIn = await beginOidcSignIn(env, {
      returnTo: "/app",
      baseUrlOverride: "https://acme.network.ataconsultancy.net",
    });
    const state = new URL(signIn.authUrl).searchParams.get("state");
    expect(state).toBeTruthy();

    const cookiePair = signIn.setCookie.split(";")[0];
    const callbackRequest = new Request(`https://acme.network.ataconsultancy.net/auth/callback?code=abc123&state=${state}`, {
      headers: {
        cookie: cookiePair,
      },
    });

    const callback = await consumeOidcCallback(env, callbackRequest, {
      baseUrlOverride: "https://acme.network.ataconsultancy.net",
    });
    expect(callback.ok).toBe(true);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const tokenCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/token"));
    expect(tokenCall).toBeTruthy();
    const tokenBody = new URLSearchParams(String(tokenCall?.[1]?.body || ""));
    expect(tokenBody.get("redirect_uri")).toBe("https://acme.network.ataconsultancy.net/auth/callback");
  });
});

