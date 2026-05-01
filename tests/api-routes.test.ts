import { beforeEach, describe, expect, it, vi } from "vitest";

import { cloneDefaultCaseState } from "../shared/default-case-state";
import type {
  AlternativePaymentRequestRecord,
  AppUser,
  BillingEventRecord,
  CaseMembershipRecord,
  CaseSummary,
  DocumentItem,
  InvitationRecord,
  OrganizationRecord,
  SessionPayload,
  SupportTicketRecord,
} from "../shared/types";
import type { AppContext, Env } from "../functions/_lib/types";

const sessionMocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  audit: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  countActiveOrganizationUsersByType: vi.fn(),
  createCaseRecord: vi.fn(),
  getAccessibleCases: vi.fn(),
  getAlternativePaymentRequestById: vi.fn(),
  getCaseRow: vi.fn(),
  getMembershipRow: vi.fn(),
  getOrganizationById: vi.fn(),
  getOrganizationLicenseSummary: vi.fn(),
  getUserById: vi.fn(),
  listInvitations: vi.fn(),
  listAllUsersForOwner: vi.fn(),
  listAuditEventsForOwner: vi.fn(),
  listOrganizationsForOwner: vi.fn(),
  listOrganizationUsers: vi.fn(),
  mapCaseSummary: vi.fn(),
  mapCaseState: vi.fn(),
  getCaseDocument: vi.fn(),
  ensureCaseMembership: vi.fn(),
  softDeleteUserAccount: vi.fn(),
  updateOrganizationSettings: vi.fn(),
  updateOrganizationStatus: vi.fn(),
  updateMembership: vi.fn(),
  updateUserActiveState: vi.fn(),
}));

const commercialMocks = vi.hoisted(() => ({
  listAdminAlternativePaymentRequests: vi.fn(),
  listAdminBillingEvents: vi.fn(),
  listAdminSupportTickets: vi.fn(),
  updateAdminAlternativePaymentRequest: vi.fn(),
}));

vi.mock("../functions/_lib/session", () => ({
  resolveSession: sessionMocks.resolveSession,
}));

vi.mock("../functions/_lib/audit", () => ({
  audit: auditMocks.audit,
}));

vi.mock("../functions/_lib/db", async () => {
  const actual = await vi.importActual<typeof import("../functions/_lib/db")>("../functions/_lib/db");
  return {
    ...actual,
    countActiveOrganizationUsersByType: dbMocks.countActiveOrganizationUsersByType,
    createCaseRecord: dbMocks.createCaseRecord,
    getAccessibleCases: dbMocks.getAccessibleCases,
    getAlternativePaymentRequestById: dbMocks.getAlternativePaymentRequestById,
    getCaseRow: dbMocks.getCaseRow,
    getMembershipRow: dbMocks.getMembershipRow,
    getOrganizationById: dbMocks.getOrganizationById,
    getOrganizationLicenseSummary: dbMocks.getOrganizationLicenseSummary,
    getUserById: dbMocks.getUserById,
    listInvitations: dbMocks.listInvitations,
    listAllUsersForOwner: dbMocks.listAllUsersForOwner,
    listAuditEventsForOwner: dbMocks.listAuditEventsForOwner,
    listOrganizationsForOwner: dbMocks.listOrganizationsForOwner,
    listOrganizationUsers: dbMocks.listOrganizationUsers,
    mapCaseSummary: dbMocks.mapCaseSummary,
    mapCaseState: dbMocks.mapCaseState,
    getCaseDocument: dbMocks.getCaseDocument,
    ensureCaseMembership: dbMocks.ensureCaseMembership,
    softDeleteUserAccount: dbMocks.softDeleteUserAccount,
    updateOrganizationSettings: dbMocks.updateOrganizationSettings,
    updateOrganizationStatus: dbMocks.updateOrganizationStatus,
    updateMembership: dbMocks.updateMembership,
    updateUserActiveState: dbMocks.updateUserActiveState,
  };
});

