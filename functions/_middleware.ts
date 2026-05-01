import { applySecurityHeaders, buildBlockedSourceMapResponse } from "./_lib/security";
import { listTenantHosts, resolveTenantFromRequest, resolveTenantPublicBaseUrl } from "./_lib/tenancy";
import type { AppContext } from "./_lib/types";

export const onRequest = async (context: AppContext) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  const requestHost = url.hostname.toLowerCase();
  const tenantResult = resolveTenantFromRequest(context.request, context.env);

  if (!tenantResult.ok) {
    const response = new Response(
      JSON.stringify({
        ok: false,
        error: tenantResult.code,
        hint: tenantResult.hint,
      }),
      {
        status: tenantResult.status,
        headers: {
          "content-type": "application/json",
        },
      },
    );
    return applySecurityHeaders(context.request, response);
  }
  const tenantResolution = tenantResult.resolution;
  const knownTenantHosts = listTenantHosts(tenantResolution.tenant, tenantResult.catalog);
  const localRequest = requestHost === "localhost" || requestHost === "127.0.0.1";

  if (!localRequest && knownTenantHosts.size && !knownTenantHosts.has(requestHost)) {
    const canonicalOrigin = resolveTenantPublicBaseUrl(tenantResolution.tenant, context.env, context.request, tenantResult.catalog);
    const destination = new URL(`${url.pathname}${url.search}`, canonicalOrigin);
    return Response.redirect(destination.toString(), 308);
  }

  if (pathname.endsWith(".map")) {
    return buildBlockedSourceMapResponse(context.request);
  }

  const response = await context.next();
  const secured = applySecurityHeaders(context.request, response);
  secured.headers.set("x-sgt-tenant-id", tenantResolution.tenant.id);
  secured.headers.set("x-sgt-tenant-source", tenantResolution.source);
  return secured;
};
