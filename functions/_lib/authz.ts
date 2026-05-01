import type {
  AppUser,
  CaseMembershipRecord,
  JournalEntry,
  OrganizationRecord,
  CaseSummary,
} from "../../shared/types";
import type { AccessDecision, CaseAccessContext } from "./types";
import { getConfig } from "./config";

export function canAccessClosedCase(user: AppUser, membership: CaseMembershipRecord | null, organization: OrganizationRecord, envClosedSupervisorAccess: boolean): AccessDecision {
  if (user.userType === "org_admin") return { allowed: true };
  if (!membership || !membership.active) {
    return {
      allowed: false,
      reason: "case_membership_required",
      hint: "You must be an active member of this case to access it.",
    };
  }

  if (membership.role === "worker") {
    return {
      allowed: false,
      reason: "case_closed_worker_access_revoked",
      hint: "Worker access ends automatically when the CPS case is closed.",
    };
  }

  const orgAllowsSupervisor = envClosedSupervisorAccess || organization.settingsJson?.closedCaseSupervisorAccess === true;
  if (membership.role === "supervisor" && !orgAllowsSupervisor) {
    return {
      allowed: false,
      reason: "case_closed_supervisor_access_revoked",
      hint: "Supervisor access to closed cases is disabled by the current organization policy.",
    };
  }

  return { allowed: true };
}

export function canAccessCase(context: CaseAccessContext): AccessDecision {
  const { caseRecord, membership, user, organization, closedSupervisorAccess } = context;
  if (!user.active) {
    return {
      allowed: false,
      reason: "inactive_user",
      hint: "Your account is inactive. Contact your organization administrator.",
    };
  }

  if (user.userType === "org_admin") return { allowed: true };

  if (!membership || !membership.active) {
    return {
      allowed: false,
      reason: "case_membership_required",
      hint: "You are not an active member of this case.",
    };
  }

  if (caseRecord.status === "closed") {
    return canAccessClosedCase(user, membership, organization, closedSupervisorAccess);
  }

  return { allowed: true };
}

export function canEditCaseState(caseRecord: CaseSummary, membership: CaseMembershipRecord | null, user: AppUser) {
  if (user.userType === "org_admin") return true;
  if (!membership || !membership.active) return false;
  if (caseRecord.status === "closed") {
    return membership.role === "caregiver" || membership.role === "network_member";
  }
  return membership.role === "worker" || membership.role === "supervisor";
}

export function canCloseCase(caseRecord: CaseSummary, membership: CaseMembershipRecord | null, user: AppUser) {
  if (caseRecord.status === "closed") return false;
  if (!membership || !membership.active) return false;
  return membership.role === "supervisor" || membership.role === "worker";
}

export function canDeleteCase(caseRecord: CaseSummary, membership: CaseMembershipRecord | null, user: AppUser) {
  if (caseRecord.status === "closed") return false;
  if (user.userType === "org_admin") return true;
  if (!membership || !membership.active) return false;
  return membership.role === "supervisor" || membership.role === "worker";
}

export function canCreateCases(user: AppUser): AccessDecision {
  if (user.userType === "worker" || user.userType === "supervisor") {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "case_membership_required",
    hint: "Only practitioners (workers and supervisors) can create cases in this workspace.",
  };
}

export function canManageMemberships(membership: CaseMembershipRecord | null, user: AppUser) {
  if (user.userType === "org_admin") return true;
  return Boolean(membership && membership.active && (membership.role === "supervisor" || membership.role === "worker"));
}

export function canPostJournal(caseRecord: CaseSummary, membership: CaseMembershipRecord | null, user: AppUser) {
  if (user.userType === "org_admin") return true;
  if (!membership || !membership.active) return false;
  if (caseRecord.status === "closed" && membership.role === "worker") return false;
  if (caseRecord.status === "closed" && membership.role === "supervisor") {
    return false;
  }
  return true;
}

export function filterJournalForUser(entries: JournalEntry[], user: AppUser, membership: CaseMembershipRecord | null) {
  if (user.userType === "org_admin") return entries;
  const staffView = membership?.role === "worker" || membership?.role === "supervisor";
  if (staffView) return entries;
  return entries.filter((entry) => entry.audience !== "staff_only");
}

export function requireOrgAdmin(user: AppUser): AccessDecision {
  if (user.userType === "org_admin") return { allowed: true };
  return {
    allowed: false,
    reason: "org_admin_required",
    hint: "Only organization administrators can access this area.",
  };
}

export function requirePlatformOwner(permissions: { isPlatformOwner?: boolean }): AccessDecision {
  if (permissions.isPlatformOwner) return { allowed: true };
  return {
    allowed: false,
    reason: "platform_owner_required",
    hint: "Only the platform owner can access this area.",
  };
}

export function resolveClosedSupervisorAccess(organization: OrganizationRecord, env: { CASE_CLOSED_SUPERVISOR_ACCESS?: string }) {
  return organization.settingsJson?.closedCaseSupervisorAccess === true || String(env.CASE_CLOSED_SUPERVISOR_ACCESS || "0") === "1";
}

export function defaultAudienceForRole(user: AppUser, membership: CaseMembershipRecord | null) {
  if (user.userType === "org_admin") return "staff_only";
  if (membership?.role === "worker" || membership?.role === "supervisor") return "staff_only";
  return "all_members";
}

export function orgBranding(organization: OrganizationRecord, env: Parameters<typeof getConfig>[0]) {
  const config = getConfig(env);
  return {
    name: String(organization.settingsJson.brandingName || config.brandingName),
    logoUrl:
      typeof organization.settingsJson.brandingLogoUrl === "string"
        ? (organization.settingsJson.brandingLogoUrl as string)
        : config.brandingLogoUrl,
  };
}