vi.mock("../functions/_lib/commercial", async () => {
  const actual = await vi.importActual<typeof import("../functions/_lib/commercial")>("../functions/_lib/commercial");
  return {
    ...actual,
    listAdminAlternativePaymentRequests: commercialMocks.listAdminAlternativePaymentRequests,
    listAdminBillingEvents: commercialMocks.listAdminBillingEvents,
    listAdminSupportTickets: commercialMocks.listAdminSupportTickets,
    updateAdminAlternativePaymentRequest: commercialMocks.updateAdminAlternativePaymentRequest,
  };
});

const { onRequest } = await import("../functions/api/[[path]].ts");

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

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_1",
    organizationId: "org_1",
    externalIdentityId: "oidc_1",
    email: "user@example.org",
    displayName: "User One",
    userType: "worker",
    active: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    user: makeUser(),
    organization: makeOrganization(),
    branding: {
      name: "Network Manager",
      logoUrl: null,
    },
    license: makeLicenseSummary(),
    accessibleCases: [],
    permissions: {
      isOrgAdmin: false,
      canManageOrganization: false,
    },
    ...overrides,
  };
}

function makeCaseSummary(overrides: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: "case_1",
    organizationId: "org_1",
    familyName: "Rivera Family",
    status: "open",
    createdBy: "user_admin",
    createdAt: "2026-04-01T00:00:00.000Z",
    closedAt: null,
    updatedAt: "2026-04-01T00:00:00.000Z",
    membershipRole: "worker",
    accessState: "active",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: "document_1",
    fileName: "plan.pdf",
    mimeType: "application/pdf",
    storageKey: "organizations/org_1/cases/case_1/2026-04-01/document-plan.pdf",
    uploadedBy: "User One",
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeMembershipRecord(overrides: Partial<CaseMembershipRecord> = {}): CaseMembershipRecord {
  return {
    id: "membership_1",
    caseId: "case_1",
    userId: "user_1",
    role: "worker",
    active: true,
    invitedBy: null,
    invitedAt: null,
    accessScopeJson: {},
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    displayName: "User One",
    email: "user@example.org",
    userType: "worker",
    ...overrides,
  };
}

function makeInvitationRecord(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "invite_1",
    organizationId: "org_1",
    caseId: null,
    email: "invitee@example.org",
    userType: "worker",
    caseRole: null,
    active: true,
    inviteToken: "invite-token-1",
    invitedBy: "user_admin",
    invitedAt: "2026-04-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeLicenseSummary(
  overrides: Partial<SessionPayload["license"]> = {},
): SessionPayload["license"] {
  return {
    organizationId: "org_1",
    organizationName: "Test Organization",
    licensedSeatCount: 10,
    licensedPlanName: "Team",
    licenseStatus: "active",
    accessState: "licensed",
    isLicensed: true,
    licenseGateMessage: "Licensed workspace access is active.",
    activeUsers: 2,
    pausedUsers: 0,
    pendingInvitations: 1,
    openCases: 1,
    remainingSeats: 8,
    remainingProvisioningSlots: 7,
    ...overrides,
  };
}

function makeCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "case_1",
    organization_id: "org_1",
    family_name: "Rivera Family",
    status: "open",
    created_by: "user_admin",
    created_at: "2026-04-01T00:00:00.000Z",
    closed_at: null,
    updated_at: "2026-04-01T00:00:00.000Z",
    state_json: JSON.stringify(cloneDefaultCaseState()),
    ...overrides,
  };
}

function makeMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "membership_1",
    case_id: "case_1",
    user_id: "user_1",
    role: "worker",
    active: 1,
    invited_by: null,
    invited_at: null,
    access_scope_json: "{}",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    display_name: "User One",
    email: "user@example.org",
    user_type: "worker",
    ...overrides,
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env["DB"],
    DOCUMENTS_BUCKET: {
      get: vi.fn(),
      put: vi.fn(),
    },
    APP_BASE_URL: "https://network-manager.example.org",
    SESSION_SECRET: "test-secret",
    OIDC_ISSUER_URL: "https://login.example.org",
    OIDC_CLIENT_ID: "client-id",
    OIDC_CLIENT_SECRET: "client-secret",
    ...overrides,
  };
}

