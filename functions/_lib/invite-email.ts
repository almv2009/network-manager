import type { InvitationRecord, OrganizationRecord } from "../../shared/types";
import { getConfig } from "./config";
import { escapeHtml, isTransactionalEmailConfigured, sendTransactionalEmail } from "./mail";
import type { Env, InviteDeliveryResult } from "./types";

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
      await sendTransactionalEmail(env, {
        to: input.invitation.email,
        from: config.inviteEmailSender,
        replyTo: config.mailReplyToAddress,
        subject: `You have been invited to ${config.brandingName}`,
        text: [
          `Hello,`,
          "",
          `${input.invitedByName} has invited you to join ${input.organization.name} in ${config.brandingName}.`,
          "",
          `Use this secure invite link to sign in and access the workspace:`,
          input.inviteUrl,
          "",
          `Role: ${input.invitation.userType.replaceAll("_", " ")}`,
          input.invitation.caseRole ? `Case access: ${input.invitation.caseRole.replaceAll("_", " ")}` : "",
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
          "<p>If you were not expecting this invitation, you can ignore this email.</p>",
        ]
          .filter(Boolean)
          .join(""),
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
      if (!config.inviteEmailWebhookUrl) {
        return {
          status: "failed",
          channel: "resend",
          detail: error instanceof Error ? error.message : "Resend invitation delivery failed.",
        };
      }
    }
  }

  if (!config.inviteEmailWebhookUrl) {
    return {
      status: "manual",
      channel: "manual",
      detail: "No invite email webhook is configured. Share the invite URL through organization-owned messaging.",
    };
  }

  const response = await fetch(config.inviteEmailWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.inviteEmailWebhookBearerToken
        ? { authorization: `Bearer ${config.inviteEmailWebhookBearerToken}` }
        : {}),
    },
    body: JSON.stringify({
      type: "network_manager_invitation",
      organization: {
        id: input.organization.id,
        name: input.organization.name,
      },
      invitation: {
        id: input.invitation.id,
        email: input.invitation.email,
        userType: input.invitation.userType,
        caseId: input.invitation.caseId,
        caseRole: input.invitation.caseRole,
        inviteUrl: input.inviteUrl,
        invitedAt: input.invitation.invitedAt,
      },
      sender: {
        name: input.invitedByName,
        email: config.inviteEmailSender,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      status: "failed",
      channel: "webhook",
      detail: detail || `Invite email webhook failed with ${response.status}.`,
    };
  }

  return {
    status: "sent",
    channel: "webhook",
    detail: "Invitation email dispatched through the configured organization-owned webhook.",
  };
}
