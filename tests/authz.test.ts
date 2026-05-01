import { describe, expect, it } from "vitest";

import type {
  AppUser,
  CaseMembershipRecord,
  CaseSummary,
  OrganizationRecord,
} from "../shared/types";
import {
  canAccessCase,
  canCloseCase,
  canCreateCases,
  canEditCaseState,
  canPostJournal,
  requireOrgAdmin,
} from "../functions/_lib/authz";

function organization(overrides: Partial<OrganizationRecord> = {}): OrganizationRecord {
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

function user(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_1",
    organizationId: "org_1",
    externalIdentityId: "oidc-1",
    email: "user@example.org",
    displayName: "User",
    userType: "worker",
    active: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function caseRecord(overrides: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: "case_1",
    organizationId: "org_1",
    familyName: "Rivera",
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

function membership(overrides: Partial<CaseMembershipRecord> = {}): CaseMembershipRecord {
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
    ...overrides,
  };
}

describe("authorization rules", () => {
  it("allows active case members on open cases", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "open" }),
      membership: membership({ role: "worker" }),
      user: user({ userType: "worker" }),
      organization: organization(),
      closedSupervisorAccess: false,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("revokes worker access automatically after case closure", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "closed", accessState: "closed_denied" }),
      membership: membership({ role: "worker" }),
      user: user({ userType: "worker" }),
      organization: organization(),
      closedSupervisorAccess: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("case_closed_worker_access_revoked");
  });

  it("retains caregiver access after closure", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "closed", membershipRole: "caregiver", accessState: "closed_readonly" }),
      membership: membership({ role: "caregiver" }),
      user: user({ userType: "caregiver" }),
      organization: organization(),
      closedSupervisorAccess: false,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("retains network member access after closure", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "closed", membershipRole: "network_member", accessState: "closed_readonly" }),
      membership: membership({ role: "network_member" }),
      user: user({ userType: "network_member" }),
      organization: organization(),
      closedSupervisorAccess: false,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("denies supervisor access to closed cases by default", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "closed", membershipRole: "supervisor", accessState: "closed_denied" }),
      membership: membership({ role: "supervisor" }),
      user: user({ userType: "supervisor" }),
      organization: organization(),
      closedSupervisorAccess: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("case_closed_supervisor_access_revoked");
  });

  it("allows supervisor access to closed cases when organization policy enables it", () => {
    const decision = canAccessCase({
      caseRecord: caseRecord({ status: "closed", membershipRole: "supervisor", accessState: "closed_readonly" }),
      membership: membership({ role: "supervisor" }),
      user: user({ userType: "supervisor" }),
      organization: organization({ settingsJson: { closedCaseSupervisorAccess: true } }),
      closedSupervisorAccess: false,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("only allows editing case state for staff on open cases", () => {
    expect(canEditCaseState(caseRecord({ status: "open" }), membership({ role: "worker" }), user({ userType: "worker" }))).toBe(true);
    expect(canEditCaseState(caseRecord({ status: "open" }), membership({ role: "caregiver" }), user({ userType: "caregiver" }))).toBe(false);
    expect(canEditCaseState(caseRecord({ status: "closed" }), membership({ role: "supervisor" }), user({ userType: "supervisor" }))).toBe(false);
    expect(canEditCaseState(caseRecord({ status: "closed" }), membership({ role: "caregiver" }), user({ userType: "caregiver" }))).toBe(true);
    expect(canEditCaseState(caseRecord({ status: "closed" }), membership({ role: "network_member" }), user({ userType: "network_member" }))).toBe(true);
  });

  it("blocks worker and supervisor journal posting after closure while keeping caregiver access", () => {
    const closedCase = caseRecord({ status: "closed" });
    expect(canPostJournal(closedCase, membership({ role: "worker" }), user({ userType: "worker" }))).toBe(false);
    expect(canPostJournal(closedCase, membership({ role: "supervisor" }), user({ userType: "supervisor" }))).toBe(false);
    expect(canPostJournal(closedCase, membership({ role: "caregiver" }), user({ userType: "caregiver" }))).toBe(true);
    expect(canPostJournal(closedCase, membership({ role: "network_member" }), user({ userType: "network_member" }))).toBe(true);
  });

  it("allows case closure only for org admins and supervisors on open cases", () => {
    expect(canCloseCase(caseRecord({ status: "open" }), membership({ role: "supervisor" }), user({ userType: "supervisor" }))).toBe(true);
    expect(canCloseCase(caseRecord({ status: "open" }), membership({ role: "worker" }), user({ userType: "worker" }))).toBe(false);
    expect(canCloseCase(caseRecord({ status: "open" }), null, user({ userType: "org_admin" }))).toBe(true);
  });

  it("requires organization admin for org admin routes", () => {
    expect(requireOrgAdmin(user({ userType: "org_admin" }))).toEqual({ allowed: true });
    expect(requireOrgAdmin(user({ userType: "worker" }))).toMatchObject({
      allowed: false,
      reason: "org_admin_required",
    });
  });

  it("allows org admins, workers, and supervisors to create cases", () => {
    expect(canCreateCases(user({ userType: "org_admin" }))).toEqual({ allowed: true });
    expect(canCreateCases(user({ userType: "worker" }))).toEqual({ allowed: true });
    expect(canCreateCases(user({ userType: "supervisor" }))).toEqual({ allowed: true });
    expect(canCreateCases(user({ userType: "caregiver" }))).toMatchObject({ allowed: false });
  });
});
