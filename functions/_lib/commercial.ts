import { findBillingPlan, getBillingPlanCatalog } from "../../shared/billing-plans";
import type {
  AlternativePaymentMethod,
  AlternativePaymentRequestPayload,
  AlternativePaymentRequestRecord,
  BillingCheckoutPayload,
  BillingCheckoutResponse,
  BillingEventRecord,
  NetworkBillingPlanKey,
  NetworkBillingPlanOption,
  SupportTicketPayload,
  SupportTicketRecord,
  SupportTicketResponse,
} from "../../shared/types";
import {
  createAlternativePaymentRequest,
  createBillingEvent,
  createId,
  createSupportTicket,
  getAlternativePaymentRequestById,
  listAlternativePaymentRequestsForAdmin,
  listBillingEventsForAdmin,
  listSupportTicketsForAdmin,
  updateAlternativePaymentRequestById,
} from "./db";
import { errorJson } from "./responses";
import { logOperationalError, logSecurityEvent } from "./security";
import { resolveTenantCatalog, resolveTenantFromRequest, resolveTenantPublicBaseUrl } from "./tenancy";
import type { AppContext, Env } from "./types";

const stripeApiBase = "https://api.stripe.com/v1";
const webhookToleranceSeconds = 300;

export function getSupportEmail(env: Env): string {
  return String(env.SUPPORT_EMAIL || "admin@ataconsultancy.net").trim() || "admin@ataconsultancy.net";
}

