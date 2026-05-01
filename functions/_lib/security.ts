type SecurityLogLevel = "info" | "warn" | "error";

const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "connect-src 'self' https://challenges.cloudflare.com",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-src https://challenges.cloudflare.com",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

function truncate(value: string | null | undefined, limit = 160) {
  const normalized = String(value || "").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function isHttps(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function isHtmlResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

function setDefaultHeader(headers: Headers, name: string, value: string) {
  if (!headers.has(name)) {
    headers.set(name, value);
  }
}

function buildLogRecord(request: Request, event: string, details: Record<string, unknown> = {}) {
  const url = new URL(request.url);
  return {
    ts: new Date().toISOString(),
    category: "security",
    event,
    method: request.method,
    path: url.pathname,
    cfRay: request.headers.get("cf-ray") || undefined,
    ip: request.headers.get("cf-connecting-ip") || undefined,
    userAgent: truncate(request.headers.get("user-agent")),
    ...details,
  };
}

export function logSecurityEvent(
  request: Request,
  event: string,
  details: Record<string, unknown> = {},
  level: SecurityLogLevel = "warn",
) {
  const record = JSON.stringify(buildLogRecord(request, event, details));
  if (level === "error") {
    console.error(record);
    return;
  }
  if (level === "info") {
    console.log(record);
    return;
  }
  console.warn(record);
}

export function logOperationalError(
  request: Request,
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  logSecurityEvent(
    request,
    event,
    {
      ...details,
      errorName: error instanceof Error ? error.name : "unknown_error",
      errorMessage: truncate(error instanceof Error ? error.message : String(error || "unknown_error"), 240),
    },
    "error",
  );
}

export function applySecurityHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers);

  setDefaultHeader(headers, "Referrer-Policy", "strict-origin-when-cross-origin");
  setDefaultHeader(headers, "X-DNS-Prefetch-Control", "off");
  setDefaultHeader(headers, "X-Permitted-Cross-Domain-Policies", "none");
  setDefaultHeader(headers, "X-Content-Type-Options", "nosniff");
  setDefaultHeader(headers, "X-Frame-Options", "DENY");
  setDefaultHeader(headers, "Permissions-Policy", permissionsPolicy);
  setDefaultHeader(headers, "Cross-Origin-Opener-Policy", "same-origin");
  setDefaultHeader(headers, "Cross-Origin-Resource-Policy", "same-origin");
  setDefaultHeader(headers, "Origin-Agent-Cluster", "?1");

  if (isHttps(request)) {
    setDefaultHeader(headers, "Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  if (isHtmlResponse(response)) {
    setDefaultHeader(headers, "Content-Security-Policy", contentSecurityPolicy);
    if (!headers.has("cache-control")) {
      headers.set("cache-control", "no-store");
    }
  }

  const pathname = new URL(request.url).pathname;
  if ((pathname.startsWith("/api/") || pathname.startsWith("/auth/")) && !headers.has("cache-control")) {
    headers.set("cache-control", "private, no-store");
  }

  headers.delete("SourceMap");
  headers.delete("X-SourceMap");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function buildBlockedSourceMapResponse(request: Request) {
  logSecurityEvent(request, "source_map_blocked", { outcome: "blocked" });
  return applySecurityHeaders(
    request,
    new Response("Not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    }),
  );
}
