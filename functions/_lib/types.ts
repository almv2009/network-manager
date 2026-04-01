import type {
  AccessDeniedReason,
  AppUser,
  AuditEventRecord,
  CaseMembershipRecord,
  CaseResponse,
  CaseState,
  CaseSummary,
  CaseStatus,
  InvitationRecord,
  OrganizationRecord,
  SessionPayload,
  UserType,
} from "../../shared/types";

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
}

export interface R2ObjectBody {
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream, options?: R2PutOptions): Promise<void>;
}

export type Env = {
  DB: D1Database;
  DOCUMENTS_BUCKET?: R2Bucket;
  APP_BASE_URL: string;
  SESSION_SECRET: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_TTL_HOURS?: string;
  OIDC_ISSUER_URL: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  OIDC_SCOPES?: string;
  OIDC_PROVIDER_NAME?: string;
  INVITE_EMAIL_SENDER?: string;
  ORGANIZATION_BRANDING_NAME?: string;
  ORGANIZATION_BRANDING_LOGO_URL?: string;
  CASE_CLOSED_SUPERVISOR_ACCESS?: string;
  DOCUMENTS_STORAGE_PROVIDER?: string;
  DOCUMENT_UPLOAD_MAX_BYTES?: string;
  DOCUMENT_ALLOWED_MIME_TYPES?: string;
  INVITE_EMAIL_WEBHOOK_URL?: string;
  INVITE_EMAIL_WEBHOOK_BEARER_TOKEN?: string;
};

export type AppContext<P extends Record<string, string> = Record<string, string>> = {
  request: Request;
  env: Env;
  params: P;
  data: Record<string, unknown>;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
};

export type ApiErrorCode =
  | "auth_required"
  | "org_admin_required"
  | "organization_membership_required"
  | "case_membership_required"
  | "case_closed_worker_access_revoked"
  | "case_closed_supervisor_access_revoked"
  | "inactive_user"
  | "not_found"
  | "bad_request"
  | "method_not_allowed"
  | "user_not_provisioned";

export type AuthSessionRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  session_token_hash: string;
  oidc_subject: string;
  oidc_email: string | null;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
};

export type ResolvedSession = {
  session: AuthSessionRecord;
  user: AppUser;
  organization: OrganizationRecord;
  permissions: SessionPayload["permissions"];
};

export type AccessDecision = {
  allowed: boolean;
  reason?: AccessDeniedReason;
  hint?: string;
};

export type CaseAccessContext = {
  caseRecord: CaseSummary;
  membership: CaseMembershipRecord | null;
  user: AppUser;
  organization: OrganizationRecord;
  closedSupervisorAccess: boolean;
};

export type ResolvedCaseAccess = CaseAccessContext & {
  access: AccessDecision;
};

export type CaseRecordRow = {
  id: string;
  organization_id: string;
  family_name: string;
  status: CaseStatus;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
  state_json: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  status: string;
  settings_json: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRow = {
  id: string;
  organization_id: string;
  external_identity_id: string | null;
  email: string;
  display_name: string;
  user_type: UserType;
  active: number;
  created_at: string;
  updated_at: string;
};

export type MembershipRow = {
  id: string;
  case_id: string;
  user_id: string;
  role: string;
  active: number;
  invited_by: string | null;
  invited_at: string | null;
  access_scope_json: string | null;
  created_at: string;
  updated_at: string;
  display_name?: string;
  email?: string;
  user_type?: string;
};

export type JournalRow = {
  id: string;
  case_id: string;
  author_user_id: string;
  audience: string;
  message: string;
  created_at: string;
  author_name?: string;
};

export type DocumentRow = {
  id: string;
  case_id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  uploaded_by_name?: string;
};

export type AuditRow = {
  id: string;
  organization_id: string;
  case_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  metadata_json: string | null;
  created_at: string;
  actor_name?: string;
};

export type InvitationRow = {
  id: string;
  organization_id: string;
  case_id: string | null;
  email: string;
  user_type: UserType;
  case_role: string | null;
  active: number;
  invite_token: string;
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type CaseBundle = CaseResponse & {
  organization: OrganizationRecord;
  user: AppUser;
  auditEvents?: AuditEventRecord[];
};

export type BootstrapSeedPayload = {
  organizationId: string;
  adminEmail: string;
  adminDisplayName: string;
};

export type CaseStateInput = Partial<CaseState>;

export type AuditEventInput = {
  organizationId: string;
  caseId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
};

export type InvitationResult = {
  invitation: InvitationRecord;
  inviteUrl: string;
};

export type InviteDeliveryResult = {
  status: "manual" | "sent" | "failed";
  channel: "manual" | "webhook";
  detail: string;
};

export type DocumentUploadInput = {
  organizationId: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
};
