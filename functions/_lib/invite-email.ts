import type { InvitationRecord, OrganizationRecord } from "../../shared/types";
import { getConfig } from "./config";
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
