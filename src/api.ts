import type {
  AlternativePaymentMethod,
  AlternativePaymentRequestPayload,
  AlternativePaymentRequestResponse,
  AlternativePaymentRequestStatus,
  AuditEventRecord,
  BillingCheckoutPayload,
  BillingCheckoutResponse,
  BillingEventRecord,
  CaseMembershipRecord,
  CaseResponse,
  CaseState,
  CaseSummary,
  DocumentItem,
  DeploymentReadinessReport,
  InvitationRecord,
  JournalAudience,
  JournalEntry,
  NetworkBillingPlanOption,
  OrganizationLicenseSummary,
  PlatformOwnerOverview,
  SessionPayload,
  SupportTicketRecord,
  SupportTicketPayload,
  SupportTicketResponse,
  UserType,
} from "../shared/types";

export class ApiError extends Error {
  status: number;
  code: string;
  hint: string;

  constructor(status: number, code: string, hint: string) {
    super(hint || code || `Request failed with status ${status}`);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

function parseApiErrorPayload(payload: Record<string, unknown>, status: number) {
  const rawCode = payload.error;
  const rawHint = payload.hint;
  const rawMessage = payload.message;
  const code =
    typeof rawCode === "string" && rawCode.trim()
      ? rawCode.trim()
      : typeof rawMessage === "string" && rawMessage.trim()
        ? "request_failed"
        : "request_failed";
  const hint =
    typeof rawHint === "string" && rawHint.trim()
      ? rawHint.trim()
      : typeof rawMessage === "string" && rawMessage.trim()
        ? rawMessage.trim()
        : `Request failed with status ${status}`;
  return new ApiError(status, code, hint);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const fallbackHint = `The server returned an unexpected error (${response.status}). Please try again.`;
    const error = typeof payload === "object" && payload
      ? parseApiErrorPayload(payload as Record<string, unknown>, response.status)
      : (() => {
          const rawMessage = String(payload || "Request failed.");
          const normalized = rawMessage.trim().toLowerCase();
          const looksLikeHtml =
            normalized.startsWith("<!doctype") ||
            normalized.startsWith("<html") ||
            normalized.includes("worker threw exception");
          return new ApiError(response.status, "request_failed", looksLikeHtml ? fallbackHint : rawMessage);
        })();
    throw error;
  }

  return payload as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  return parseResponse<T>(response);
}

export type SessionResponse = SessionPayload & { ok: true };

export async function fetchSession() {
  return apiRequest<SessionResponse>("/api/me");
}

export async function fetchOrganizationCases(orgId: string) {
  return apiRequest<{ ok: true; cases: CaseSummary[] }>(`/api/organizations/${orgId}/cases`);
}

export async function createCase(orgId: string, payload: { familyName: string; state?: Partial<CaseState> }) {
  return apiRequest<{ ok: true; caseRecord: CaseSummary; state: CaseState }>(`/api/organizations/${orgId}/cases`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCase(caseId: string) {
  return apiRequest<{ ok: true } & CaseResponse>(`/api/cases/${caseId}`);
}

export async function patchCase(caseId: string, payload: { familyName?: string; state?: Partial<CaseState> }) {
  return apiRequest<{ ok: true; caseRecord: CaseSummary; state: CaseState }>(`/api/cases/${caseId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function closeCase(caseId: string, closureNote: string) {
  return apiRequest<{ ok: true; caseRecord: CaseSummary; state: CaseState }>(`/api/cases/${caseId}/close`, {
    method: "POST",
    body: JSON.stringify({ closureNote }),
  });
}

export async function deleteCase(caseId: string) {
  return apiRequest<{ ok: true; caseId: string }>(`/api/cases/${caseId}`, {
    method: "DELETE",
  });
}

export async function fetchJournal(caseId: string) {
  return apiRequest<{ ok: true; entries: JournalEntry[] }>(`/api/cases/${caseId}/journal`);
}

export async function createJournal(caseId: string, payload: { audience: JournalAudience; message: string }) {
  return apiRequest<{ ok: true; entry: JournalEntry }>(`/api/cases/${caseId}/journal`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminUsers() {
  return apiRequest<{ ok: true; users: SessionPayload["user"][]; invitations: InvitationRecord[] }>("/api/admin/users");
}

export type PractitionerInvitationRecord = InvitationRecord & {
  caseFamilyName: string | null;
};

export async function fetchPractitionerInvitations() {
  return apiRequest<{ ok: true; invitations: PractitionerInvitationRecord[] }>("/api/practitioner/invitations");
}

export async function deletePractitionerInvitation(invitationId: string) {
  return apiRequest<{
    ok: true;
    action: "invite_revoked" | "invite_inactivated" | "member_removed" | "invite_already_inactive";
    invitation: InvitationRecord;
    removedMembershipId?: string | null;
  }>(`/api/practitioner/invitations/${encodeURIComponent(invitationId)}`, {
    method: "DELETE",
  });
}

export async function fetchAdminLicenseSummary() {
  return apiRequest<{ ok: true; summary: OrganizationLicenseSummary }>("/api/admin/license-summary");
}

export async function updateAdminOrganizationLicense(payload: {
  licensedSeatCount?: number | null;
  licensedPlanName?: string;
  licenseStatus?: string;
}) {
  return apiRequest<{ ok: true; summary: OrganizationLicenseSummary }>("/api/admin/organization/license", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminOrganizationStatus(status: "active" | "archived") {
  return apiRequest<{ ok: true; summary: OrganizationLicenseSummary }>("/api/admin/organization/status", {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteAdminOrganization() {
  return apiRequest<{ ok: true; organizationId: string; status: "deleted" }>("/api/admin/organization", {
    method: "DELETE",
  });
}

export async function patchUserActive(userId: string, active: boolean) {
  return apiRequest<{ ok: true; user: SessionPayload["user"] }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function deleteUserAccount(userId: string) {
  return apiRequest<{ ok: true; user: SessionPayload["user"] }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function createInvitation(payload: {
  email: string;
  userType: UserType;
  caseRole?: CaseMembershipRecord["role"] | "";
  caseId?: string | "";
}) {
  return apiRequest<{
    ok: true;
    invitation: InvitationRecord;
    inviteUrl: string;
    delivery: { status: "manual" | "sent" | "failed"; channel: "manual" | "webhook" | "resend"; detail: string };
  }>("/api/admin/invitations", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      userType: payload.userType,
      caseRole: payload.caseRole || null,
      caseId: payload.caseId || null,
    }),
  });
}

export async function deleteAdminInvitation(invitationId: string) {
  return apiRequest<{ ok: true; invitation: InvitationRecord; alreadyRevoked?: boolean }>(
    `/api/admin/invitations/${invitationId}`,
    {
      method: "DELETE",
    },
  );
}

export async function createCaseMembership(payload: {
  caseId: string;
  userId: string;
  role: CaseMembershipRecord["role"];
}) {
  return apiRequest<{ ok: true; membership: CaseMembershipRecord }>("/api/admin/case-memberships", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchCaseMembership(
  membershipId: string,
  payload: { role?: CaseMembershipRecord["role"]; active?: boolean },
) {
  return apiRequest<{ ok: true; membership: CaseMembershipRecord }>(`/api/admin/case-memberships/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchAuditEvents() {
  return apiRequest<{ ok: true; events: AuditEventRecord[] }>("/api/admin/audit-events");
}

export async function fetchOwnerOverview() {
  return apiRequest<{ ok: true; overview: PlatformOwnerOverview }>("/api/owner/overview");
}

export async function createOwnerOrganizationWithInvite(payload: {
  organizationName: string;
  adminEmail: string;
  licensedSeatCount?: number | null;
  licensedPlanName?: string;
  licenseStatus?: "active" | "trial" | "paused" | "inactive";
}) {
  return apiRequest<{
    ok: true;
    summary: OrganizationLicenseSummary;
    invitation: InvitationRecord;
    inviteUrl: string;
    delivery: { status: "manual" | "sent" | "failed"; channel: "manual" | "webhook" | "resend"; detail: string };
  }>("/api/owner/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOwnerOrganizationLicense(
  organizationId: string,
  payload: {
    licensedSeatCount?: number | null;
    licensedPlanName?: string;
    licenseStatus?: string;
  },
) {
  return apiRequest<{ ok: true; summary: OrganizationLicenseSummary }>(`/api/owner/organizations/${organizationId}/license`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateOwnerOrganizationStatus(
  organizationId: string,
  status: "active" | "archived",
) {
  return apiRequest<{ ok: true; summary: OrganizationLicenseSummary }>(`/api/owner/organizations/${organizationId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteOwnerOrganization(organizationId: string) {
  return apiRequest<{ ok: true; organizationId: string; status: "deleted" }>(`/api/owner/organizations/${organizationId}`, {
    method: "DELETE",
  });
}

export async function patchOwnerUserActive(userId: string, active: boolean) {
  return apiRequest<{ ok: true; user: SessionPayload["user"] }>(`/api/owner/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function deleteOwnerUserAccount(userId: string) {
  return apiRequest<{ ok: true; user: SessionPayload["user"] }>(`/api/owner/users/${userId}`, {
    method: "DELETE",
  });
}

export async function fetchAdminDeploymentReadiness() {
  return apiRequest<{ ok: true; report: DeploymentReadinessReport }>("/api/admin/deployment-readiness");
}

export async function fetchAdminSupportTickets() {
  return apiRequest<{ ok: true; tickets: SupportTicketRecord[] }>("/api/admin/support-tickets");
}

export async function fetchAdminBillingEvents() {
  return apiRequest<{ ok: true; events: BillingEventRecord[] }>("/api/admin/billing-events");
}

export async function fetchAdminAlternativePaymentRequests(status?: AlternativePaymentRequestStatus | "all") {
  const query = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<{ ok: true; requests: AlternativePaymentRequestResponse["request"][] }>(
    `/api/admin/alternative-payment-requests${query}`,
  );
}

export async function updateAdminAlternativePaymentRequest(
  id: string,
  payload: {
    requestStatus?: AlternativePaymentRequestStatus;
    adminNotes?: string;
    externalReference?: string;
    activationStartsAt?: string;
    activationEndsAt?: string;
  },
) {
  return apiRequest<{ ok: true; request: AlternativePaymentRequestResponse["request"] }>(
    `/api/admin/alternative-payment-requests/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function uploadCaseDocument(caseId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/cases/${caseId}/documents`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  return parseResponse<{ ok: true; document: DocumentItem }>(response);
}

export async function deleteCaseDocument(caseId: string, documentId: string) {
  return apiRequest<{ ok: true; documentId: string }>(
    `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`,
    {
      method: "DELETE",
    },
  );
}

export function getCaseDocumentUrl(caseId: string, documentId: string) {
  return `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`;
}

export async function fetchBillingPlans() {
  return apiRequest<{
    ok: true;
    configured: boolean;
    alternativePaymentsEnabled: boolean;
    allowedAlternativePaymentMethods: AlternativePaymentMethod[];
    plans: NetworkBillingPlanOption[];
  }>("/api/billing/plans");
}

export async function startBillingCheckout(payload: BillingCheckoutPayload) {
  return apiRequest<BillingCheckoutResponse & { ok: true }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitAlternativePaymentRequest(payload: AlternativePaymentRequestPayload) {
  return apiRequest<AlternativePaymentRequestResponse & { ok: true }>("/api/billing/alternative-payment-request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitSupportTicket(payload: SupportTicketPayload) {
  return apiRequest<SupportTicketResponse & { ok: true }>("/api/support-ticket", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
