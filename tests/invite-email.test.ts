import { afterEach, describe, expect, it, vi } from "vitest";

import { deliverInvitationEmail } from "../functions/_lib/invite-email";
import type { Env } from "../functions/_lib/types";
import type { InvitationRecord, OrganizationRecord } from "../shared/types";

const originalFetch = globalThis.fetch;

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env["DB"],
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-secret",
    SESSION_COOKIE_NAME: "nm_session",
    SESSION_TTL_HOURS: "12",
    OIDC_ISSUER_URL: "https://login.example.org",
    OIDC_CLIENT_ID: "client-id",
    OIDC_CLIENT_SECRET: "client-secret",
    OIDC_SCOPES: "openid profile email",
    OIDC_PROVIDER_NAME: "Test OIDC",
    INVITE_EMAIL_SENDER: "Safeguarding Together <noreply@ataconsultancy.network>",
    MAIL_REPLY_TO_ADDRESS: "admin@ataconsultancy.net",
    ...overrides,
  };
}

function invitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "invite_1",
    organizationId: "org_1",
    caseId: "case_1",
    email: "invitee@example.org",
    userType: "caregiver",
    caseRole: "caregiver",
    active: true,
    inviteToken: "token_1",
    invitedBy: "user_1",
    invitedAt: "2026-04-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const organization: OrganizationRecord = {
  id: "org_1",
  name: "Test Org",
  status: "active",
  settingsJson: {},
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("invite delivery", () => {
  it("returns manual delivery when webhook and resend are not configured", async () => {
    const result = await deliverInvitationEmail(env(), {
      invitation: invitation(),
      inviteUrl: "https://network-manager.example.org/sign-in?invite=token_1",
      organization,
      invitedByName: "Admin User",
    });
    expect(result).toEqual({
      status: "manual",
      channel: "manual",
      detail: "No invite email webhook is configured. Share the invite URL through organization-owned messaging.",
    });
  });

  it("reports sent delivery when resend succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200, headers: { "content-type": "application/json" } }),
    ) as typeof fetch;

    const result = await deliverInvitationEmail(
      env({
        RESEND_API_KEY: "re_test_123",
        MAIL_FROM_ADDRESS: "noreply@ataconsultancy.network",
      }),
      {
        invitation: invitation(),
        inviteUrl: "https://network-manager.example.org/sign-in?invite=token_1",
        organization,
        invitedByName: "Admin User",
      },
    );

    expect(result.status).toBe("sent");
    expect(result.channel).toBe("resend");
  });

  it("falls back to webhook when resend fails and webhook is configured", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "provider down" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 } as ResponseInit)) as typeof fetch;

    const result = await deliverInvitationEmail(
      env({
        RESEND_API_KEY: "re_test_123",
        MAIL_FROM_ADDRESS: "noreply@ataconsultancy.network",
        INVITE_EMAIL_WEBHOOK_URL: "https://hooks.example.org/invite",
      }),
      {
        invitation: invitation(),
        inviteUrl: "https://network-manager.example.org/sign-in?invite=token_1",
        organization,
        invitedByName: "Admin User",
      },
    );

    expect(result.status).toBe("sent");
    expect(result.channel).toBe("webhook");
  });

  it("reports failed delivery when webhook returns an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("provider failed", { status: 500 })) as typeof fetch;

    const result = await deliverInvitationEmail(env({ INVITE_EMAIL_WEBHOOK_URL: "https://hooks.example.org/invite" }), {
      invitation: invitation(),
      inviteUrl: "https://network-manager.example.org/sign-in?invite=token_1",
      organization,
      invitedByName: "Admin User",
    });

    expect(result.status).toBe("failed");
    expect(result.channel).toBe("webhook");
    expect(result.detail).toContain("provider failed");
  });
});
