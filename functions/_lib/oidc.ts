import { getConfig } from "./config";
import { clearCookie, parseCookies, sealCookieValue, unsealCookieValue } from "./cookies";
import type { Env } from "./types";

type OidcDiscoveryDocument = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  issuer: string;
};

type AuthFlowState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  inviteToken: string | null;
  issuedAt: string;
};

const FLOW_COOKIE = "nm_auth_flow";

function randomString(length = 48) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

function base64UrlEncode(input: Uint8Array) {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

let discoveryCache: OidcDiscoveryDocument | null = null;

export async function getDiscovery(env: Env) {
  if (discoveryCache) return discoveryCache;
  const config = getConfig(env);
  const response = await fetch(`${config.oidcIssuerUrl}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status})`);
  }
  discoveryCache = (await response.json()) as OidcDiscoveryDocument;
  return discoveryCache;
}

export async function beginOidcSignIn(env: Env, options: { returnTo?: string | null; inviteToken?: string | null }) {
  const config = getConfig(env);
  const discovery = await getDiscovery(env);
  const state = randomString(32);
  const codeVerifier = randomString(96);
  const codeChallenge = await pkceChallenge(codeVerifier);
  const returnTo = String(options.returnTo || "/app").startsWith("/")
    ? String(options.returnTo || "/app")
    : "/app";

  const authFlow: AuthFlowState = {
    state,
    codeVerifier,
    returnTo,
    inviteToken: options.inviteToken || null,
    issuedAt: new Date().toISOString(),
  };
  const cookieValue = await sealCookieValue(config.sessionSecret, authFlow);
  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("client_id", config.oidcClientId);
  authUrl.searchParams.set("redirect_uri", `${config.appBaseUrl}/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.oidcScopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return {
    authUrl: authUrl.toString(),
    setCookie: `${FLOW_COOKIE}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=900`,
  };
}

export async function consumeOidcCallback(env: Env, request: Request) {
  const config = getConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);
  const cookieState = await unsealCookieValue<AuthFlowState>(config.sessionSecret, cookies[FLOW_COOKIE]);
  if (!code || !state || !cookieState || cookieState.state !== state) {
    return {
      ok: false as const,
      clearCookie: clearCookie(FLOW_COOKIE),
      error: "invalid_auth_state",
    };
  }

  const discovery = await getDiscovery(env);
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.appBaseUrl}/auth/callback`,
      client_id: config.oidcClientId,
      client_secret: config.oidcClientSecret,
      code_verifier: cookieState.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    return {
      ok: false as const,
      clearCookie: clearCookie(FLOW_COOKIE),
      error: `token_exchange_failed_${tokenResponse.status}`,
    };
  }

  const tokenJson = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
  };

  let profile: Record<string, unknown> = {};
  if (discovery.userinfo_endpoint && tokenJson.access_token) {
    const userInfoResponse = await fetch(discovery.userinfo_endpoint, {
      headers: {
        authorization: `Bearer ${tokenJson.access_token}`,
      },
    });
    if (userInfoResponse.ok) {
      profile = (await userInfoResponse.json()) as Record<string, unknown>;
    }
  }

  if (!profile.sub && tokenJson.id_token) {
    const [, payload] = tokenJson.id_token.split(".");
    if (payload) {
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4));
      profile = JSON.parse(decoded) as Record<string, unknown>;
    }
  }

  const email = String(profile.email || profile.preferred_username || "").trim().toLowerCase();
  const subject = String(profile.sub || "").trim();
  const displayName =
    String(profile.name || profile.given_name || profile.preferred_username || email || "Invited user").trim();

  return {
    ok: true as const,
    clearCookie: clearCookie(FLOW_COOKIE),
    inviteToken: cookieState.inviteToken,
    returnTo: cookieState.returnTo,
    identity: {
      email: email || null,
      subject,
      displayName,
      rawProfile: profile,
    },
  };
}
