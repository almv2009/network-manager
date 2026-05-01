import { Resend } from "resend";

import type { Env } from "./types";

const defaultResendFromAddress = "noreply@ataconsultancy.network";

export type TransactionalEmailPayload = {
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  metadata?: Record<string, string>;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function mapMetadataToTags(metadata: Record<string, string> | undefined) {
  if (!metadata) return [];
  return Object.entries(metadata)
    .map(([name, value]) => ({ name: normalizeText(name), value: normalizeText(value) }))
    .filter((entry) => entry.name && entry.value);
}

function resolveMailFromAddress(env: Env, explicitFrom?: string) {
  return (
    normalizeText(explicitFrom) ||
    normalizeText(env.MAIL_FROM_ADDRESS) ||
    normalizeText(env.RESEND_FROM_EMAIL) ||
    defaultResendFromAddress
  );
}

function resolveMailReplyToAddress(env: Env, explicitReplyTo?: string) {
  return (
    normalizeText(explicitReplyTo) ||
    normalizeText(env.MAIL_REPLY_TO_ADDRESS) ||
    normalizeText(env.RESEND_REPLY_TO) ||
    undefined
  );
}

export function isTransactionalEmailConfigured(env: Env) {
  return Boolean(normalizeText(env.RESEND_API_KEY) && resolveMailFromAddress(env));
}

export async function sendTransactionalEmail(env: Env, payload: TransactionalEmailPayload) {
  const apiKey = normalizeText(env.RESEND_API_KEY);
  const fromAddress = resolveMailFromAddress(env, payload.from);
  const toAddress = normalizeText(payload.to);
  const replyToAddress = resolveMailReplyToAddress(env, payload.replyTo);
  const textBody = normalizeText(payload.text) || undefined;
  const htmlBody = normalizeText(payload.html) || undefined;

  if (!apiKey || !fromAddress) {
    throw new Error("Resend mail delivery is not configured for this deployment.");
  }
  if (!toAddress) {
    throw new Error("Transactional email recipient is required.");
  }
  if (!textBody && !htmlBody) {
    throw new Error("Transactional email requires text or html content.");
  }

  const resend = new Resend(apiKey);
  const composedTags = [
    ...(Array.isArray(payload.tags) ? payload.tags : []),
    ...mapMetadataToTags(payload.metadata),
  ].filter((entry) => normalizeText(entry.name) && normalizeText(entry.value));

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [toAddress],
    subject: payload.subject,
    text: textBody,
    html: htmlBody,
    replyTo: replyToAddress,
    headers: payload.headers,
    tags: composedTags.length ? composedTags : undefined,
  });

  if (error) {
    const errorMessage = normalizeText(error.message) || "unknown provider error";
    throw new Error(`Resend email send failed: ${errorMessage}`);
  }
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
