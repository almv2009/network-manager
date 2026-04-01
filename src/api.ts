import type {
  AuditEventRecord,
  CaseMembershipRecord,
  CaseResponse,
  CaseSummary,
  DocumentItem,
  InvitationRecord,
  JournalAudience,
  JournalEntry,
  SessionPayload,
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

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const error = typeof payload === "object" && payload
      ? new ApiError(
          response.status,
          String((payload as Record<string, unknown>).error || "request_failed"),
          String((payload as Record<string, unknown>).hint || "Request failed."),
        )
      : new ApiError(response.status, "request_failed", String(payload || "Request failed."));
    throw error;
  }

  return payload as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
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

export async function fetchCase(caseId: string) {
  return apiRequest<{ ok: true } & CaseResponse>(`/api/cases/${caseId}`);
}

export async function patchCase(caseId: string, payload: { familyName?: string; state?: Record<string, unknown> }) {
  return apiRequest<{ ok: true; caseRecord: CaseSummary }>(`/api/cases/${caseId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function closeCase(caseId: string, closureNote: string) {
  return apiRequest<{ ok: true; caseRecord: CaseSummary }>(`/api/cases/${caseId}/close`, {
    method: "POST",
    body: JSON.stringify({ closureNote }),
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

export async function patchUserActive(userId: string, active: boolean) {
  return apiRequest<{ ok: true; user: SessionPayload["user"] }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
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
    delivery: { status: "manual" | "sent" | "failed"; channel: "manual" | "webhook"; detail: string };
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
