import type { Env } from "./types";

type TurnstileScope = "auth" | "public";

export type TurnstileValidationResult =
  | { ok: true; enforced: boolean }
  | { ok: false; code: string; hint: string };

type TurnstilePayload = {
  success?: boolean;
  hostname?: string;
  action?: string;
  ["error-codes"]?: string[];
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEnabled(value: string | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isTurnstileConfigured(env: Env) {
  return Boolean(normalizeText(env.TURNSTILE_SECRET_KEY));
}

function shouldEnforceForScope(env: Env, scope: TurnstileScope) {
  if (!isTurnstileConfigured(env)) return false;
  if (scope === "auth") return isEnabled(env.TURNSTILE_ENFORCE_AUTH);
  return isEnabled(env.TURNSTILE_ENFORCE_PUBLIC_POSTS);
}

function extractTurnstileToken(request: Request, payload?: unknown) {
  const headerToken =
    normalizeText(request.headers.get("cf-turnstile-token")) ||
    normalizeText(request.headers.get("x-turnstile-token"));
  if (headerToken) return headerToken;
  if (isRecord(payload)) {
    return normalizeText(payload.turnstileToken);
  }
  return "";
}

export async function verifyTurnstileIfEnforced(input: {
  env: Env;
  request: Request;
  payload?: unknown;
  expectedAction: string;
  scope: TurnstileScope;
}): Promise<TurnstileValidationResult> {
  const { env, request, payload, expectedAction, scope } = input;
  const enforce = shouldEnforceForScope(env, scope);
  if (!enforce) {
    return { ok: true, enforced: false };
  }

  const token = extractTurnstileToken(request, payload);
  if (!token) {
    return {
      ok: false,
      code: "turnstile_required",
      hint: "Complete the security verification step and try again.",
    };
  }

  const secret = normalizeText(env.TURNSTILE_SECRET_KEY);
  if (!secret) {
    return {
      ok: false,
      code: "turnstile_not_configured",
      hint: "Security verification is not configured for this deployment.",
    };
  }

  try {
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: normalizeText(request.headers.get("cf-connecting-ip")),
      }).toString(),
    });

    if (!verification.ok) {
      return {
        ok: false,
        code: "turnstile_unavailable",
        hint: "Security verification could not be completed. Refresh and try again.",
      };
    }

    const result = (await verification.json()) as TurnstilePayload;
    if (!result?.success) {
      return {
        ok: false,
        code: "turnstile_failed",
        hint: "Security verification failed. Refresh and try again.",
      };
    }

    const expectedHostname = normalizeText(env.TURNSTILE_EXPECTED_HOSTNAME).toLowerCase();
    const actualHostname = normalizeText(result.hostname).toLowerCase();
    if (expectedHostname && actualHostname && expectedHostname !== actualHostname) {
      return {
        ok: false,
        code: "turnstile_failed",
        hint: "Security verification failed for this origin.",
      };
    }

    const actualAction = normalizeText(result.action);
    if (expectedAction && actualAction && actualAction !== expectedAction) {
      return {
        ok: false,
        code: "turnstile_failed",
        hint: "Security verification action did not match this request.",
      };
    }

    return { ok: true, enforced: true };
  } catch {
    return {
      ok: false,
      code: "turnstile_unavailable",
      hint: "Security verification could not be completed. Refresh and try again.",
    };
  }
}

