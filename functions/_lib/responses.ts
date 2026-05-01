export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "private, no-store");
  }
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers,
  });
}

export function redirect(location: string, status = 302, headersInit?: HeadersInit) {
  const headers = new Headers(headersInit);
  headers.set("location", location);
  return new Response(null, { status, headers });
}

export function errorJson(status: number, error: string, hint: string, extra: Record<string, unknown> = {}) {
  return json(
    {
      ok: false,
      error,
      hint,
      ...extra,
    },
    { status },
  );
}

export function methodNotAllowed(allow: string[]) {
  return errorJson(405, "method_not_allowed", `Allowed methods: ${allow.join(", ")}`, {
    allow,
  });
}
