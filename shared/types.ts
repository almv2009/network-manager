export type UserType =
  | "org_admin"
  | "supervisor"
  | "worker"
  | "caregiver"
  | "network_member";

export type CaseStatus = "open" | "closed";

export type FamilyManagedHandoverStatus = "not_started" | "planned" | "active";

export type FamilyManagedHandoverLeadRole = "" | "caregiver" | "network_member";

export type CaseMembershipRole =
  | "supervisor"
  | "worker"
  | "caregiver"
  | "network_member";

export type CaseTabKey =
  | "case-status"
  | "timeline"
  | "network"
  | "planning"
  | "monitoring"
  | "journal"
  | "closure";

export type TimelineEntry = {
  id: string;
  date: string;
  title: string;
  helper: string;
};

export type NetworkMemberProfile = {
  id: string;
  userId?: string;
  name: string;
  relationship: string;
  role: string;
  availability: string;
  phone: string;
  email: string;
  reliability: number;
  confirmed: boolean;
};

export type NextNetworkStep = {
  id: string;
  text: string;
  completed: boolean;
};

export type PlanningPhaseKey = "immediate" | "intermediate" | "longTerm";

export type PlanningPhaseStatus = "Draft" | "Active" | "Being reviewed" | "Completed";

export type PlanningLayer = {
  heading: string;
  purpose: string;
  status: PlanningPhaseStatus;
  actions: string;
  members: string;
  reviewDate: string;
  promotedAt?: string;
};

export type RuleItem = {
  id: string;
  title: string;
  owner: string;
  backup: string;
  status: "On track" | "Needs review" | "At risk";
  note: string;
  checkMethod: string;
  breakdownPlan: string;
};

export type MonitoringItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type AppointmentItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
};

export type ActionItem = {
  id: string;
  title: string;
  owner: string;
  status: "Planned" | "In progress" | "Completed";
};

export type ChangeLogItem = {
  id: string;
  message: string;
  author: string;
  audience: string;
  timestamp: string;
};

export type JournalAudience = "all_members" | "staff_only" | "caregiver_network";

export type JournalEntry = {
  id: string;
  author: string;
  authorUserId?: string;
  audience: JournalAudience;
  message: string;
  timestamp: string;
};

export type DocumentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  uploadedBy: string;
  createdAt: string;
};

export type CaseState = {
  workspaceName: string;
  workspaceMode: string;
  currentPhaseLabel: string;
  postClosureContinuity: string;
  networkSelfManagementTools: string;
  familyManagedHandoverStatus: FamilyManagedHandoverStatus;
  familyManagedHandoverLeadMembershipId: string;
  familyManagedHandoverLeadName: string;
  familyManagedHandoverLeadRole: FamilyManagedHandoverLeadRole;
  familyManagedHandoverActivatedAt: string;
  familyManagedHandoverNotes: string;
  caregiverSummary: string;
  currentWatchpoint: string;
  planStability: number;
  immediateActionsText: string;
  riskStatement: string;
  safeguardingGoals: string;
  safeguardingScale: number;
  timelineEntries: TimelineEntry[];
  networkMembers: NetworkMemberProfile[];
  currentGapsText: string;
  nextNetworkStepsText: string;
  nextNetworkSteps: NextNetworkStep[];
  currentPlanningPhase: PlanningPhaseKey;
  immediatePlan: PlanningLayer;
  intermediatePlan: PlanningLayer;
  longTermPlan: PlanningLayer;
  rules: RuleItem[];
  monitoringItems: MonitoringItem[];
  fireDrillScenario: string;
  fireDrillDate: string;
  fireDrillParticipants: string;
  fireDrillRecordNotes: string;
  closureAlertNote: string;
  closureAppointments: AppointmentItem[];
  closureActionItems: ActionItem[];
  planAdaptationText: string;
  communicationMitigationText: string;
  urgentCpsContactText: string;
  closureJournalText: string;
  changeLog: ChangeLogItem[];
};

