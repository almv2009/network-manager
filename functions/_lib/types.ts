import type {
  AccessDeniedReason,
  AlternativePaymentRequestRecord,
  AppUser,
  AuditEventRecord,
  BillingEventRecord,
  CaseMembershipRecord,
  CaseResponse,
  CaseState,
  CaseSummary,
  CaseStatus,
  InvitationRecord,
  OrganizationRecord,
  SessionPayload,
  SupportTicketRecord,
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
  RESEND_API_KEY?: string;
  MAIL_FROM_ADDRESS?: string;
  MAIL_REPLY_TO_ADDRESS?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_REPLY_TO?: string;
  SUPPORT_EMAIL?: string;
  PLATFORM_OWNER_EMAILS?: string;
  ENABLE_ALTERNATIVE_PAYMENTS?: string;
  ALLOWED_ALTERNATIVE_PAYMENT_METHODS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_TEAM?: string;
  STRIPE_PRICE_ID_SMALL_ORGANIZATION?: string;
  STRIPE_PRICE_ID_MEDIUM_ORGANIZATION?: string;
  STRIPE_PRICE_ID_LARGE_ORGANIZATION?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
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
  | "organization_unlicensed"
  | "organization_archived"
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

export type LocalCredentialRow = {
  user_id: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
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

export type SupportTicketRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  full_name: string;
  email: string;
  organization_name: string | null;
  summary: string;
  details: string;
  steps_to_reproduce: string | null;
  expected_outcome: string | null;
  actual_outcome: string | null;
  current_path: string | null;
  active_tab: string | null;
  screenshot_name: string | null;
  screenshot_content_type: string | null;
  screenshot_data_url: string | null;
  target_email: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

export type AlternativePaymentRequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  organization_id: string | null;
  full_name: string;
  organization_name: string;
  email: string;
  plan_id: string;
  plan_name: string;
  seat_count: number;
  preferred_payment_method: string;
  country: string;
  region: string | null;
  po_number: string | null;
  notes: string | null;
  request_status: string;
  admin_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  activation_starts_at: string | null;
  activation_ends_at: string | null;
  external_reference: string | null;
};

export type BillingEventRow = {
  id: string;
  created_at: string;
  source: string;
  stripe_event_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  organization_name: string | null;
  contact_email: string | null;
  plan_id: string | null;
  plan_name: string | null;
  amount_minor: number | null;
  currency: string | null;
  event_type: string;
  status: string;
  metadata_json: string | null;
  user_id: string | null;
  organization_id: string | null;
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
  channel: "manual" | "webhook" | "resend";
  detail: string;
};

export type DocumentUploadInput = {
  organizationId: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
};