export function getAllowedAlternativePaymentMethods(env: Env): AlternativePaymentMethod[] {
  const configured = String(env.ALLOWED_ALTERNATIVE_PAYMENT_METHODS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter(isAlternativePaymentMethod) as AlternativePaymentMethod[];
  return configured.length ? configured : ["wise", "e_transfer", "cheque", "eft"];
}

export function isAlternativePaymentsEnabled(env: Env): boolean {
  return String(env.ENABLE_ALTERNATIVE_PAYMENTS || "true").trim().toLowerCase() !== "false";
}

export function getNetworkBillingPlans(env: Env): NetworkBillingPlanOption[] {
  const catalog = getBillingPlanCatalog();
  return catalog.map((plan) => ({
    ...plan,
    availableForCheckout: false,
  }));
}

export function resolveStripePriceId(env: Env, planKey: NetworkBillingPlanKey): string | null {
  const map: Record<NetworkBillingPlanKey, string | undefined> = {
    team: env.STRIPE_PRICE_ID_TEAM?.trim(),
    small_organization: env.STRIPE_PRICE_ID_SMALL_ORGANIZATION?.trim(),
    medium_organization: env.STRIPE_PRICE_ID_MEDIUM_ORGANIZATION?.trim(),
    large_organization: env.STRIPE_PRICE_ID_LARGE_ORGANIZATION?.trim(),
  };
  return map[planKey] || null;
}

export function isStripeConfigured(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function parseSupportTicketPayload(value: unknown): { ok: true; data: SupportTicketPayload } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const fullName = readString(value.fullName);
  const email = readString(value.email).toLowerCase();
  const organizationName = readOptionalString(value.organizationName);
  const summary = readString(value.summary);
  const details = readString(value.details);
  const stepsToReproduce = readOptionalString(value.stepsToReproduce);
  const expectedOutcome = readOptionalString(value.expectedOutcome);
  const actualOutcome = readOptionalString(value.actualOutcome);
  const currentPath = readOptionalString(value.currentPath);
  const activeTab = readOptionalString(value.activeTab);
  const screenshotName = readOptionalString(value.screenshotName);
  const screenshotContentType = readOptionalString(value.screenshotContentType);
  const screenshotDataUrl = readOptionalString(value.screenshotDataUrl);

  if (!fullName || !email || !summary || !details) {
    return { ok: false, message: "Full name, email, summary, and details are required." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (screenshotDataUrl && screenshotDataUrl.length > 4_000_000) {
    return { ok: false, message: "The screenshot is too large. Try an image under about 3 MB." };
  }

  return {
    ok: true,
    data: {
      fullName,
      email,
      ...(organizationName ? { organizationName } : {}),
      summary,
      details,
      ...(stepsToReproduce ? { stepsToReproduce } : {}),
      ...(expectedOutcome ? { expectedOutcome } : {}),
      ...(actualOutcome ? { actualOutcome } : {}),
      ...(currentPath ? { currentPath } : {}),
      ...(activeTab ? { activeTab } : {}),
      ...(screenshotName ? { screenshotName } : {}),
      ...(screenshotContentType ? { screenshotContentType } : {}),
      ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
    },
  };
}

export async function submitSupportTicket(
  context: AppContext,
  payload: SupportTicketPayload,
  session?: { user: { id: string; email: string; displayName: string }; organization: { id: string; name: string } } | null
): Promise<SupportTicketResponse> {
  const record: SupportTicketRecord & { userId?: string | null; organizationId?: string | null } = {
    id: createId("support"),
    createdAt: new Date().toISOString(),
    targetEmail: getSupportEmail(context.env),
    status: "submitted",
    ...payload,
    ...(session?.user?.id ? { userId: session.user.id } : {}),
    ...(session?.organization?.id ? { organizationId: session.organization.id } : {}),
  };

  const ticket = await createSupportTicket(context.env.DB, record);
  if (!ticket) {
    throw new Error("Support ticket could not be saved.");
  }

  const mailtoUrl = buildSupportMailtoUrl(ticket);
  return {
    message: "Your ticket was saved for review. A prefilled email draft can also be opened on devices that support mailto links.",
    supportEmail: getSupportEmail(context.env),
    mailtoUrl,
    ticket,
  };
}

export function parseBillingCheckoutPayload(value: unknown): { ok: true; data: BillingCheckoutPayload } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const fullName = readString(value.fullName);
  const organizationName = readString(value.organizationName);
  const email = readString(value.email).toLowerCase();
  const requestedPlan = readString(value.requestedPlan) as NetworkBillingPlanKey;
  const seatCount = Number(value.seatCount);

  if (!fullName || !organizationName || !email || !requestedPlan || !Number.isFinite(seatCount)) {
    return { ok: false, message: "Full name, organization name, email, plan, and seat count are required." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (!findBillingPlan(requestedPlan)) {
    return { ok: false, message: "Choose a valid plan." };
  }
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    return { ok: false, message: "Seat count must be a positive whole number." };
  }

  return {
    ok: true,
    data: { fullName, organizationName, email, requestedPlan, seatCount },
  };
}

export async function createPublicStripeCheckout(
  env: Env,
  request: Request,
  payload: BillingCheckoutPayload,
  session?: { user: { id: string }; organization: { id: string } } | null
): Promise<BillingCheckoutResponse> {
  const plan = findBillingPlan(payload.requestedPlan);
  if (!plan) {
    throw new Error("Choose a valid billing plan.");
  }
  void env;
  void request;
  void session;
  throw new Error(`Direct self-serve checkout is not enabled for ${plan.label}. Contact the administrator for pricing and activation.`);
}

export function parseAlternativePaymentRequestPayload(
  value: unknown,
  env: Env
): { ok: true; data: AlternativePaymentRequestPayload } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const fullName = readString(value.fullName);
  const organizationName = readString(value.organizationName);
  const email = readString(value.email).toLowerCase();
  const requestedPlan = readString(value.requestedPlan) as NetworkBillingPlanKey;
  const seatCount = Number(value.seatCount);
  const preferredPaymentMethod = readString(value.preferredPaymentMethod) as AlternativePaymentMethod;
  const country = readString(value.country);
  const region = readOptionalString(value.region);
  const poNumber = readOptionalString(value.poNumber);
  const notes = readOptionalString(value.notes);

  if (!fullName || !organizationName || !email || !requestedPlan || !country || !Number.isFinite(seatCount) || !preferredPaymentMethod) {
    return { ok: false, message: "Complete all required alternative payment fields before sending the request." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (!findBillingPlan(requestedPlan)) {
    return { ok: false, message: "Choose a valid plan." };
  }
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    return { ok: false, message: "Seat count must be a positive whole number." };
  }
  if (!getAllowedAlternativePaymentMethods(env).includes(preferredPaymentMethod)) {
    return { ok: false, message: "Choose one of the allowed alternative payment methods." };
  }

  return {
    ok: true,
    data: {
      fullName,
      organizationName,
      email,
      requestedPlan,
      seatCount,
      preferredPaymentMethod,
      country,
      ...(region ? { region } : {}),
      ...(poNumber ? { poNumber } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export async function submitAlternativePaymentRequest(
  context: AppContext,
  payload: AlternativePaymentRequestPayload,
  session?: { user: { id: string }; organization: { id: string } } | null
): Promise<{ request: AlternativePaymentRequestRecord; message: string }> {
  if (!isAlternativePaymentsEnabled(context.env)) {
    throw new Error("Alternative payment requests are not enabled in this deployment.");
  }

  const plan = findBillingPlan(payload.requestedPlan);
  if (!plan) {
    throw new Error("Choose a valid plan.");
  }

  const record: AlternativePaymentRequestRecord = {
    id: createId("manual"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fullName: payload.fullName,
    organizationName: payload.organizationName,
    email: payload.email,
    requestedPlan: payload.requestedPlan,
    planName: plan.label,
    seatCount: payload.seatCount,
    preferredPaymentMethod: payload.preferredPaymentMethod,
    country: payload.country,
    requestStatus: "submitted",
    ...(payload.region ? { region: payload.region } : {}),
    ...(payload.poNumber ? { poNumber: payload.poNumber } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
    ...(session?.user?.id ? { userId: session.user.id } : {}),
    ...(session?.organization?.id ? { organizationId: session.organization.id } : {}),
  };

  const requestRecord = await createAlternativePaymentRequest(context.env.DB, record);
  if (!requestRecord) {
    throw new Error("Alternative payment request could not be saved.");
  }

  await createBillingEvent(context.env.DB, {
    id: `billing_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    source: "manual",
    eventType: "manual_payment.request_submitted",
    status: "submitted",
    organizationName: payload.organizationName,
    contactEmail: payload.email,
    planId: payload.requestedPlan,
    planName: plan.label,
    metadataJson: {
      paymentMethod: payload.preferredPaymentMethod,
      seatCount: payload.seatCount,
    },
    ...(session?.user?.id ? { userId: session.user.id } : {}),
    ...(session?.organization?.id ? { organizationId: session.organization.id } : {}),
  });

  return {
    request: requestRecord,
    message: "Your alternative payment request has been submitted. We will review it and activate access once payment is received and confirmed.",
  };
}

export async function listAdminSupportTickets(env: Env) {
  return listSupportTicketsForAdmin(env.DB);
}

export async function listAdminAlternativePaymentRequests(env: Env, status?: string) {
  return listAlternativePaymentRequestsForAdmin(env.DB, status);
}

export async function updateAdminAlternativePaymentRequest(
  env: Env,
  id: string,
  patch: Partial<AlternativePaymentRequestRecord>
) {
  return updateAlternativePaymentRequestById(env.DB, id, patch);
}

export async function listAdminBillingEvents(env: Env) {
  return listBillingEventsForAdmin(env.DB);
}

export async function handleStripeWebhook(context: AppContext): Promise<Response> {
  if (!context.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    logSecurityEvent(context.request, "stripe_webhook_rejected", {
      outcome: "blocked",
      reason: "webhook_not_configured",
    });
    return errorJson(503, "stripe_not_configured", "Stripe webhook handling is not configured for this deployment.");
  }

  const signature = context.request.headers.get("Stripe-Signature");
  if (!signature) {
    logSecurityEvent(context.request, "stripe_webhook_rejected", {
      outcome: "blocked",
      reason: "missing_signature",
    });
    return errorJson(400, "missing_signature", "Webhook request could not be verified.");
  }

  const payload = await context.request.text();
  const valid = await verifyStripeWebhookSignature(payload, signature, context.env.STRIPE_WEBHOOK_SECRET.trim());
  if (!valid) {
    logSecurityEvent(context.request, "stripe_webhook_rejected", {
      outcome: "blocked",
      reason: "invalid_signature",
    });
    return errorJson(400, "invalid_signature", "Webhook request could not be verified.");
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    logSecurityEvent(context.request, "stripe_webhook_rejected", {
      outcome: "blocked",
      reason: "invalid_json",
    });
    return errorJson(400, "invalid_json", "Stripe webhook payload must be valid JSON.");
  }

  const eventType = readString(event.type) || "unknown";
  const eventId = readString(event.id) || `stripe_${crypto.randomUUID()}`;
  const createdAt = toIsoFromUnix(Number(event.created)) || new Date().toISOString();
  const object = isRecord((event as { data?: { object?: unknown } }).data?.object) ? (event as { data?: { object?: Record<string, unknown> } }).data?.object ?? {} : {};
  const metadata = isRecord(object.metadata) ? object.metadata : {};

  try {
    await createBillingEvent(context.env.DB, {
      id: createId("billing"),
      createdAt,
      source: "stripe",
      eventType,
      status: mapStripeEventStatus(eventType, object),
      stripeEventId: eventId,
      stripeCheckoutSessionId: readString(object.id) || readString(object.checkout_session) || undefined,
      stripeCustomerId: readString(object.customer) || undefined,
      stripeSubscriptionId: readString(object.subscription) || undefined,
      organizationName: readString(metadata.organizationName) || undefined,
      contactEmail: readString(metadata.email) || undefined,
      planId: readString(metadata.planKey) || undefined,
      planName: readString(metadata.planLabel) || undefined,
      amountMinor: readOptionalNumber(object.amount_total) ?? readOptionalNumber(object.amount_paid) ?? undefined,
      currency: readString(object.currency) || undefined,
      metadataJson: object,
    });
  } catch (error) {
    logOperationalError(context.request, "stripe_webhook_persist_failed", error, {
      outcome: "failed",
      eventType,
    });
    return errorJson(500, "request_failed", "Webhook event could not be processed.");
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildSupportMailtoUrl(ticket: SupportTicketRecord): string {
  const subject = `[Network Manager Support] ${ticket.summary}`;
  const body = [
    `Support ticket ID: ${ticket.id}`,
    `From: ${ticket.fullName} <${ticket.email}>`,
    ticket.organizationName ? `Organization: ${ticket.organizationName}` : "",
    `Created: ${ticket.createdAt}`,
    ticket.currentPath ? `Page: ${ticket.currentPath}` : "",
    ticket.activeTab ? `Tab: ${ticket.activeTab}` : "",
    "",
    "Summary:",
    ticket.summary,
    "",
    "Details:",
    ticket.details,
    ticket.stepsToReproduce ? `\nSteps to reproduce:\n${ticket.stepsToReproduce}` : "",
    ticket.expectedOutcome ? `\nExpected outcome:\n${ticket.expectedOutcome}` : "",
    ticket.actualOutcome ? `\nActual outcome:\n${ticket.actualOutcome}` : "",
    ticket.screenshotName ? `\nScreenshot saved in app ticket: ${ticket.screenshotName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:${encodeURIComponent(ticket.targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function stripeFormRequest<T>(env: Env, path: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(`${stripeApiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as T & { error?: { message?: string } } | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || `Stripe request failed with status ${response.status}`);
  }
  return payload;
}

async function verifyStripeWebhookSignature(payload: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > webhookToleranceSeconds) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = toHex(new Uint8Array(signed));

  return signatures.some((signature) => secureEqual(signature, expected));
}

function resolveSuccessUrl(env: Env, request: Request): string {
  return resolveAbsoluteUrl(env.STRIPE_SUCCESS_URL, env, request, "billing=success");
}

function resolveCancelUrl(env: Env, request: Request): string {
  return resolveAbsoluteUrl(env.STRIPE_CANCEL_URL, env, request, "billing=cancelled");
}

function resolveAbsoluteUrl(explicitValue: string | undefined, env: Env, request: Request, query: string): string {
  const configured = String(explicitValue || "").trim();
  if (configured) {
    return configured;
  }

  let base = String(env.APP_BASE_URL || "").trim().replace(/\/+$/g, "") || new URL(request.url).origin.replace(/\/+$/g, "");
  const tenantResult = resolveTenantFromRequest(request, env);
  if (tenantResult.ok) {
    base = resolveTenantPublicBaseUrl(
      tenantResult.resolution.tenant,
      env,
      request,
      resolveTenantCatalog(env),
    ).replace(/\/+$/g, "");
  }
  return `${base}/?${query}`;
}

function mapStripeEventStatus(eventType: string, object: Record<string, unknown>): string {
  if (eventType === "invoice.paid") return "paid";
  if (eventType === "invoice.payment_failed") return "failed";
  if (eventType === "checkout.session.completed") return readString(object.payment_status) || "completed";
  if (eventType.startsWith("customer.subscription.")) return readString(object.status) || "info";
  return "info";
}

function toIsoFromUnix(value: number | null | undefined): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return new Date(Number(value) * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | undefined {
  const result = readString(value);
  return result || undefined;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAlternativePaymentMethod(value: string): value is AlternativePaymentMethod {
  return value === "wise" || value === "e_transfer" || value === "cheque" || value === "eft";
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
