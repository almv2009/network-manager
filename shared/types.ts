export type UserType =
  | "org_admin"
  | "supervisor"
  | "worker"
  | "caregiver"
  | "network_member";

export type CaseStatus = "open" | "closed";

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
  accessibleCases: CaseSummary[];
  permissions: {
    isOrgAdmin: boolean;
    canManageOrganization: boolean;
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
  | "organization_membership_required"
  | "case_membership_required"
  | "case_closed_worker_access_revoked"
  | "case_closed_supervisor_access_revoked"
  | "inactive_user"
  | "user_not_provisioned";
