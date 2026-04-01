import { describe, expect, it } from "vitest";

import type { AppUser, CaseMembershipRecord, CaseSummary } from "../shared/types";
import { buildDocumentStorageKey, canUploadDocuments, validateDocumentFile } from "../functions/_lib/documents";
import type { Env } from "../functions/_lib/types";

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
    DOCUMENTS_STORAGE_PROVIDER: "r2",
    DOCUMENT_UPLOAD_MAX_BYTES: String(1024),
    DOCUMENT_ALLOWED_MIME_TYPES: "application/pdf,image/png",
    ...overrides,
  };
}

function caseRecord(overrides: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: "case_1",
    organizationId: "org_1",
    familyName: "Case",
    status: "open",
    createdBy: "user_1",
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

function user(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_1",
    organizationId: "org_1",
    externalIdentityId: "oidc_1",
    email: "user@example.org",
    displayName: "User",
    userType: "worker",
    active: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("document handling", () => {
  it("validates allowed mime types and size limits", () => {
    const goodFile = new File([new Uint8Array([1, 2, 3])], "plan.pdf", { type: "application/pdf" });
    const badType = new File([new Uint8Array([1, 2, 3])], "plan.exe", { type: "application/x-msdownload" });
    const tooLarge = new File([new Uint8Array(2048)], "large.pdf", { type: "application/pdf" });

    expect(validateDocumentFile(env(), goodFile)).toEqual({ ok: true });
    expect(validateDocumentFile(env(), badType)).toMatchObject({ ok: false, error: "bad_request" });
    expect(validateDocumentFile(env(), tooLarge)).toMatchObject({ ok: false, error: "bad_request" });
  });

  it("builds stable organization/case scoped storage keys", () => {
    const storageKey = buildDocumentStorageKey({
      organizationId: "org_1",
      caseId: "case_1",
      fileName: "My Plan (final).pdf",
      mimeType: "application/pdf",
      uploadedBy: "user_1",
    });
    expect(storageKey).toContain("organizations/org_1/cases/case_1/");
    expect(storageKey).toContain("My-Plan-final-.pdf");
  });

  it("enforces closure-based document upload access", () => {
    expect(canUploadDocuments(caseRecord({ status: "closed" }), membership({ role: "worker" }), user({ userType: "worker" }))).toBe(false);
    expect(canUploadDocuments(caseRecord({ status: "closed" }), membership({ role: "supervisor" }), user({ userType: "supervisor" }))).toBe(false);
    expect(canUploadDocuments(caseRecord({ status: "closed" }), membership({ role: "caregiver" }), user({ userType: "caregiver" }))).toBe(true);
    expect(canUploadDocuments(caseRecord({ status: "closed" }), membership({ role: "network_member" }), user({ userType: "network_member" }))).toBe(true);
  });
});