function makeAlternativePaymentRequest(overrides: Partial<AlternativePaymentRequestRecord> = {}): AlternativePaymentRequestRecord {
  return {
    id: "manual_1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    fullName: "Billing Contact",
    organizationName: "Test Organization",
    email: "billing@example.org",
    requestedPlan: "team",
    planName: "Team",
    seatCount: 5,
    preferredPaymentMethod: "wise",
    country: "Canada",
    requestStatus: "submitted",
    organizationId: "org_1",
    adminNotes: "Internal note",
    externalReference: "REF-001",
    ...overrides,
  };
}

function makeSupportTicketRecord(overrides: Partial<SupportTicketRecord> = {}): SupportTicketRecord {
  return {
    id: "support_1",
    createdAt: "2026-04-01T00:00:00.000Z",
    status: "submitted",
    targetEmail: "support@example.org",
    fullName: "Case Worker",
    email: "worker@example.org",
    summary: "Help needed",
    details: "Detailed issue description",
    screenshotDataUrl: "data:image/png;base64,abc123",
    ...overrides,
  };
}

function makeBillingEventRecord(overrides: Partial<BillingEventRecord> = {}): BillingEventRecord {
  return {
    id: "billing_1",
    createdAt: "2026-04-01T00:00:00.000Z",
    source: "stripe",
    eventType: "checkout.session.completed",
    status: "paid",
    organizationName: "Test Organization",
    contactEmail: "billing@example.org",
    planId: "team",
    planName: "Team",
    stripeEventId: "evt_123",
    stripeCheckoutSessionId: "cs_123",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    amountMinor: 10000,
    currency: "cad",
    metadataJson: { secret: "value" },
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

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.resolveSession.mockResolvedValue(makeSession());
  auditMocks.audit.mockResolvedValue(undefined);
  dbMocks.countActiveOrganizationUsersByType.mockResolvedValue(1);
  dbMocks.getAccessibleCases.mockResolvedValue([makeCaseSummary()]);
  dbMocks.mapCaseSummary.mockImplementation((row: ReturnType<typeof makeCaseRow>) =>
    makeCaseSummary({
      id: row.id,
      organizationId: row.organization_id,
      familyName: row.family_name,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      updatedAt: row.updated_at,
    }),
  );
  dbMocks.mapCaseState.mockImplementation(() => cloneDefaultCaseState());
  dbMocks.getCaseRow.mockResolvedValue(makeCaseRow());
  dbMocks.getMembershipRow.mockResolvedValue(makeMembershipRow());
  dbMocks.getOrganizationById.mockResolvedValue(makeOrganization());
  dbMocks.getOrganizationLicenseSummary.mockResolvedValue(makeLicenseSummary());
  dbMocks.getUserById.mockResolvedValue(makeUser());
  dbMocks.listInvitations.mockResolvedValue([makeInvitationRecord()]);
  dbMocks.listAllUsersForOwner.mockResolvedValue([{ ...makeUser(), organizationName: "Test Organization" }]);
  dbMocks.listAuditEventsForOwner.mockResolvedValue([]);
  dbMocks.listOrganizationsForOwner.mockResolvedValue([
    {
      ...makeLicenseSummary(),
      status: "active",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  ]);
  dbMocks.listOrganizationUsers.mockResolvedValue([makeUser({ id: "user_admin", userType: "org_admin" })]);
  dbMocks.createCaseRecord.mockResolvedValue(makeCaseRow({ id: "case_new", family_name: "Smith Family" }));
  dbMocks.getAlternativePaymentRequestById.mockResolvedValue(makeAlternativePaymentRequest());
  dbMocks.getCaseDocument.mockResolvedValue(makeDocument());
  dbMocks.ensureCaseMembership.mockResolvedValue(makeMembershipRecord());
  dbMocks.softDeleteUserAccount.mockResolvedValue(makeUser({ active: false, email: "deleted@example.org" }));
  dbMocks.updateOrganizationSettings.mockResolvedValue(makeOrganization());
  dbMocks.updateOrganizationStatus.mockResolvedValue(makeOrganization({ status: "archived" }));
  dbMocks.updateMembership.mockResolvedValue(makeMembershipRecord({ role: "supervisor" }));
  dbMocks.updateUserActiveState.mockResolvedValue(makeUser({ active: false }));
  commercialMocks.listAdminAlternativePaymentRequests.mockResolvedValue([]);
  commercialMocks.listAdminBillingEvents.mockResolvedValue([]);
  commercialMocks.listAdminSupportTickets.mockResolvedValue([]);
  commercialMocks.updateAdminAlternativePaymentRequest.mockResolvedValue(makeAlternativePaymentRequest());
});

describe("enterprise API routes", () => {
  it("creates a case for an org admin through the organization cases route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin", displayName: "Admin User" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );

    const request = new Request("https://network-manager.example.org/api/organizations/org_1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyName: "Smith Family" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.createCaseRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org_1",
        familyName: "Smith Family",
        createdBy: "user_admin",
      }),
    );
    expect(payload.ok).toBe(true);
    expect((payload.caseRecord as Record<string, unknown>).id).toBe("case_new");
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "case_created", caseId: "case_new" }),
    );
  });

  it("creates a private case for a worker and grants creator membership", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_worker", userType: "worker", displayName: "Worker User" }),
        permissions: { isOrgAdmin: false, canManageOrganization: false },
      }),
    );
    dbMocks.getAccessibleCases.mockResolvedValue([
      makeCaseSummary({
        id: "case_new",
        familyName: "Smith Family",
        createdBy: "user_worker",
        membershipRole: "worker",
        accessState: "active",
      }),
    ]);

    const request = new Request("https://network-manager.example.org/api/organizations/org_1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyName: "Smith Family" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.createCaseRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org_1",
        familyName: "Smith Family",
        createdBy: "user_worker",
      }),
    );
    expect(dbMocks.ensureCaseMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseId: "case_new",
        userId: "user_worker",
        role: "worker",
      }),
    );
    expect((payload.caseRecord as Record<string, unknown>).id).toBe("case_new");
    expect((payload.caseRecord as Record<string, unknown>).membershipRole).toBe("worker");
  });

  it("blocks case-list access when the organization is not licensed", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: null,
        licensedPlanName: undefined,
        licenseStatus: "inactive",
        accessState: "unlicensed",
        isLicensed: false,
        licenseGateMessage:
          "This workspace does not yet have an active licensed seat allocation. Contact the platform owner to activate access before using the live case workspace.",
        remainingSeats: 0,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/organizations/org_1/cases", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("organization_unlicensed");
  });

  it("blocks case creation when the organization is not licensed", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin", displayName: "Admin User" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: null,
        licensedPlanName: undefined,
        licenseStatus: "inactive",
        accessState: "unlicensed",
        isLicensed: false,
        licenseGateMessage:
          "This workspace does not yet have an active licensed seat allocation. Contact the platform owner to activate access before using the live case workspace.",
        remainingSeats: 0,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/organizations/org_1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyName: "Smith Family" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("organization_unlicensed");
    expect(dbMocks.createCaseRecord).not.toHaveBeenCalled();
  });

  it("returns a downloadable document response when the user is allowed to access the case", async () => {
    const bytes = new TextEncoder().encode("test-pdf");
    const env = makeEnv({
      DOCUMENTS_BUCKET: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
          text: vi.fn(),
          json: vi.fn(),
        }),
        put: vi.fn(),
      },
    });

    const request = new Request("https://network-manager.example.org/api/cases/case_1/documents/document_1", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, env));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("plan.pdf");
    expect(await response.text()).toBe("test-pdf");
  });

  it("denies document download when the signed-in user is not an active case member", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ userType: "worker" }),
      }),
    );
    dbMocks.getMembershipRow.mockResolvedValue(null);

    const request = new Request("https://network-manager.example.org/api/cases/case_1/documents/document_1", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("case_membership_required");
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "access_denied" }),
    );
  });

  it("adds an existing user to a case through the admin case-membership route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.ensureCaseMembership.mockResolvedValue(makeMembershipRecord({ userId: "user_2", role: "worker" }));

    const request = new Request("https://network-manager.example.org/api/admin/case-memberships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: "case_1", userId: "user_2", role: "worker" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.ensureCaseMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caseId: "case_1", userId: "user_2", role: "worker" }),
    );
    expect((payload.membership as Record<string, unknown>).userId).toBe("user_2");
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "case_membership_added" }),
    );
  });

  it("updates a case membership role through the admin case-membership route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.updateMembership.mockResolvedValue(makeMembershipRecord({ role: "supervisor", active: true }));

    const request = new Request("https://network-manager.example.org/api/admin/case-memberships/membership_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "supervisor" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.updateMembership).toHaveBeenCalledWith(
      expect.anything(),
      "membership_1",
      expect.objectContaining({ role: "supervisor" }),
    );
    expect((payload.membership as Record<string, unknown>).role).toBe("supervisor");
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "case_membership_changed" }),
    );
  });

  it("removes case access by deactivating a case membership", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.updateMembership.mockResolvedValue(makeMembershipRecord({ active: false }));

    const request = new Request("https://network-manager.example.org/api/admin/case-memberships/membership_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.updateMembership).toHaveBeenCalledWith(
      expect.anything(),
      "membership_1",
      expect.objectContaining({ active: false }),
    );
    expect((payload.membership as Record<string, unknown>).active).toBe(false);
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "case_membership_removed" }),
    );
  });

  it("returns deployment-readiness diagnostics for a platform owner", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );

    const request = new Request("https://network-manager.example.org/api/admin/deployment-readiness", {
      method: "GET",
    });

    const response = await onRequest(
      makeContext(
        request,
        makeEnv({
          DOCUMENTS_BUCKET: undefined,
          OIDC_CLIENT_SECRET: "",
        }),
      ),
    );
    const payload = await readJson(response);
    const report = payload.report as { ready: boolean; checks: Array<{ key: string; status: string }> };

    expect(response.status).toBe(200);
    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "authentication", status: "ready" }),
        expect.objectContaining({ key: "enterprise_sso", status: "warning" }),
        expect.objectContaining({ key: "documents", status: "missing" }),
      ]),
    );
  });

  it("filters admin users and invitations to the signed-in organization", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.listOrganizationUsers.mockResolvedValue([
      makeUser({ id: "user_org_1", organizationId: "org_1", email: "org1@example.org" }),
      makeUser({ id: "user_org_2", organizationId: "org_2", email: "org2@example.org" }),
    ]);
    dbMocks.listInvitations.mockResolvedValue([
      makeInvitationRecord({ id: "invite_org_1", organizationId: "org_1", email: "invite1@example.org" }),
      makeInvitationRecord({ id: "invite_org_2", organizationId: "org_2", email: "invite2@example.org" }),
    ]);

    const request = new Request("https://network-manager.example.org/api/admin/users", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.listOrganizationUsers).toHaveBeenCalledWith(expect.anything(), "org_1");
    expect(dbMocks.listInvitations).toHaveBeenCalledWith(expect.anything(), "org_1");
    expect(payload.users).toEqual([
      expect.objectContaining({ id: "user_org_1", organizationId: "org_1", email: "org1@example.org" }),
    ]);
    expect(payload.invitations).toEqual([
      expect.objectContaining({ id: "invite_org_1", organizationId: "org_1", email: "invite1@example.org" }),
    ]);
  });

  it("minimizes the session payload returned to the browser", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({
          externalIdentityId: "sensitive-subject",
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        }),
      }),
    );

    const request = new Request("https://network-manager.example.org/api/me", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.user).toEqual(
      expect.objectContaining({
        id: "user_1",
        email: "user@example.org",
        displayName: "User One",
        userType: "worker",
        active: true,
      }),
    );
    expect(payload.user).not.toHaveProperty("externalIdentityId");
    expect(payload.user).not.toHaveProperty("organizationId");
    expect(payload.organization).not.toHaveProperty("settingsJson");
  });

  it("returns the platform owner overview for a platform owner session", async () => {
    dbMocks.listAuditEventsForOwner.mockResolvedValue([
      {
        id: "audit_1",
        organizationId: "org_1",
        caseId: "case_1",
        actorUserId: "user_actor",
        eventType: "case_updated",
        metadataJson: { internal: "secret" },
        createdAt: "2026-04-01T00:00:00.000Z",
        actorDisplayName: "Owner User",
      },
    ]);
    commercialMocks.listAdminSupportTickets.mockResolvedValue([
      makeSupportTicketRecord(),
    ]);
    commercialMocks.listAdminBillingEvents.mockResolvedValue([
      makeBillingEventRecord(),
    ]);
    commercialMocks.listAdminAlternativePaymentRequests.mockResolvedValue([
      makeAlternativePaymentRequest(),
    ]);

    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/overview", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((payload.overview as Record<string, unknown>).organizations).toEqual(expect.any(Array));
    const overview = payload.overview as Record<string, unknown>;
    const ticket = (overview.supportTickets as Array<Record<string, unknown>>)[0];
    const billingEvent = (overview.billingEvents as Array<Record<string, unknown>>)[0];
    const auditEvent = (overview.auditEvents as Array<Record<string, unknown>>)[0];
    expect(ticket).not.toHaveProperty("screenshotDataUrl");
    expect(ticket).not.toHaveProperty("targetEmail");
    expect(billingEvent).not.toHaveProperty("stripeCustomerId");
    expect(billingEvent).not.toHaveProperty("metadataJson");
    expect(auditEvent).not.toHaveProperty("actorUserId");
    expect(auditEvent).not.toHaveProperty("metadataJson");
    expect(dbMocks.listOrganizationsForOwner).toHaveBeenCalled();
    expect(dbMocks.listAllUsersForOwner).toHaveBeenCalled();
  });

  it("filters alternative payment requests to the signed-in organization", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    commercialMocks.listAdminAlternativePaymentRequests.mockResolvedValue([
      makeAlternativePaymentRequest({ id: "manual_org_1", organizationId: "org_1" }),
      makeAlternativePaymentRequest({ id: "manual_org_2", organizationId: "org_2", organizationName: "Another Org" }),
    ]);

    const request = new Request("https://network-manager.example.org/api/admin/alternative-payment-requests", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.requests).toEqual([
      expect.objectContaining({ id: "manual_org_1", organizationName: "Test Organization" }),
    ]);
  });

  it("blocks an org admin from patching another organization's alternative payment request", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getAlternativePaymentRequestById.mockResolvedValue(
      makeAlternativePaymentRequest({ id: "manual_org_2", organizationId: "org_2", organizationName: "Another Org" }),
    );

    const request = new Request("https://network-manager.example.org/api/admin/alternative-payment-requests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "manual_org_2", requestStatus: "reviewing" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("organization_membership_required");
    expect(commercialMocks.updateAdminAlternativePaymentRequest).not.toHaveBeenCalled();
  });

  it("soft-deletes a user through the platform owner route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );
    dbMocks.getUserById.mockResolvedValue(
      makeUser({
        id: "user_target",
        organizationId: "org_1",
        email: "worker@example.org",
        displayName: "Worker User",
        userType: "worker",
      }),
    );
    dbMocks.softDeleteUserAccount.mockResolvedValue(
      makeUser({
        id: "user_target",
        organizationId: "org_1",
        email: "deleted+target@deleted.local",
        displayName: "Deleted account arget",
        active: false,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/users/user_target", {
      method: "DELETE",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dbMocks.softDeleteUserAccount).toHaveBeenCalledWith(expect.anything(), "org_1", "user_target");
    expect(payload.ok).toBe(true);
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "owner_user_deleted" }),
    );
  });

  it("blocks deleting the only active org admin through the platform owner route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );
    dbMocks.countActiveOrganizationUsersByType.mockResolvedValue(1);
    dbMocks.getUserById.mockResolvedValue(
      makeUser({
        id: "user_target_admin",
        organizationId: "org_2",
        email: "admin@example.org",
        displayName: "Only Admin",
        userType: "org_admin",
        active: true,
      }),
    );
    dbMocks.softDeleteUserAccount.mockResolvedValue(
      makeUser({
        id: "user_target_admin",
        organizationId: "org_2",
        email: "deleted+targetadmin@deleted.local",
        displayName: "Deleted account admin",
        userType: "org_admin",
        active: false,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/users/user_target_admin", {
      method: "DELETE",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.hint).toBe("At least one active organization admin must remain.");
    expect(dbMocks.softDeleteUserAccount).not.toHaveBeenCalled();
  });

  it("denies the owner overview for a non-platform-owner session", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true, isPlatformOwner: false, canManagePlatform: false },
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/overview", {
      method: "GET",
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("platform_owner_required");
  });

  it("updates organization license settings through the owner route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );
    dbMocks.updateOrganizationSettings.mockResolvedValue(
      makeOrganization({
        settingsJson: { licensedSeatCount: 25, licensedPlanName: "Small organization", licenseStatus: "active" },
      }),
    );
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: 25,
        licensedPlanName: "Small organization",
        licenseStatus: "active",
        remainingSeats: 23,
        remainingProvisioningSlots: 22,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/organizations/org_1/license", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ licensedSeatCount: 25, licensedPlanName: "Small organization", licenseStatus: "active" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.updateOrganizationSettings).toHaveBeenCalledWith(
      expect.anything(),
      "org_1",
      expect.objectContaining({
        licensedSeatCount: 25,
        licensedPlanName: "Small organization",
        licenseStatus: "active",
      }),
    );
    expect((payload.summary as Record<string, unknown>).licensedSeatCount).toBe(25);
  });

  it("archives an organization through the owner route", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_owner", userType: "org_admin", email: "owner@example.org" }),
        permissions: {
          isOrgAdmin: true,
          canManageOrganization: true,
          isPlatformOwner: true,
          canManagePlatform: true,
        },
      }),
    );
    dbMocks.updateOrganizationStatus.mockResolvedValue(makeOrganization({ status: "archived" }));
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licenseStatus: "active",
        accessState: "archived",
        isLicensed: false,
        licenseGateMessage: "This workspace has been archived. Contact the platform owner if access needs to be restored.",
        remainingSeats: 0,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/owner/organizations/org_1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(dbMocks.updateOrganizationStatus).toHaveBeenCalledWith(expect.anything(), "org_1", "archived");
    expect((payload.summary as Record<string, unknown>).accessState).toBe("archived");
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "owner_organization_archived" }),
    );
  });

  it("blocks an org-admin invitation when the organization has no remaining seat capacity", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: 3,
        activeUsers: 2,
        pendingInvitations: 1,
        remainingSeats: 1,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new-user@example.org", userType: "worker" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("bad_request");
    expect(dbMocks.updateUserActiveState).not.toHaveBeenCalled();
  });

  it("blocks restoring a paused user when the organization has no remaining seats", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getUserById.mockResolvedValue(makeUser({ id: "user_2", active: false, organizationId: "org_1" }));
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: 2,
        activeUsers: 2,
        pausedUsers: 1,
        pendingInvitations: 0,
        remainingSeats: 0,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/admin/users/user_2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("bad_request");
    expect(dbMocks.updateUserActiveState).not.toHaveBeenCalled();
  });

  it("blocks invitations when the organization is unlicensed", async () => {
    sessionMocks.resolveSession.mockResolvedValue(
      makeSession({
        user: makeUser({ id: "user_admin", userType: "org_admin" }),
        permissions: { isOrgAdmin: true, canManageOrganization: true },
      }),
    );
    dbMocks.getOrganizationLicenseSummary.mockResolvedValue(
      makeLicenseSummary({
        licensedSeatCount: null,
        licensedPlanName: undefined,
        licenseStatus: "inactive",
        accessState: "unlicensed",
        isLicensed: false,
        licenseGateMessage:
          "This workspace does not yet have an active licensed seat allocation. Contact the platform owner to activate access before using the live case workspace.",
        remainingSeats: 0,
        remainingProvisioningSlots: 0,
      }),
    );

    const request = new Request("https://network-manager.example.org/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new-user@example.org", userType: "worker" }),
    });

    const response = await onRequest(makeContext(request, makeEnv()));
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toBe("organization_unlicensed");
  });
});
