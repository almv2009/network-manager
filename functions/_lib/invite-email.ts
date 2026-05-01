import type { InvitationRecord, OrganizationRecord } from "../../shared/types";
import { getConfig } from "./config";
import { escapeHtml, isTransactionalEmailConfigured, sendTransactionalEmail } from "./mail";
import type { Env, InviteDeliveryResult } from "./types";

function normalizeDomain(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? new URL(trimmed).hostname.toLowerCase()
    : trimmed;
}

function compactErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown provider error";
  return String(message || "unknown provider error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export async function deliverInvitationEmail(
  env: Env,
  input: {
    invitation: InvitationRecord;
    inviteUrl: string;
    organization: OrganizationRecord;
    invitedByName: string;
  },
): Promise<InviteDeliveryResult> {
  const config = getConfig(env);
  if (isTransactionalEmailConfigured(env)) {
    try {
      const senderDomain = normalizeDomain(config.inviteEmailSender.match(/@([^>\s]+)/)?.[1] || config.mailFromAddress);
      const inviteDomain = normalizeDomain(input.inviteUrl);
      await sendTransactionalEmail(env, {
        to: input.invitation.email,
        from: config.inviteEmailSender,
        replyTo: config.mailReplyToAddress,
        subject: `${input.organization.name}: your secure invitation`,
        text: [
          `Hello,`,
          "",
          `${input.invitedByName} has invited you to join ${input.organization.name} in ${config.brandingName}.`,
          "",
          `Open your secure invitation link to access the workspace:`,
          input.inviteUrl,
          "",
          `Role: ${input.invitation.userType.replaceAll("_", " ")}`,
          input.invitation.caseRole ? `Case access: ${input.invitation.caseRole.replaceAll("_", " ")}` : "",
          "",
          `Expected sender domain: ${senderDomain || "not set"}`,
          `Expected invite-link domain: ${inviteDomain || "not set"}`,
          "",
          `Need help? Reply to ${config.mailReplyToAddress}.`,
          "",
          "If you were not expecting this invitation, you can ignore this email.",
        ]
          .filter(Boolean)
          .join("\n"),
        html: [
          "<p>Hello,</p>",
          `<p><strong>${escapeHtml(input.invitedByName)}</strong> has invited you to join <strong>${escapeHtml(input.organization.name)}</strong> in <strong>${escapeHtml(config.brandingName)}</strong>.</p>`,
          `<p><a href="${escapeHtml(input.inviteUrl)}">Open your secure invitation</a></p>`,
          `<p><strong>Role:</strong> ${escapeHtml(input.invitation.userType.replaceAll("_", " "))}</p>`,
          input.invitation.caseRole
            ? `<p><strong>Case access:</strong> ${escapeHtml(input.invitation.caseRole.replaceAll("_", " "))}</p>`
            : "",
          `<p><strong>Expected sender domain:</strong> ${escapeHtml(senderDomain || "not set")}</p>`,
          `<p><strong>Expected invite-link domain:</strong> ${escapeHtml(inviteDomain || "not set")}</p>`,
          `<p>If you need support, reply to ${escapeHtml(config.mailReplyToAddress)}.</p>`,
          "<p>If you were not expecting this invitation, you can ignore this email.</p>",
        ]
          .filter(Boolean)
          .join(""),
        headers: {
          "Auto-Submitted": "auto-generated",
          "X-Auto-Response-Suppress": "All",
        },
        tags: [
          { name: "app", value: "network_manager" },
          { name: "message_type", value: "organization_invitation" },
        ],
        metadata: {
          invitation_id: input.invitation.id,
          organization_id: input.organization.id,
        },
      });

      return {
        status: "sent",
        channel: "resend",
        detail: "Invitation email dispatched through Resend.",
      };
    } catch (error) {
      const providerMessage = compactErrorMessage(error);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          category: "security",
          event: "invite_delivery_failed",
          invitationId: input.invitation.id,
          organizationId: input.organization.id,
          provider: "resend",
          errorName: error instanceof Error ? error.name : "unknown_error",
          errorMessage: error instanceof Error ? error.message : "unknown_error",
        }),
      );
      return {
        status: "failed",
        channel: "resend",
        detail: `Invitation email could not be delivered: ${providerMessage}. Verify Resend configuration and sender-domain setup.`,
      };
    }
  }

  return {
    status: "manual",
    channel: "manual",
    detail: "Resend invite delivery is not configured. Share the invite URL through organization-owned messaging.",
  };
}
