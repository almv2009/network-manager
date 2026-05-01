import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser, InvitationRecord, OrganizationRecord } from "../shared/types";
import type { AppContext, Env } from "../functions/_lib/types";

const auditMocks = vi.hoisted(() => ({
  audit: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  countActiveOrganizationUsersByType: vi.fn(),
  createOrganization: vi.fn(),
  findOrganizationByName: vi.fn(),
  findActiveInvitationByEmailOrToken: vi.fn(),
  markInvitationAccepted: vi.fn(),
  findOrganizationUserByEmail: vi.fn(),
  createInvitedUser: vi.fn(),
  ensureCaseMembership: vi.fn(),
  getOrganizationById: vi.fn(),
  getLocalCredentialByUserId: vi.fn(),
  upsertLocalCredential: vi.fn(),
  findProvisionedUserForIdentity: vi.fn(),
  bindExternalIdentity: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  currentSessionToken: vi.fn(),
  resolveSession: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

const oidcMocks = vi.hoisted(() => ({
  beginOidcSignIn: vi.fn(),
  consumeOidcCallback: vi.fn(),
}));

const localAuthMocks = vi.hoisted(() => ({
  createLocalPasswordCredential: vi.fn(),
  validateLocalPassword: vi.fn(),
  verifyLocalPasswordCredential: vi.fn(),
}));

vi.mock("../functions/_lib/audit", () => ({
  audit: auditMocks.audit,
}));

vi.mock("../functions/_lib/db", async () => {
  const actual = await vi.importActual<typeof import("../functions/_lib/db")>("../functions/_lib/db");
  return {
    ...actual,
    countActiveOrganizationUsersByType: dbMocks.countActiveOrganizationUsersByType,
    createOrganization: dbMocks.createOrganization,
    findOrganizationByName: dbMocks.findOrganizationByName,
    findActiveInvitationByEmailOrToken: dbMocks.findActiveInvitationByEmailOrToken,
    markInvitationAccepted: dbMocks.markInvitationAccepted,
    findOrganizationUserByEmail: dbMocks.findOrganizationUserByEmail,
    createInvitedUser: dbMocks.createInvitedUser,
    ensureCaseMembership: dbMocks.ensureCaseMembership,
    getOrganizationById: dbMocks.getOrganizationById,
    getLocalCredentialByUserId: dbMocks.getLocalCredentialByUserId,
    upsertLocalCredential: dbMocks.upsertLocalCredential,
    findProvisionedUserForIdentity: dbMocks.findProvisionedUserForIdentity,
    bindExternalIdentity: dbMocks.bindExternalIdentity,
  };
});

vi.mock("../functions/_lib/session", () => ({
  createSession: sessionMocks.createSession,
  deleteSession: sessionMocks.deleteSession,
  currentSessionToken: sessionMocks.currentSessionToken,
  resolveSession: sessionMocks.resolveSession,
  clearSessionCookie: sessionMocks.clearSessionCookie,
}));

vi.mock("../functions/_lib/oidc", () => ({
  beginOidcSignIn: oidcMocks.beginOidcSignIn,
  consumeOidcCallback: oidcMocks.consumeOidcCallback,
}));

vi.mock("../functions/_lib/local-auth", () => ({
  createLocalPasswordCredential: localAuthMocks.createLocalPasswordCredential,
  validateLocalPassword: localAuthMocks.validateLocalPassword,
  verifyLocalPasswordCredential: localAuthMocks.verifyLocalPasswordCredential,
}));

const { onRequest } = await import("../functions/auth/[[path]].ts");

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env["DB"],
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-secret",
    OIDC_ISSUER_URL: "",
    OIDC_CLIENT_ID: "",
    OIDC_CLIENT_SECRET: "",
    ...overrides,
  };
}

function makeContext(request: Request, env: Env): AppContext {
  return {
    request,
    env,
    params: {},
    data: {},
    next: vi.fn(async () => new Response("next")),
    waitUntil: vi.fn(),
  };
}

function makeInvitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "invite_1",
    organizationId: "org_1",
    caseId: "case_1",
    email: "invitee@example.org",
    userType: "worker",
    caseRole: "worker",
    active: true,
    inviteToken: "token_1",
    invitedBy: "user_admin",
    invitedAt: "2026-04-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_1",
    organizationId: "org_1",
    externalIdentityId: null,
    email: "invitee@example.org",
    displayName: "Invitee Example",
    userType: "worker",
    active: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeOrganization(overrides: Partial<OrganizationRecord> = {}): OrganizationRecord {
  return {
    id: "org_1",
    name: "Test Organization",
    status: "active",
    settingsJson: {},
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auditMocks.audit.mockResolvedValue(undefined);
  dbMocks.countActiveOrganizationUsersByType.mockResolvedValue(0);
  dbMocks.createOrganization.mockResolvedValue(makeOrganization());
  dbMocks.findOrganizationByName.mockResolvedValue(null);
  dbMocks.findActiveInvitationByEmailOrToken.mockResolvedValue(makeInvitation());
  dbMocks.markInvitationAccepted.mockResolvedValue(makeInvitation({ acceptedAt: "2026-04-01T00:05:00.000Z" }));
  dbMocks.findOrganizationUserByEmail.mockResolvedValue(null);
  dbMocks.createInvitedUser.mockResolvedValue(makeUser());
  dbMocks.ensureCaseMembership.mockResolvedValue({ ok: true });
  dbMocks.getOrganizationById.mockResolvedValue(makeOrganization());
  dbMocks.getLocalCredentialByUserId.mockResolvedValue(null);
  dbMocks.upsertLocalCredential.mockResolvedValue({ ok: true });
  dbMocks.findProvisionedUserForIdentity.mockResolvedValue(null);
  dbMocks.bindExternalIdentity.mockResolvedValue(makeUser());

  sessionMocks.createSession.mockResolvedValue({
    token: "raw_token",
    expiresAt: "2026-04-02T00:00:00.000Z",
    cookie: "nm_session=raw_token; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=43200",
  });
  sessionMocks.deleteSession.mockResolvedValue(undefined);
  sessionMocks.currentSessionToken.mockReturnValue("raw_token");
  sessionMocks.resolveSession.mockResolvedValue(null);
  sessionMocks.clearSessionCookie.mockReturnValue("nm_session=; Path=/; Max-Age=0");

  oidcMocks.beginOidcSignIn.mockResolvedValue({
    authUrl: "https://login.example.org/authorize",
    setCookie: "nm_auth_flow=state; Path=/; HttpOnly; Secure",
  });
  oidcMocks.consumeOidcCallback.mockResolvedValue({ ok: false, clearCookie: "nm_auth_flow=; Path=/", error: "invalid_auth_state" });

  localAuthMocks.validateLocalPassword.mockReturnValue("");
  localAuthMocks.createLocalPasswordCredential.mockResolvedValue({
    passwordHash: "hash",
    passwordSalt: "salt",
    passwordIterations: 210000,
  });
  localAuthMocks.verifyLocalPasswordCredential.mockResolvedValue(true);
});

describe("auth routes", () => {
  it("redirects sign-in to the local invite landing page when OIDC is not configured", async () => {
    const request = new Request("https://network-manager.example.org/auth/sign-in?invite=token_1&returnTo=/app");
    const response = await onRequest(makeContext(request, makeEnv()));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?auth=local&returnTo=%2Fapp&invite=token_1");
    expect(oidcMocks.beginOidcSignIn).not.toHaveBeenCalled();
  });

  it("accepts a local invite, sets a password, and creates a session", async () => {
    const request = new Request("https://network-manager.example.org/auth/local-invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inviteToken: "token_1",
        displayName: "Case Worker",
        password: "Password1234",
        returnTo: "/app",
      }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { ok: boolean; redirectTo: string };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.redirectTo).toBe("/app");
    expect(response.headers.get("set-cookie")).toContain("nm_session=raw_token");
    expect(dbMocks.markInvitationAccepted).toHaveBeenCalledWith(expect.anything(), "invite_1");
    expect(dbMocks.upsertLocalCredential).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        passwordHash: "hash",
      }),
    );
  });

  it("signs in with local workspace credentials", async () => {
    dbMocks.findOrganizationByName.mockResolvedValue(makeOrganization({ name: "Acme Service" }));
    dbMocks.findOrganizationUserByEmail.mockResolvedValue(
      makeUser({ id: "user_admin", userType: "org_admin", email: "owner@example.org" }),
    );
    dbMocks.getLocalCredentialByUserId.mockResolvedValue({
      user_id: "user_admin",
      password_hash: "hash",
      password_salt: "salt",
      password_iterations: 210000,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    });

    const request = new Request("https://network-manager.example.org/auth/local-sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationName: "Acme Service",
        email: "owner@example.org",
        password: "Password1234",
        returnTo: "/admin",
      }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { ok: boolean; redirectTo: string };

    expect(response.status).toBe(200);
    expect(payload.redirectTo).toBe("/admin");
    expect(localAuthMocks.verifyLocalPasswordCredential).toHaveBeenCalled();
  });

  it("returns a generic failure when the workspace name does not exist", async () => {
    dbMocks.findOrganizationByName.mockResolvedValue(null);

    const request = new Request("https://network-manager.example.org/auth/local-sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationName: "Missing Workspace",
        email: "owner@example.org",
        password: "Password1234",
      }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { error: string; hint: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("auth_required");
    expect(payload.hint).toBe("The workspace name, email, or password did not match.");
  });

  it("returns the same generic failure for an invalid password", async () => {
    dbMocks.findOrganizationByName.mockResolvedValue(makeOrganization({ name: "Acme Service" }));
    dbMocks.findOrganizationUserByEmail.mockResolvedValue(
      makeUser({ id: "user_admin", userType: "org_admin", email: "owner@example.org" }),
    );
    dbMocks.getLocalCredentialByUserId.mockResolvedValue({
      user_id: "user_admin",
      password_hash: "hash",
      password_salt: "salt",
      password_iterations: 210000,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    });
    localAuthMocks.verifyLocalPasswordCredential.mockResolvedValue(false);

    const request = new Request("https://network-manager.example.org/auth/local-sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationName: "Acme Service",
        email: "owner@example.org",
        password: "WrongPassword",
      }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { error: string; hint: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("auth_required");
    expect(payload.hint).toBe("The workspace name, email, or password did not match.");
  });

  it("bootstraps the first organization account and sends the new org admin to billing onboarding", async () => {
    dbMocks.createInvitedUser.mockResolvedValue(
      makeUser({
        id: "user_owner",
        organizationId: "org_new",
        email: "owner@example.org",
        displayName: "Owner Name",
        userType: "org_admin",
      }),
    );
    dbMocks.createOrganization.mockResolvedValue(
      makeOrganization({
        id: "org_new",
        name: "Acme Service",
      }),
    );

    const request = new Request("https://network-manager.example.org/auth/bootstrap-admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationName: "Acme Service",
        displayName: "Owner Name",
        email: "owner@example.org",
        password: "Password1234",
      }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { ok: boolean; redirectTo: string };

    expect(response.status).toBe(200);
    expect(payload.redirectTo).toBe("/admin?openBilling=1&setup=account");
    expect(dbMocks.createOrganization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Acme Service",
      }),
    );
    expect(dbMocks.createInvitedUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org_new",
        userType: "org_admin",
      }),
    );
  });

  it("returns auth_required from the session route when local auth is configured but no session exists", async () => {
    const request = new Request("https://network-manager.example.org/auth/session");
    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("auth_required");
  });
});