export type OrganizationRecord = {
  id: string;
  name: string;
  status: string;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AppUser = {
  id: string;
  organizationId: string;
  externalIdentityId: string | null;
  email: string;
  displayName: string;
  userType: UserType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CaseSummary = {
  id: string;
  organizationId: string;
  familyName: string;
  status: CaseStatus;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  membershipRole: CaseMembershipRole | null;
  accessState: "active" | "closed_readonly" | "closed_denied";
};

export type CaseMembershipRecord = {
  id: string;
  caseId: string;
  userId: string;
  role: CaseMembershipRole;
  active: boolean;
  invitedBy: string | null;
  invitedAt: string | null;
  accessScopeJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  displayName?: string;
  email?: string;
  userType?: UserType;
};

export type AuditEventRecord = {
  id: string;
  organizationId: string;
  caseId: string | null;
  actorUserId: string | null;
  eventType: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  actorDisplayName?: string;
};

export type InvitationRecord = {
  id: string;
  organizationId: string;
  caseId: string | null;
  email: string;
  userType: UserType;
  caseRole: CaseMembershipRole | null;
  active: boolean;
  inviteToken: string;
  invitedBy: string;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type SessionPayload = {
  user: AppUser;
  organization: OrganizationRecord;
  branding: {
    name: string;
    logoUrl: string | null;
  };
  license: OrganizationLicenseSummary;
  accessibleCases: CaseSummary[];
  permissions: {
    isOrgAdmin: boolean;
    canManageOrganization: boolean;
    isPlatformOwner?: boolean;
    canManagePlatform?: boolean;
  };
};

export type CaseResponse = {
  caseRecord: CaseSummary;
  state: CaseState;
  membership: CaseMembershipRecord | null;
  memberships: CaseMembershipRecord[];
  documents: DocumentItem[];
  journalPreview: JournalEntry[];
  permissions: {
    canEditCaseState: boolean;
    canPostJournal: boolean;
    canCloseCase: boolean;
    canManageMemberships: boolean;
    canUploadDocuments: boolean;
  };
};

export type AccessDeniedReason =
  | "auth_required"
  | "auth_not_configured"
  | "org_admin_required"
  | "platform_owner_required"
  | "organization_unlicensed"
  | "organization_archived"
  | "organization_membership_required"
  | "case_membership_required"
  | "case_closed_worker_access_revoked"
  | "case_closed_supervisor_access_revoked"
  | "inactive_user"
  | "user_not_provisioned";

export type DeploymentReadinessStatus = "ready" | "warning" | "missing";

export interface DeploymentReadinessCheck {
  key: string;
  label: string;
  required: boolean;
  status: DeploymentReadinessStatus;
  detail: string;
  missing: string[];
}

export interface DeploymentReadinessReport {
  generatedAt: string;
  ready: boolean;
  checks: DeploymentReadinessCheck[];
}

export const NETWORK_BILLING_PLAN_KEYS = [
  "team",
  "small_organization",
  "medium_organization",
  "large_organization",
] as const;
export type NetworkBillingPlanKey = (typeof NETWORK_BILLING_PLAN_KEYS)[number];

export const ALTERNATIVE_PAYMENT_METHODS = ["wise", "e_transfer", "cheque", "eft"] as const;
export type AlternativePaymentMethod = (typeof ALTERNATIVE_PAYMENT_METHODS)[number];

export const ALTERNATIVE_PAYMENT_REQUEST_STATUSES = [
  "submitted",
  "reviewing",
  "awaiting_payment",
  "paid",
  "activated",
  "rejected",
  "cancelled",
] as const;
export type AlternativePaymentRequestStatus = (typeof ALTERNATIVE_PAYMENT_REQUEST_STATUSES)[number];

export interface NetworkBillingPlanOption {
  key: NetworkBillingPlanKey;
  label: string;
  summary: string;
  bestFor: string;
  value: string;
  featureBullets: string[];
  availableForCheckout: boolean;
}

export interface SupportTicketPayload {
  fullName: string;
  email: string;
  organizationName?: string;
  summary: string;
  details: string;
  stepsToReproduce?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  currentPath?: string;
  activeTab?: string;
  screenshotName?: string;
  screenshotContentType?: string;
  screenshotDataUrl?: string;
  turnstileToken?: string;
}

export interface SupportTicketRecord extends SupportTicketPayload {
  id: string;
  createdAt: string;
  targetEmail: string;
  status: "submitted";
}

export interface SupportTicketResponse {
  message: string;
  supportEmail: string;
  mailtoUrl: string;
  ticket: SupportTicketRecord;
}

export interface BillingCheckoutPayload {
  fullName: string;
  organizationName: string;
  email: string;
  requestedPlan: NetworkBillingPlanKey;
  seatCount: number;
  turnstileToken?: string;
}

export interface BillingCheckoutResponse {
  url: string;
  message: string;
}

export interface AlternativePaymentRequestPayload {
  fullName: string;
  organizationName: string;
  email: string;
  requestedPlan: NetworkBillingPlanKey;
  seatCount: number;
  preferredPaymentMethod: AlternativePaymentMethod;
  country: string;
  region?: string;
  poNumber?: string;
  notes?: string;
  turnstileToken?: string;
}

export interface AlternativePaymentRequestRecord extends AlternativePaymentRequestPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
  planName: string;
  requestStatus: AlternativePaymentRequestStatus;
  adminNotes?: string;
  approvedAt?: string;
  approvedBy?: string;
  activationStartsAt?: string;
  activationEndsAt?: string;
  externalReference?: string;
  organizationId?: string;
  userId?: string;
}

export interface AlternativePaymentRequestResponse {
  request: AlternativePaymentRequestRecord;
  message: string;
}

export interface BillingEventRecord {
  id: string;
  createdAt: string;
  source: "stripe" | "manual";
  eventType: string;
  status: string;
  organizationName?: string;
  contactEmail?: string;
  planId?: string;
  planName?: string;
  stripeEventId?: string;
  stripeCheckoutSessionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  amountMinor?: number;
  currency?: string;
  metadataJson: Record<string, unknown>;
}

export interface OrganizationLicenseSummary {
  organizationId: string;
  organizationName: string;
  licensedSeatCount: number | null;
  licensedPlanName?: string;
  licenseStatus?: string;
  accessState: "licensed" | "trial" | "paused" | "unlicensed" | "archived";
  isLicensed: boolean;
  licenseGateMessage: string;
  activeUsers: number;
  pausedUsers: number;
  pendingInvitations: number;
  openCases: number;
  remainingSeats: number | null;
  remainingProvisioningSlots: number | null;
}

export interface PlatformOwnerOrganizationSummary extends OrganizationLicenseSummary {
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOwnerUserRecord extends AppUser {
  organizationName: string;
}

export interface PlatformOwnerOverview {
  organizations: PlatformOwnerOrganizationSummary[];
  users: PlatformOwnerUserRecord[];
  auditEvents: AuditEventRecord[];
  supportTickets: SupportTicketRecord[];
  billingEvents: BillingEventRecord[];
  alternativePaymentRequests: AlternativePaymentRequestRecord[];
  deploymentReadiness: DeploymentReadinessReport;
}
