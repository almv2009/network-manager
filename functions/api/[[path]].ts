import { ALTERNATIVE_PAYMENT_REQUEST_STATUSES } from "../../shared/types";
import type { AlternativePaymentRequestStatus, CaseMembershipRole, CaseState, JournalAudience, UserType } from "../../shared/types";
import { audit } from "../_lib/audit";
import {
  canAccessCase,
  canCloseCase,
  canCreateCases,
  canDeleteCase,
  canEditCaseState,
  canManageMemberships,
  canPostJournal,
  defaultAudienceForRole,
  filterJournalForUser,
  orgBranding,
  requireOrgAdmin,
  requirePlatformOwner,
  resolveClosedSupervisorAccess,
} from "../_lib/authz";
import { buildDocumentStorageKey, canUploadDocuments, validateDocumentFile } from "../_lib/documents";
import {
  createCaseRecord,
  createOrganization,
  deactivateInvitation,
  deleteOrganizationRecord,
  deleteCaseDocumentRecord,
  deleteCaseRecord,
  createDocumentRecord,
  createInvitation,
  createJournalEntry,
  countActiveOrganizationUsersByType,
  ensureCaseMembership,
  findOrganizationUserByEmail,
  getInvitationById,
  getAccessibleCases,
  getAlternativePaymentRequestById,
  getCaseDocument,
  getOrganizationById,
  getOrganizationLicenseSummary,
  getCaseRow,
  getUserById,
  getMembershipRow,
  findOrganizationByName,
  listAllUsersForOwner,
  listAuditEvents,
  listAuditEventsForOwner,
  listCaseDocuments,
  listCaseMemberships,
  listInvitations,
  listJournalEntries,
  listOrganizationsForOwner,
  listOrganizationUsers,
  mapCaseState,
  mapCaseSummary,
  revokeInvitation,
  softDeleteUserAccount,
  updateOrganizationStatus,
  updateOrganizationSettings,
  updateCaseState,
  updateMembership,
  updateUserActiveState,
  closeCase,
} from "../_lib/db";
import {
  createPublicStripeCheckout,
  getAllowedAlternativePaymentMethods,
  getNetworkBillingPlans,
  handleStripeWebhook,
  isAlternativePaymentsEnabled,
  isStripeConfigured,
  listAdminAlternativePaymentRequests,
  listAdminBillingEvents,
  listAdminSupportTickets,
  parseAlternativePaymentRequestPayload,
  parseBillingCheckoutPayload,
  parseSupportTicketPayload,
  submitAlternativePaymentRequest,
  submitSupportTicket,
  updateAdminAlternativePaymentRequest,
} from "../_lib/commercial";
import { getDeploymentReadiness } from "../_lib/config";
import { deliverInvitationEmail } from "../_lib/invite-email";
import { errorJson, json, methodNotAllowed } from "../_lib/responses";
import { logOperationalError, logSecurityEvent } from "../_lib/security";
import { resolveSession } from "../_lib/session";
import { bindTenantRuntimeContext, resolveTenantRuntimeForRequest } from "../_lib/tenant-runtime";
import { isTenantOrganizationAllowed } from "../_lib/tenancy";
import { verifyTurnstileIfEnforced } from "../_lib/turnstile";
import type { AppContext, MembershipRow } from "../_lib/types";

function pathSegments(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  return pathname.split("/").filter(Boolean);
}

async function readBody<T>(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return {} as T;
  return (await request.json()) as T;
}

function requestBodyExceedsBytes(request: Request, maxBytes: number) {
  const raw = String(request.headers.get("content-length") || "").trim();
  if (!raw) return false;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return false;
  return parsed > maxBytes;
}

function assertOrganizationMatch(requestedOrgId: string, actualOrgId: string) {
  return requestedOrgId === actualOrgId;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function minimizeSessionUser(user: NonNullable<Awaited<ReturnType<typeof resolveSession>>>["user"]) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    userType: user.userType,
    active: user.active,
  };
}

function minimizeSessionOrganization(session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  return {
    id: session.organization.id,
    name: session.organization.name,
    status: session.organization.status,
  };
}

function minimizeAccessibleCase(caseRecord: Awaited<ReturnType<typeof getAccessibleCases>>[number]) {
  return {
    id: caseRecord.id,
    organizationId: caseRecord.organizationId,
    familyName: caseRecord.familyName,
    status: caseRecord.status,
    createdBy: caseRecord.createdBy,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
    membershipRole: caseRecord.membershipRole,
    accessState: caseRecord.accessState,
  };
}

function minimizeDocument(document: Awaited<ReturnType<typeof listCaseDocuments>>[number]) {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt,
  };
}

function minimizeAdminUser(user: Awaited<ReturnType<typeof listOrganizationUsers>>[number]) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    displayName: user.displayName,
    userType: user.userType,
    active: user.active,
    createdAt: user.createdAt,
  };
}

function minimizeOwnerOrganization(
  organization: Awaited<ReturnType<typeof listOrganizationsForOwner>>[number],
) {
  return {
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    licensedSeatCount: organization.licensedSeatCount,
    licensedPlanName: organization.licensedPlanName,
    licenseStatus: organization.licenseStatus,
    accessState: organization.accessState,
    isLicensed: organization.isLicensed,
    licenseGateMessage: organization.licenseGateMessage,
    activeUsers: organization.activeUsers,
    pausedUsers: organization.pausedUsers,
    pendingInvitations: organization.pendingInvitations,
    openCases: organization.openCases,
    remainingSeats: organization.remainingSeats,
    remainingProvisioningSlots: organization.remainingProvisioningSlots,
    status: organization.status,
  };
}

function minimizeOwnerUser(user: Awaited<ReturnType<typeof listAllUsersForOwner>>[number]) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    displayName: user.displayName,
    userType: user.userType,
    active: user.active,
    createdAt: user.createdAt,
    organizationName: user.organizationName,
  };
}

function minimizeAuditEvent(event: Awaited<ReturnType<typeof listAuditEventsForOwner>>[number]) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    caseId: event.caseId,
    eventType: event.eventType,
    createdAt: event.createdAt,
    actorDisplayName: event.actorDisplayName,
  };
}

function minimizeSupportTicket(ticket: Awaited<ReturnType<typeof listAdminSupportTickets>>[number]) {
  return {
    id: ticket.id,
    createdAt: ticket.createdAt,
    status: ticket.status,
    fullName: ticket.fullName,
    email: ticket.email,
    organizationName: ticket.organizationName,
    summary: ticket.summary,
    details: ticket.details,
    currentPath: ticket.currentPath,
    activeTab: ticket.activeTab,
  };
}

function minimizeBillingEvent(event: Awaited<ReturnType<typeof listAdminBillingEvents>>[number]) {
  return {
    id: event.id,
    createdAt: event.createdAt,
    source: event.source,
    eventType: event.eventType,
    status: event.status,
    organizationName: event.organizationName,
    contactEmail: event.contactEmail,
    planName: event.planName,
    amountMinor: event.amountMinor,
    currency: event.currency,
  };
}

function minimizeOwnerAlternativePaymentRequest(
  request: Awaited<ReturnType<typeof listAdminAlternativePaymentRequests>>[number],
) {
  return {
    id: request.id,
    organizationName: request.organizationName,
    fullName: request.fullName,
    email: request.email,
    planName: request.planName,
    seatCount: request.seatCount,
    requestStatus: request.requestStatus,
    country: request.country,
    createdAt: request.createdAt,
  };
}

function minimizeAdminAlternativePaymentRequest(
  request: Awaited<ReturnType<typeof listAdminAlternativePaymentRequests>>[number],
) {
  return {
    id: request.id,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    fullName: request.fullName,
    organizationName: request.organizationName,
    email: request.email,
    planName: request.planName,
    seatCount: request.seatCount,
    preferredPaymentMethod: request.preferredPaymentMethod,
    country: request.country,
    requestStatus: request.requestStatus,
    adminNotes: request.adminNotes,
    externalReference: request.externalReference,
  };
}

async function denyWithAudit(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, status: number, reason: string, hint: string, extra: Record<string, unknown> = {}) {
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    eventType: "access_denied",
    metadata: {
      reason,
      hint,
      path: new URL(context.request.url).pathname,
      ...extra,
    },
  });
  logSecurityEvent(context.request, "access_denied", {
    outcome: "blocked",
    status,
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    reason,
    ...extra,
  });
  return errorJson(status, reason, hint);
}

async function handleMe(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const license = await loadCurrentOrganizationSummary(context, session.organization.id);
  if (!license) {
    return errorJson(404, "not_found", "Organization not found.");
  }
  const accessibleCases = license.isLicensed
    ? await getAccessibleCases(
        context.env.DB,
        session.organization.id,
        session.user.id,
        session.user.userType,
      )
    : [];

  return json({
    ok: true,
    user: minimizeSessionUser(session.user),
    organization: minimizeSessionOrganization(session),
    branding: orgBranding(session.organization, context.env),
    license,
    accessibleCases: accessibleCases.map(minimizeAccessibleCase),
    permissions: session.permissions,
  });
}

async function loadCurrentOrganizationSummary(context: AppContext, organizationId: string) {
  const organization = await getOrganizationById(context.env.DB, organizationId);
  if (!organization) return null;
  return getOrganizationLicenseSummary(context.env.DB, organization);
}

async function requireLicensedOrganizationAccess(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  extra: Record<string, unknown> = {},
) {
  const summary = await loadCurrentOrganizationSummary(context, session.organization.id);
  if (!summary) {
    return {
      summary: null,
      error: errorJson(404, "not_found", "Organization not found."),
    };
  }
  if (summary.isLicensed) {
    return {
      summary,
      error: null,
    };
  }
  const reason = summary.accessState === "archived" ? "organization_archived" : "organization_unlicensed";
  const error = await denyWithAudit(
    context,
    session,
    403,
    reason,
    summary.licenseGateMessage,
    {
      organizationId: session.organization.id,
      accessState: summary.accessState,
      ...extra,
    },
  );
  return {
    summary,
    error,
  };
}

async function handleOrganizationCases(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, segments: string[]) {
  const requestedOrgId = segments[1];
  if (!requestedOrgId || segments[2] !== "cases") {
    return errorJson(404, "not_found", "Unknown organization route.");
  }
  if (!assertOrganizationMatch(requestedOrgId, session.organization.id)) {
    return denyWithAudit(
      context,
      session,
      403,
      "organization_membership_required",
      "You can only access cases for your own organization.",
    );
  }

  if (context.request.method === "GET") {
    const licensed = await requireLicensedOrganizationAccess(context, session, { route: "organization_cases_list" });
    if (licensed.error) return licensed.error;
    const cases = await getAccessibleCases(context.env.DB, session.organization.id, session.user.id, session.user.userType);
    return json({ ok: true, cases });
  }

  if (context.request.method === "POST") {
    const decision = canCreateCases(session.user);
    if (!decision.allowed) {
      return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
    }
    const licensed = await requireLicensedOrganizationAccess(context, session, { route: "organization_cases_create" });
    if (licensed.error) return licensed.error;

    const body = await readBody<{ familyName?: string; state?: Record<string, unknown> }>(context.request);
    const familyName = String(body.familyName || "").trim();
    if (!familyName) {
      return errorJson(400, "bad_request", "Family name is required.");
    }

    const created = await createCaseRecord(context.env.DB, {
      organizationId: session.organization.id,
      familyName,
      createdBy: session.user.id,
      state: body.state as Partial<CaseState> | undefined,
    });
    if (!created) {
      return errorJson(500, "bad_request", "Case could not be created.");
    }

    let caseRecord = mapCaseSummary(created);
    if (session.user.userType === "worker" || session.user.userType === "supervisor") {
      await ensureCaseMembership(context.env.DB, {
        caseId: created.id,
        userId: session.user.id,
        role: session.user.userType,
        invitedBy: session.user.id,
        accessScopeJson: {
          visibility: "creator_private",
          creatorUserId: session.user.id,
        },
      });
      const creatorCases = await getAccessibleCases(
        context.env.DB,
        session.organization.id,
        session.user.id,
        session.user.userType,
      );
      caseRecord = creatorCases.find((candidate) => candidate.id === created.id) || caseRecord;
    }

    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId: created.id,
      actorUserId: session.user.id,
      eventType: "case_created",
      metadata: {
        familyName,
        creatorUserType: session.user.userType,
        visibility: "creator_private",
      },
    });

    return json({
      ok: true,
      caseRecord,
      state: mapCaseState(created),
    });
  }

  return methodNotAllowed(["GET", "POST"]);
}

async function loadCaseAccess(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const caseRow = await getCaseRow(context.env.DB, caseId);
  if (!caseRow) return { error: errorJson(404, "not_found", "Case not found.") };
  if (caseRow.organization_id !== session.organization.id) {
    return {
      error: await denyWithAudit(
        context,
        session,
        403,
        "organization_membership_required",
        "You cannot access a case outside your organization.",
        { caseId },
      ),
    };
  }
  const licensed = await requireLicensedOrganizationAccess(context, session, { caseId, route: "case_access" });
  if (licensed.error) {
    return {
      error: licensed.error,
    };
  }
  const membership = session.user.userType === "org_admin" ? null : await getMembershipRow(context.env.DB, caseId, session.user.id);
  const caseRecord = mapCaseSummary(caseRow, membership ? ({ ...membership } as MembershipRow) : null);
  const access = canAccessCase({
    caseRecord,
    membership: membership ? {
      id: membership.id,
      caseId: membership.case_id,
      userId: membership.user_id,
      role: membership.role as CaseMembershipRole,
      active: membership.active === 1,
      invitedBy: membership.invited_by,
      invitedAt: membership.invited_at,
      accessScopeJson: membership.access_scope_json ? JSON.parse(membership.access_scope_json) : {},
      createdAt: membership.created_at,
      updatedAt: membership.updated_at,
    } : null,
    user: session.user,
    organization: session.organization,
    closedSupervisorAccess: resolveClosedSupervisorAccess(session.organization, context.env),
  });

  if (!access.allowed) {
    return {
      error: await denyWithAudit(
        context,
        session,
        403,
        access.reason || "case_membership_required",
        access.hint || "You do not have access to this case.",
        { caseId, caseStatus: caseRecord.status, membershipRole: membership?.role || null },
      ),
    };
  }

  return {
    caseRow,
    caseRecord,
    membership,
  };
}

async function handleCaseGet(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;

  const memberships = await listCaseMemberships(context.env.DB, caseId);
  const journalEntries = filterJournalForUser(await listJournalEntries(context.env.DB, caseId), session.user, loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null);
  const documents = await listCaseDocuments(context.env.DB, caseId);

  return json({
    ok: true,
    caseRecord: loaded.caseRecord,
    state: mapCaseState(loaded.caseRow),
    membership: loaded.membership ? {
      id: loaded.membership.id,
      caseId: loaded.membership.case_id,
      userId: loaded.membership.user_id,
      role: loaded.membership.role as CaseMembershipRole,
      active: loaded.membership.active === 1,
      invitedBy: loaded.membership.invited_by,
      invitedAt: loaded.membership.invited_at,
      accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
      createdAt: loaded.membership.created_at,
      updatedAt: loaded.membership.updated_at,
    } : null,
    memberships,
    documents: documents.map(minimizeDocument),
    journalPreview: journalEntries.slice(0, 5),
    permissions: {
      canEditCaseState: canEditCaseState(loaded.caseRecord, loaded.membership ? {
        id: loaded.membership.id,
        caseId: loaded.membership.case_id,
        userId: loaded.membership.user_id,
        role: loaded.membership.role as CaseMembershipRole,
        active: loaded.membership.active === 1,
        invitedBy: loaded.membership.invited_by,
        invitedAt: loaded.membership.invited_at,
        accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
        createdAt: loaded.membership.created_at,
        updatedAt: loaded.membership.updated_at,
      } : null, session.user),
      canPostJournal: canPostJournal(loaded.caseRecord, loaded.membership ? {
        id: loaded.membership.id,
        caseId: loaded.membership.case_id,
        userId: loaded.membership.user_id,
        role: loaded.membership.role as CaseMembershipRole,
        active: loaded.membership.active === 1,
        invitedBy: loaded.membership.invited_by,
        invitedAt: loaded.membership.invited_at,
        accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
        createdAt: loaded.membership.created_at,
        updatedAt: loaded.membership.updated_at,
      } : null, session.user),
      canUploadDocuments: canUploadDocuments(loaded.caseRecord, loaded.membership ? {
        id: loaded.membership.id,
        caseId: loaded.membership.case_id,
        userId: loaded.membership.user_id,
        role: loaded.membership.role as CaseMembershipRole,
        active: loaded.membership.active === 1,
        invitedBy: loaded.membership.invited_by,
        invitedAt: loaded.membership.invited_at,
        accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
        createdAt: loaded.membership.created_at,
        updatedAt: loaded.membership.updated_at,
      } : null, session.user),
      canCloseCase: canCloseCase(loaded.caseRecord, loaded.membership ? {
        id: loaded.membership.id,
        caseId: loaded.membership.case_id,
        userId: loaded.membership.user_id,
        role: loaded.membership.role as CaseMembershipRole,
        active: loaded.membership.active === 1,
        invitedBy: loaded.membership.invited_by,
        invitedAt: loaded.membership.invited_at,
        accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
        createdAt: loaded.membership.created_at,
        updatedAt: loaded.membership.updated_at,
      } : null, session.user),
      canManageMemberships: canManageMemberships(loaded.membership ? {
        id: loaded.membership.id,
        caseId: loaded.membership.case_id,
        userId: loaded.membership.user_id,
        role: loaded.membership.role as CaseMembershipRole,
        active: loaded.membership.active === 1,
        invitedBy: loaded.membership.invited_by,
        invitedAt: loaded.membership.invited_at,
        accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
        createdAt: loaded.membership.created_at,
        updatedAt: loaded.membership.updated_at,
      } : null, session.user),
    },
  });
}

async function handleCasePatch(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;
  const membershipRecord = loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null;
  if (!canEditCaseState(loaded.caseRecord, membershipRecord, session.user)) {
    return denyWithAudit(
      context,
      session,
      403,
      "case_membership_required",
      "You cannot edit case state for this case.",
      { caseId },
    );
  }

  const body = await readBody<{ familyName?: string; state?: Record<string, unknown> }>(context.request);
  const currentState = mapCaseState(loaded.caseRow);
  const nextState = {
    ...currentState,
    ...(body.state || {}),
  };
  const updated = await updateCaseState(context.env.DB, caseId, body.familyName || null, nextState);
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId,
    actorUserId: session.user.id,
    eventType: "case_updated",
    metadata: { familyName: body.familyName || loaded.caseRecord.familyName },
  });
  return json({
    ok: true,
    caseRecord: updated ? mapCaseSummary(updated, loaded.membership ? ({ ...loaded.membership } as MembershipRow) : null) : loaded.caseRecord,
    state: updated ? mapCaseState(updated) : nextState,
  });
}

async function handleCaseClose(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;
  const membershipRecord = loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null;
  if (!canCloseCase(loaded.caseRecord, membershipRecord, session.user)) {
    return denyWithAudit(context, session, 403, "case_membership_required", "You cannot close this case.", { caseId });
  }
  const body = await readBody<{ closureNote?: string }>(context.request);
  const closed = await closeCase(context.env.DB, caseId, body.closureNote);
  if (!closed) return errorJson(404, "not_found", "Case not found.");
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId,
    actorUserId: session.user.id,
    eventType: "case_closed",
    metadata: { closureNote: body.closureNote || "" },
  });
  return json({
    ok: true,
    caseRecord: mapCaseSummary(closed, loaded.membership ? ({ ...loaded.membership } as MembershipRow) : null),
    state: mapCaseState(closed),
  });
}

async function handleCaseDelete(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;
  const membershipRecord = loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null;
  if (!canDeleteCase(loaded.caseRecord, membershipRecord, session.user)) {
    return denyWithAudit(context, session, 403, "case_membership_required", "You cannot delete this case file.", { caseId });
  }

  const documents = await listCaseDocuments(context.env.DB, caseId);
  if (context.env.DOCUMENTS_BUCKET && typeof context.env.DOCUMENTS_BUCKET.delete === "function" && documents.length) {
    try {
      await context.env.DOCUMENTS_BUCKET.delete(documents.map((document) => document.storageKey));
    } catch (deleteError) {
      logOperationalError(context.request, "case_document_delete_failed", deleteError, {
        caseId,
        documentCount: documents.length,
      });
    }
  }

  const deleted = await deleteCaseRecord(context.env.DB, caseId);
  if (!deleted) {
    return errorJson(404, "not_found", "Case not found.");
  }
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId,
    actorUserId: session.user.id,
    eventType: "case_deleted",
    metadata: {
      familyName: loaded.caseRecord.familyName,
      deletedDocumentCount: documents.length,
    },
  });
  return json({ ok: true, caseId });
}

async function handleCaseJournal(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;
  const membershipRecord = loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null;

  if (context.request.method === "GET") {
    const entries = filterJournalForUser(await listJournalEntries(context.env.DB, caseId), session.user, membershipRecord);
    return json({ ok: true, entries });
  }

  if (!canPostJournal(loaded.caseRecord, membershipRecord, session.user)) {
    return denyWithAudit(context, session, 403, "case_membership_required", "You cannot post to the journal for this case.", { caseId });
  }

  const body = await readBody<{ audience?: JournalAudience; message?: string }>(context.request);
  const message = String(body.message || "").trim();
  if (!message) {
    return errorJson(400, "bad_request", "Journal message is required.");
  }
  const requestedAudience = body.audience || defaultAudienceForRole(session.user, membershipRecord);
  const audience =
    membershipRecord && (membershipRecord.role === "caregiver" || membershipRecord.role === "network_member")
      ? requestedAudience === "staff_only"
        ? "all_members"
        : requestedAudience
      : requestedAudience;

  const entry = await createJournalEntry(context.env.DB, {
    caseId,
    authorUserId: session.user.id,
    audience,
    message,
  });
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId,
    actorUserId: session.user.id,
    eventType: "journal_entry_created",
    metadata: { audience },
  });
  return json({ ok: true, entry });
}

async function handleCaseDocuments(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  caseId: string,
  documentId?: string,
) {
  const loaded = await loadCaseAccess(context, session, caseId);
  if ("error" in loaded) return loaded.error;
  const membershipRecord = loaded.membership ? {
    id: loaded.membership.id,
    caseId: loaded.membership.case_id,
    userId: loaded.membership.user_id,
    role: loaded.membership.role as CaseMembershipRole,
    active: loaded.membership.active === 1,
    invitedBy: loaded.membership.invited_by,
    invitedAt: loaded.membership.invited_at,
    accessScopeJson: loaded.membership.access_scope_json ? JSON.parse(loaded.membership.access_scope_json) : {},
    createdAt: loaded.membership.created_at,
    updatedAt: loaded.membership.updated_at,
  } : null;

  if (documentId && context.request.method === "GET") {
    const document = await getCaseDocument(context.env.DB, caseId, documentId);
    if (!document) {
      return errorJson(404, "not_found", "Document not found.");
    }
    if (!context.env.DOCUMENTS_BUCKET) {
      return errorJson(503, "bad_request", "Document storage is not configured for this deployment.");
    }
    const stored = await context.env.DOCUMENTS_BUCKET.get(document.storageKey);
    if (!stored) {
      return errorJson(404, "not_found", "Stored document file not found.");
    }
    const safeFileName = document.fileName.replace(/"/g, "");
    return new Response(await stored.arrayBuffer(), {
      headers: {
        "content-type": document.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename="${safeFileName}"`,
        "cache-control": "private, no-store",
      },
    });
  }

  if (context.request.method === "GET") {
    const documents = await listCaseDocuments(context.env.DB, caseId);
    return json({ ok: true, documents: documents.map(minimizeDocument) });
  }

  if (documentId && context.request.method === "DELETE") {
    if (!canUploadDocuments(loaded.caseRecord, membershipRecord, session.user)) {
      return denyWithAudit(context, session, 403, "case_membership_required", "You cannot delete documents for this case.", {
        caseId,
      });
    }
    let document;
    try {
      document = await getCaseDocument(context.env.DB, caseId, documentId);
    } catch (queryError) {
      logOperationalError(context.request, "case_document_lookup_failed", queryError, {
        caseId,
        documentId,
      });
      return errorJson(503, "bad_request", "Document metadata storage is unavailable for this deployment.");
    }
    if (!document) {
      return errorJson(404, "not_found", "Document not found.");
    }
    let storageDeleteFailed = false;
    if (context.env.DOCUMENTS_BUCKET && typeof context.env.DOCUMENTS_BUCKET.delete === "function") {
      try {
        await context.env.DOCUMENTS_BUCKET.delete(document.storageKey);
      } catch (deleteError) {
        logOperationalError(context.request, "case_document_delete_failed", deleteError, {
          caseId,
          documentId,
          storageKey: document.storageKey,
        });
        storageDeleteFailed = true;
      }
    }
    let deleted;
    try {
      deleted = await deleteCaseDocumentRecord(context.env.DB, caseId, documentId);
    } catch (metadataDeleteError) {
      logOperationalError(context.request, "case_document_metadata_delete_failed", metadataDeleteError, {
        caseId,
        documentId,
      });
      return errorJson(503, "bad_request", "Document metadata storage is unavailable for this deployment.");
    }
    if (!deleted) {
      return errorJson(404, "not_found", "Document not found.");
    }
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId,
      actorUserId: session.user.id,
      eventType: "document_deleted",
      metadata: {
        documentId: deleted.id,
        fileName: deleted.fileName,
      },
    });
    return json({
      ok: true,
      documentId: deleted.id,
      storageDeleteFailed,
    });
  }

  if (!canUploadDocuments(loaded.caseRecord, membershipRecord, session.user)) {
    return denyWithAudit(context, session, 403, "case_membership_required", "You cannot upload documents for this case.", {
      caseId,
    });
  }
  if (!context.env.DOCUMENTS_BUCKET) {
    return errorJson(503, "bad_request", "Document storage is not configured for this deployment.");
  }

  const formData = await context.request.formData();
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return errorJson(400, "bad_request", "Upload payload must include a file field.");
  }
  const validation = validateDocumentFile(context.env, fileValue);
  if (!validation.ok) {
    return errorJson(400, validation.error, validation.hint);
  }

  const storageKey = buildDocumentStorageKey({
    organizationId: session.organization.id,
    caseId,
    fileName: fileValue.name,
    mimeType: fileValue.type || "application/octet-stream",
    uploadedBy: session.user.id,
  });
  await context.env.DOCUMENTS_BUCKET.put(storageKey, fileValue.stream(), {
    httpMetadata: {
      contentType: fileValue.type || "application/octet-stream",
    },
  });
  const document = await createDocumentRecord(context.env.DB, {
    caseId,
    storageKey,
    fileName: fileValue.name,
    mimeType: fileValue.type || "application/octet-stream",
    uploadedBy: session.user.id,
  });
  if (!document) {
    logOperationalError(context.request, "document_record_create_failed", new Error("document_record_missing"), {
      outcome: "failed",
      caseId,
    });
    return errorJson(500, "request_failed", "The document metadata could not be saved.");
  }
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId,
    actorUserId: session.user.id,
    eventType: "document_uploaded",
    metadata: {
      fileName: fileValue.name,
      mimeType: fileValue.type || "application/octet-stream",
      storageKey,
      size: fileValue.size,
    },
  });
  return json({ ok: true, document: minimizeDocument(document) });
}

async function handleAdminUsers(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, segments: string[]) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }

  if (segments.length === 2 && context.request.method === "GET") {
    const users = await listOrganizationUsers(context.env.DB, session.organization.id);
    const invitations = await listInvitations(context.env.DB, session.organization.id);
    const scopedUsers = users.filter((user) => user.organizationId === session.organization.id);
    const scopedInvitations = invitations.filter((invitation) => invitation.organizationId === session.organization.id);
    return json({ ok: true, users: scopedUsers.map(minimizeAdminUser), invitations: scopedInvitations });
  }

  if (segments.length === 3 && context.request.method === "PATCH") {
    const body = await readBody<{ active?: boolean }>(context.request);
    if (typeof body.active !== "boolean") {
      return errorJson(400, "bad_request", "Patch payload must include an active boolean.");
    }
    const targetUser = await getUserById(context.env.DB, segments[2]);
    if (!targetUser || targetUser.organizationId !== session.organization.id) {
      return errorJson(404, "not_found", "User not found.");
    }
    if (targetUser.id === session.user.id && body.active === false) {
      return errorJson(400, "bad_request", "Use another organization admin to pause your own account.");
    }
    if (targetUser.userType === "org_admin" && body.active === false && targetUser.active) {
      const activeAdminCount = await countActiveOrganizationUsersByType(context.env.DB, session.organization.id, "org_admin");
      if (activeAdminCount <= 1) {
        return errorJson(400, "bad_request", "At least one active organization admin must remain.");
      }
    }
    if (body.active === true && !targetUser.active) {
      const licenseSummary = await loadCurrentOrganizationSummary(context, session.organization.id);
      if (!licenseSummary) {
        return errorJson(404, "not_found", "Organization not found.");
      }
      if (!licenseSummary.isLicensed) {
        return errorJson(403, "organization_unlicensed", licenseSummary.licenseGateMessage);
      }
      if ((licenseSummary.remainingSeats ?? 0) < 1) {
        return errorJson(
          400,
          "bad_request",
          "No licensed seats are currently available. Increase the purchased seat count or free a seat first.",
        );
      }
    }
    const updated = await updateUserActiveState(context.env.DB, segments[2], body.active);
    if (!updated) return errorJson(404, "not_found", "User not found.");
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      eventType: "user_access_changed",
      metadata: { targetUserId: updated.id, active: updated.active },
    });
    return json({ ok: true, user: minimizeAdminUser(updated) });
  }

  if (segments.length === 3 && context.request.method === "DELETE") {
    const targetUser = await getUserById(context.env.DB, segments[2]);
    if (!targetUser || targetUser.organizationId !== session.organization.id) {
      return errorJson(404, "not_found", "User not found.");
    }
    if (targetUser.id === session.user.id) {
      return errorJson(400, "bad_request", "Use another organization admin to delete your own account.");
    }
    if (targetUser.userType === "org_admin" && targetUser.active) {
      const activeAdminCount = await countActiveOrganizationUsersByType(context.env.DB, session.organization.id, "org_admin");
      if (activeAdminCount <= 1) {
        return errorJson(400, "bad_request", "At least one active organization admin must remain.");
      }
    }
    const deleted = await softDeleteUserAccount(context.env.DB, session.organization.id, targetUser.id);
    if (!deleted) return errorJson(404, "not_found", "User not found.");
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      eventType: "user_deleted",
      metadata: { targetUserId: deleted.id },
    });
    return json({ ok: true, user: minimizeAdminUser(deleted) });
  }

  return errorJson(404, "not_found", "Unknown admin users route.");
}

async function handlePractitionerInvitations(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  segments: string[],
) {
  const isPractitioner = session.user.userType === "worker" || session.user.userType === "supervisor";
  if (!isPractitioner) {
    return denyWithAudit(
      context,
      session,
      403,
      "case_membership_required",
      "Only practitioners can access invitation tracking for this view.",
    );
  }

  if (context.request.method === "GET" && segments.length === 2) {
    const invitations = await listInvitations(context.env.DB, session.organization.id);
    const scopedInvitations = invitations.filter((invitation) => invitation.invitedBy === session.user.id);
    const accessibleCases = await getAccessibleCases(
      context.env.DB,
      session.organization.id,
      session.user.id,
      session.user.userType,
    );
    const casesById = new Map(accessibleCases.map((caseRecord) => [caseRecord.id, caseRecord.familyName]));
    return json({
      ok: true,
      invitations: scopedInvitations.map((invitation) => ({
        ...invitation,
        caseFamilyName: invitation.caseId ? casesById.get(invitation.caseId) || null : null,
      })),
    });
  }

  if (context.request.method === "DELETE" && segments.length === 3) {
    const invitationId = String(segments[2] || "").trim();
    if (!invitationId) {
      return errorJson(400, "bad_request", "Invitation id is required.");
    }
    const invitation = await getInvitationById(context.env.DB, session.organization.id, invitationId);
    if (!invitation) {
      return errorJson(404, "not_found", "Invitation not found.");
    }
    if (invitation.invitedBy !== session.user.id) {
      return denyWithAudit(
        context,
        session,
        403,
        "case_membership_required",
        "You can only manage invitations that you sent.",
        { invitationId },
      );
    }
    const familyInvite =
      invitation.userType === "caregiver" || invitation.userType === "network_member";
    if (!familyInvite) {
      return errorJson(
        400,
        "bad_request",
        "Practitioner invitation management is limited to caregiver and network-member invitations.",
      );
    }

    if (!invitation.acceptedAt) {
      if (!invitation.active || invitation.revokedAt) {
        return json({ ok: true, action: "invite_already_inactive", invitation });
      }
      const revoked = await revokeInvitation(context.env.DB, session.organization.id, invitationId);
      if (!revoked) {
        return errorJson(404, "not_found", "Invitation not found.");
      }
      await audit(context.env.DB, {
        organizationId: session.organization.id,
        caseId: revoked.caseId || null,
        actorUserId: session.user.id,
        eventType: "invite_revoked",
        metadata: {
          invitationId: revoked.id,
          email: revoked.email,
          userType: revoked.userType,
          caseRole: revoked.caseRole,
          managerType: "practitioner",
        },
      });
      return json({ ok: true, action: "invite_revoked", invitation: revoked });
    }

    let removedMembershipId: string | null = null;
    if (invitation.caseId) {
      const invitedUser = await findOrganizationUserByEmail(
        context.env.DB,
        session.organization.id,
        invitation.email,
      );
      if (invitedUser) {
        const membership = await getMembershipRow(context.env.DB, invitation.caseId, invitedUser.id);
        if (membership && (membership.role === "caregiver" || membership.role === "network_member")) {
          const updatedMembership = await updateMembership(context.env.DB, membership.id, { active: false });
          removedMembershipId = updatedMembership?.id || null;
        }
      }
    }

    const deactivated = await deactivateInvitation(context.env.DB, session.organization.id, invitationId);
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId: invitation.caseId || null,
      actorUserId: session.user.id,
      eventType: "case_membership_removed",
      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        removedMembershipId,
        managerType: "practitioner",
      },
    });
    return json({
      ok: true,
      action: removedMembershipId ? "member_removed" : "invite_inactivated",
      invitation: deactivated || invitation,
      removedMembershipId,
    });
  }

  return methodNotAllowed(["GET", "DELETE"]);
}

async function handleAdminInvitations(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  segments: string[],
) {
  if (context.request.method === "GET" && segments.length === 2) {
    const decision = requireOrgAdmin(session.user);
    if (!decision.allowed) {
      return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
    }
    const invitations = await listInvitations(context.env.DB, session.organization.id);
    return json({ ok: true, invitations });
  }

  if (context.request.method === "DELETE" && segments.length === 3) {
    const decision = requireOrgAdmin(session.user);
    if (!decision.allowed) {
      return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
    }
    const invitationId = String(segments[2] || "").trim();
    if (!invitationId) {
      return errorJson(400, "bad_request", "Invitation id is required.");
    }
    const invitation = await getInvitationById(context.env.DB, session.organization.id, invitationId);
    if (!invitation) {
      return errorJson(404, "not_found", "Invitation not found.");
    }
    if (invitation.acceptedAt) {
      return errorJson(400, "bad_request", "Accepted invitations cannot be revoked.");
    }
    if (!invitation.active || invitation.revokedAt) {
      return json({ ok: true, invitation, alreadyRevoked: true });
    }
    const revoked = await revokeInvitation(context.env.DB, session.organization.id, invitationId);
    if (!revoked) {
      return errorJson(404, "not_found", "Invitation not found.");
    }
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId: revoked.caseId || null,
      actorUserId: session.user.id,
      eventType: "invite_revoked",
      metadata: {
        invitationId: revoked.id,
        email: revoked.email,
        userType: revoked.userType,
        caseRole: revoked.caseRole,
      },
    });
    return json({ ok: true, invitation: revoked });
  }

  if (context.request.method !== "POST" || segments.length !== 2) {
    return methodNotAllowed(["GET", "POST", "DELETE"]);
  }

  const body = await readBody<{ email: string; userType: UserType; caseRole?: CaseMembershipRole; caseId?: string | null }>(context.request);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return errorJson(400, "bad_request", "Invitation email is required.");
  const requestedUserType = body.userType;
  const requestedCaseRole = body.caseRole || null;
  const isFamilyOrNetworkInvite = requestedUserType === "caregiver" || requestedUserType === "network_member";

  if (isFamilyOrNetworkInvite) {
    if (!body.caseId) {
      return errorJson(
        400,
        "bad_request",
        "Caregiver and network invitations must be linked to a family case created in the system.",
      );
    }
    if (requestedCaseRole !== "caregiver" && requestedCaseRole !== "network_member") {
      return errorJson(
        400,
        "bad_request",
        "Caregiver and network invitations must include a matching case role.",
      );
    }
    if (requestedCaseRole !== requestedUserType) {
      return errorJson(
        400,
        "bad_request",
        "Invitation user type and case role must match for caregiver and network invitations.",
      );
    }
  }

  const adminDecision = requireOrgAdmin(session.user);
  const workerInviteFlow =
    (session.user.userType === "worker" || session.user.userType === "supervisor") &&
    body.caseId &&
    isFamilyOrNetworkInvite &&
    requestedCaseRole === requestedUserType;

  if (!adminDecision.allowed && !workerInviteFlow) {
    return denyWithAudit(
      context,
      session,
      403,
      "org_admin_required",
      "Only organization admins, or case workers inviting caregiver/network users for their own case, can send invitations.",
    );
  }

  if (adminDecision.allowed) {
    const adminAllowedUserType = requestedUserType === "worker" || requestedUserType === "supervisor";
    const adminAllowedCaseRole =
      requestedCaseRole === null || requestedCaseRole === "worker" || requestedCaseRole === "supervisor";
    if (!adminAllowedUserType || !adminAllowedCaseRole) {
      return errorJson(
        400,
        "bad_request",
        "Organization admins can only invite workers or supervisors. Caregiver and network invitations must be sent by practitioners from their dashboard.",
      );
    }
  }

  if (workerInviteFlow) {
    const workerCaseId = String(body.caseId || "").trim();
    const workerCaseRow = await getCaseRow(context.env.DB, workerCaseId);
    if (!workerCaseRow) {
      return errorJson(404, "not_found", "Case not found.");
    }
    if (workerCaseRow.organization_id !== session.organization.id) {
      return denyWithAudit(
        context,
        session,
        403,
        "organization_membership_required",
        "You can only invite into cases within your own organization.",
        { caseId: workerCaseId },
      );
    }
    if (workerCaseRow.status !== "open") {
      return errorJson(
        400,
        "bad_request",
        "Caregiver and network invitations can only be sent for open cases.",
      );
    }
    const workerMembership = await getMembershipRow(context.env.DB, workerCaseId, session.user.id);
    if (
      !workerMembership ||
      (workerMembership.role !== "worker" && workerMembership.role !== "supervisor")
    ) {
      return denyWithAudit(
        context,
        session,
        403,
        "case_membership_required",
        "You can only invite caregiver or network members into cases where you are an active practitioner.",
        { caseId: workerCaseId, inviterUserType: session.user.userType },
      );
    }
  }

  const licenseSummary = await loadCurrentOrganizationSummary(context, session.organization.id);
  if (!licenseSummary) {
    return errorJson(404, "not_found", "Organization not found.");
  }
  if (!licenseSummary.isLicensed) {
    return errorJson(403, "organization_unlicensed", licenseSummary.licenseGateMessage);
  }
  const inviteConsumesLicensedSeat = !isFamilyOrNetworkInvite;
  if (inviteConsumesLicensedSeat && (licenseSummary.remainingProvisioningSlots ?? 0) < 1) {
    return errorJson(
      400,
      "bad_request",
      "This organization has no remaining licensed seats available for new invitations.",
    );
  }

  const existingUser = await findOrganizationUserByEmail(context.env.DB, session.organization.id, email);
  if (existingUser) {
    return errorJson(
      409,
      "bad_request",
      existingUser.active
        ? "That email is already provisioned in this organization. Ask the user to sign in with their existing account."
        : "That email already belongs to a paused account. Restore the account from the user roster instead of sending a new invite.",
    );
  }

  const invitation = await createInvitation(context.env.DB, {
    organizationId: session.organization.id,
    caseId: body.caseId || null,
    email,
    userType: requestedUserType,
    caseRole: requestedCaseRole,
    invitedBy: session.user.id,
  });
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId: body.caseId || null,
    actorUserId: session.user.id,
    eventType: "invite_sent",
    metadata: {
      invitationId: invitation.id,
      email: invitation.email,
      userType: invitation.userType,
      caseRole: invitation.caseRole,
    },
  });
  const requestOrigin = new URL(context.request.url).origin.replace(/\/+$/g, "");
  const tenantBaseUrl = String(context.data?.tenantPublicBaseUrl || "").trim().replace(/\/+$/g, "");
  const configuredBaseUrl = String(context.env.APP_BASE_URL || "").trim().replace(/\/+$/g, "");
  const inviteBaseUrl = tenantBaseUrl || requestOrigin || configuredBaseUrl;
  const inviteUrl = `${inviteBaseUrl}/auth/sign-in?invite=${encodeURIComponent(invitation.inviteToken)}&returnTo=${encodeURIComponent("/account")}`;
  const delivery = await deliverInvitationEmail(context.env, {
    invitation,
    inviteUrl,
    organization: session.organization,
    invitedByName: session.user.displayName,
  });
  await audit(context.env.DB, {
    organizationId: session.organization.id,
    caseId: body.caseId || null,
    actorUserId: session.user.id,
    eventType: "invite_delivery_attempted",
    metadata: {
      invitationId: invitation.id,
      status: delivery.status,
      channel: delivery.channel,
      detail: delivery.detail,
    },
  });
  if (delivery.status === "failed") {
    logOperationalError(
      context.request,
      "invite_delivery_failed",
      new Error(delivery.detail),
      {
        organizationId: session.organization.id,
        invitationId: invitation.id,
        channel: delivery.channel,
      },
    );
  }
  return json({ ok: true, invitation, inviteUrl, delivery });
}

async function handleAdminLicenseSummary(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }

  const summary = await loadCurrentOrganizationSummary(context, session.organization.id);
  if (!summary) {
    return errorJson(404, "not_found", "Organization not found.");
  }
  return json({ ok: true, summary });
}

async function handleAdminOrganization(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  segments: string[],
) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }

  if (segments.length === 3 && segments[2] === "license" && context.request.method === "PATCH") {
    return errorJson(
      403,
      "org_admin_required",
      "License changes are controlled by the platform owner. Organization admins can only reassign existing licensed seats.",
    );
  }

  if (segments.length === 3 && segments[2] === "status" && context.request.method === "PATCH") {
    return errorJson(
      403,
      "org_admin_required",
      "Organization status changes are controlled by the platform owner.",
    );
  }

  if (segments.length === 2 && context.request.method === "DELETE") {
    return errorJson(
      403,
      "org_admin_required",
      "Organization deletion is controlled by the platform owner.",
    );
  }

  return errorJson(404, "not_found", "Unknown admin organization route.");
}

async function handleAdminCaseMemberships(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, segments: string[]) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }
  const licensed = await requireLicensedOrganizationAccess(context, session, { route: "case_memberships" });
  if (licensed.error) return licensed.error;

  if (segments.length === 2 && context.request.method === "POST") {
    const body = await readBody<{ caseId: string; userId: string; role: CaseMembershipRole; accessScopeJson?: Record<string, unknown> }>(context.request);
    if (!body.caseId || !body.userId || !body.role) {
      return errorJson(400, "bad_request", "caseId, userId, and role are required.");
    }
    const membership = await ensureCaseMembership(context.env.DB, {
      caseId: body.caseId,
      userId: body.userId,
      role: body.role,
      invitedBy: session.user.id,
      accessScopeJson: body.accessScopeJson || {},
    });
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId: body.caseId,
      actorUserId: session.user.id,
      eventType: "case_membership_added",
      metadata: { membershipId: membership?.id || null, userId: body.userId, role: body.role },
    });
    return json({ ok: true, membership });
  }

  if (segments.length === 3 && context.request.method === "PATCH") {
    const body = await readBody<{ role?: CaseMembershipRole; active?: boolean; accessScopeJson?: Record<string, unknown> }>(context.request);
    const membership = await updateMembership(context.env.DB, segments[2], body);
    if (!membership) return errorJson(404, "not_found", "Case membership not found.");
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      caseId: membership.caseId,
      actorUserId: session.user.id,
      eventType: membership.active ? "case_membership_changed" : "case_membership_removed",
      metadata: { membershipId: membership.id, role: membership.role, active: membership.active },
    });
    return json({ ok: true, membership });
  }

  return errorJson(404, "not_found", "Unknown case membership route.");
}

async function handleOwnerOverview(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const decision = requirePlatformOwner(session.permissions);
  if (!decision.allowed) {
    return denyWithAudit(
      context,
      session,
      403,
      decision.reason || "platform_owner_required",
      decision.hint || "Platform owner access required.",
    );
  }

  const [organizations, users, auditEvents, supportTickets, billingEvents, alternativePaymentRequests] = await Promise.all([
    listOrganizationsForOwner(context.env.DB),
    listAllUsersForOwner(context.env.DB),
    listAuditEventsForOwner(context.env.DB),
    listAdminSupportTickets(context.env),
    listAdminBillingEvents(context.env),
    listAdminAlternativePaymentRequests(context.env),
  ]);

  return json({
    ok: true,
    overview: {
      organizations: organizations.map(minimizeOwnerOrganization),
      users: users.map(minimizeOwnerUser),
      auditEvents: auditEvents.map(minimizeAuditEvent),
      supportTickets: supportTickets.map(minimizeSupportTicket),
      billingEvents: billingEvents.map(minimizeBillingEvent),
      alternativePaymentRequests: alternativePaymentRequests.map(minimizeOwnerAlternativePaymentRequest),
      deploymentReadiness: getDeploymentReadiness(context.env),
    },
  });
}

async function handleOwnerOrganizations(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  segments: string[],
) {
  const decision = requirePlatformOwner(session.permissions);
  if (!decision.allowed) {
    return denyWithAudit(
      context,
      session,
      403,
      decision.reason || "platform_owner_required",
      decision.hint || "Platform owner access required.",
    );
  }

  if (segments.length === 2 && context.request.method === "POST") {
    const body = await readBody<{
      organizationName?: string;
      adminEmail?: string;
      licensedSeatCount?: number | null;
      licensedPlanName?: string;
      licenseStatus?: string;
    }>(context.request);

    const organizationName = String(body.organizationName || "").trim();
    const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
    const licensedSeatCount = body.licensedSeatCount === null || body.licensedSeatCount === undefined
      ? null
      : Number(body.licensedSeatCount);
    const licensedPlanName = String(body.licensedPlanName || "").trim() || "Manual purchase";
    const licenseStatus = String(body.licenseStatus || "").trim().toLowerCase() || "active";

    if (!organizationName) {
      return errorJson(400, "bad_request", "Organization name is required.");
    }
    if (!adminEmail || !isValidEmail(adminEmail)) {
      return errorJson(400, "bad_request", "A valid admin email is required.");
    }
    if (licensedSeatCount !== null && (!Number.isInteger(licensedSeatCount) || licensedSeatCount < 1)) {
      return errorJson(400, "bad_request", "Licensed seat count must be a whole number greater than zero or null.");
    }
    if (!["active", "trial", "paused", "inactive"].includes(licenseStatus)) {
      return errorJson(400, "bad_request", "License status must be active, trial, paused, or inactive.");
    }

    const existingOrganization = await findOrganizationByName(context.env.DB, organizationName);
    if (existingOrganization) {
      return errorJson(409, "bad_request", "An organization with that name already exists.");
    }

    const existingUserWithEmail = await context.env.DB
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 1")
      .bind(adminEmail)
      .first<{ id: string }>();
    if (existingUserWithEmail) {
      return errorJson(409, "bad_request", "That admin email is already in use. Use another email.");
    }

    const createdOrganization = await createOrganization(context.env.DB, {
      name: organizationName,
      settingsJson: {
        brandingName: organizationName,
        licensedSeatCount,
        licensedPlanName,
        licenseStatus,
      },
    });
    if (!createdOrganization) {
      return errorJson(500, "request_failed", "The organization could not be created.");
    }

    const invitation = await createInvitation(context.env.DB, {
      organizationId: createdOrganization.id,
      email: adminEmail,
      userType: "org_admin",
      caseRole: null,
      invitedBy: session.user.id,
    });

    const requestOrigin = new URL(context.request.url).origin;
    const tenantBaseUrl = String(context.data?.tenantPublicBaseUrl || "").trim().replace(/\/+$/g, "");
    const configuredBaseUrl = String(context.env.APP_BASE_URL || "").trim().replace(/\/+$/g, "");
    const inviteBaseUrl = tenantBaseUrl || requestOrigin || configuredBaseUrl;
    const inviteUrl = `${inviteBaseUrl}/auth/sign-in?invite=${encodeURIComponent(invitation.inviteToken)}&returnTo=${encodeURIComponent("/admin")}`;
    const delivery = await deliverInvitationEmail(context.env, {
      invitation,
      inviteUrl,
      organization: createdOrganization,
      invitedByName: session.user.displayName,
    });

    const summary = await getOrganizationLicenseSummary(context.env.DB, createdOrganization);
    await audit(context.env.DB, {
      organizationId: createdOrganization.id,
      actorUserId: session.user.id,
      eventType: "owner_organization_created",
      metadata: {
        organizationId: createdOrganization.id,
        organizationName: createdOrganization.name,
        adminEmail,
        licensedSeatCount,
        licensedPlanName,
        licenseStatus,
      },
    });
    await audit(context.env.DB, {
      organizationId: createdOrganization.id,
      actorUserId: session.user.id,
      eventType: "invite_sent",
      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        userType: invitation.userType,
      },
    });
    await audit(context.env.DB, {
      organizationId: createdOrganization.id,
      actorUserId: session.user.id,
      eventType: "invite_delivery_attempted",
      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        deliveryStatus: delivery.status,
        deliveryChannel: delivery.channel,
        deliveryDetail: delivery.detail,
      },
    });

    return json({
      ok: true,
      summary,
      invitation,
      inviteUrl,
      delivery,
    });
  }

  if (segments.length === 4 && segments[3] === "license" && context.request.method === "PATCH") {
    const body = await readBody<{
      licensedSeatCount?: number | null;
      licensedPlanName?: string;
      licenseStatus?: string;
    }>(context.request);

    const patch: Record<string, unknown> = {};
    if ("licensedSeatCount" in body) {
      if (body.licensedSeatCount !== null && (!Number.isInteger(body.licensedSeatCount) || Number(body.licensedSeatCount) < 1)) {
        return errorJson(400, "bad_request", "Licensed seat count must be a whole number greater than zero or null.");
      }
      patch.licensedSeatCount = body.licensedSeatCount ?? null;
    }
    if (typeof body.licensedPlanName === "string") patch.licensedPlanName = body.licensedPlanName.trim();
    if (typeof body.licenseStatus === "string") patch.licenseStatus = body.licenseStatus.trim();

    if (!Object.keys(patch).length) {
      return errorJson(400, "bad_request", "At least one license field must be provided.");
    }

    const updatedOrganization = await updateOrganizationSettings(context.env.DB, segments[2], patch);
    if (!updatedOrganization) {
      return errorJson(404, "not_found", "Organization not found.");
    }
    const summary = await getOrganizationLicenseSummary(context.env.DB, updatedOrganization);

    await audit(context.env.DB, {
      organizationId: updatedOrganization.id,
      actorUserId: session.user.id,
      eventType: "owner_license_updated",
      metadata: {
        organizationId: updatedOrganization.id,
        ...patch,
      },
    });

    return json({ ok: true, summary });
  }

  if (segments.length === 4 && segments[3] === "status" && context.request.method === "PATCH") {
    const body = await readBody<{ status?: string }>(context.request);
    const nextStatus = String(body.status || "").trim().toLowerCase();
    if (nextStatus !== "active" && nextStatus !== "archived") {
      return errorJson(400, "bad_request", "Organization status must be either active or archived.");
    }

    const updatedOrganization = await updateOrganizationStatus(context.env.DB, segments[2], nextStatus);
    if (!updatedOrganization) {
      return errorJson(404, "not_found", "Organization not found.");
    }
    const summary = await getOrganizationLicenseSummary(context.env.DB, updatedOrganization);

    await audit(context.env.DB, {
      organizationId: updatedOrganization.id,
      actorUserId: session.user.id,
      eventType: nextStatus === "archived" ? "owner_organization_archived" : "owner_organization_restored",
      metadata: {
        organizationId: updatedOrganization.id,
        status: nextStatus,
      },
    });

    return json({ ok: true, summary });
  }

  if (segments.length === 3 && context.request.method === "DELETE") {
    const organization = await getOrganizationById(context.env.DB, segments[2]);
    if (!organization) {
      return errorJson(404, "not_found", "Organization not found.");
    }
    const summary = await getOrganizationLicenseSummary(context.env.DB, organization);
    if (summary.isPlatformOwnerOrganization) {
      return errorJson(403, "bad_request", "Platform owner organizations cannot be deleted.");
    }
    const deleted = await deleteOrganizationRecord(context.env.DB, organization.id);
    if (!deleted) {
      return errorJson(404, "not_found", "Organization not found.");
    }
    await audit(context.env.DB, {
      organizationId: organization.id,
      actorUserId: session.user.id,
      eventType: "owner_organization_deleted",
      metadata: {
        organizationId: organization.id,
      },
    });
    return json({ ok: true, organizationId: organization.id, status: "deleted" });
  }

  return errorJson(404, "not_found", "Unknown owner organizations route.");
}

async function handleOwnerUsers(
  context: AppContext,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  segments: string[],
) {
  const decision = requirePlatformOwner(session.permissions);
  if (!decision.allowed) {
    return denyWithAudit(
      context,
      session,
      403,
      decision.reason || "platform_owner_required",
      decision.hint || "Platform owner access required.",
    );
  }

  if (segments.length !== 3) {
    return errorJson(404, "not_found", "Unknown owner users route.");
  }

  const targetUser = await getUserById(context.env.DB, segments[2]);
  if (!targetUser) {
    return errorJson(404, "not_found", "User not found.");
  }

  if (context.request.method === "PATCH") {
    const body = await readBody<{ active?: boolean }>(context.request);
    if (typeof body.active !== "boolean") {
      return errorJson(400, "bad_request", "Patch payload must include an active boolean.");
    }
    if (targetUser.id === session.user.id && body.active === false) {
      return errorJson(400, "bad_request", "Use another platform owner account to pause your own access.");
    }
    if (targetUser.userType === "org_admin" && body.active === false && targetUser.active) {
      const activeAdminCount = await countActiveOrganizationUsersByType(context.env.DB, targetUser.organizationId, "org_admin");
      if (activeAdminCount <= 1) {
        return errorJson(400, "bad_request", "At least one active organization admin must remain.");
      }
    }
    if (body.active === true && !targetUser.active) {
      const organization = await getOrganizationById(context.env.DB, targetUser.organizationId);
      if (!organization) {
        return errorJson(404, "not_found", "Organization not found.");
      }
      const licenseSummary = await getOrganizationLicenseSummary(context.env.DB, organization);
      if (licenseSummary.remainingSeats !== null && licenseSummary.remainingSeats < 1) {
        return errorJson(
          400,
          "bad_request",
          "No licensed seats are currently available for that organization. Increase the seat allocation or free a seat first.",
        );
      }
    }

    const updated = await updateUserActiveState(context.env.DB, targetUser.id, body.active);
    if (!updated) {
      return errorJson(404, "not_found", "User not found.");
    }
    await audit(context.env.DB, {
      organizationId: targetUser.organizationId,
      actorUserId: session.user.id,
      eventType: "owner_user_access_changed",
      metadata: { targetUserId: updated.id, active: updated.active },
    });
    return json({ ok: true, user: minimizeAdminUser(updated) });
  }

  if (context.request.method === "DELETE") {
    if (targetUser.id === session.user.id) {
      return errorJson(400, "bad_request", "Use another platform owner account to delete your own access.");
    }
    if (targetUser.userType === "org_admin" && targetUser.active) {
      const activeAdminCount = await countActiveOrganizationUsersByType(context.env.DB, targetUser.organizationId, "org_admin");
      if (activeAdminCount <= 1) {
        return errorJson(400, "bad_request", "At least one active organization admin must remain.");
      }
    }

    const deleted = await softDeleteUserAccount(context.env.DB, targetUser.organizationId, targetUser.id);
    if (!deleted) {
      return errorJson(404, "not_found", "User not found.");
    }
    await audit(context.env.DB, {
      organizationId: targetUser.organizationId,
      actorUserId: session.user.id,
      eventType: "owner_user_deleted",
      metadata: { targetUserId: deleted.id },
    });
    return json({ ok: true, user: minimizeAdminUser(deleted) });
  }

  return methodNotAllowed(["PATCH", "DELETE"]);
}

async function handleAdminAuditEvents(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }
  const events = await listAuditEvents(context.env.DB, session.organization.id);
  return json({ ok: true, events: events.map(minimizeAuditEvent) });
}

async function handlePublicSupportTicket(context: AppContext) {
  if (requestBodyExceedsBytes(context.request, 1_500_000)) {
    logSecurityEvent(context.request, "support_ticket_rejected", {
      outcome: "blocked",
      reason: "payload_too_large",
    });
    return errorJson(413, "bad_request", "Support ticket payload is too large.");
  }
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    logSecurityEvent(context.request, "support_ticket_rejected", {
      outcome: "blocked",
      reason: "invalid_json",
    });
    return errorJson(400, "bad_request", "Request body must be valid JSON.");
  }

  const parsed = parseSupportTicketPayload(payload);
  if (!parsed.ok) {
    logSecurityEvent(context.request, "support_ticket_rejected", {
      outcome: "blocked",
      reason: "invalid_payload",
    });
    return errorJson(400, "bad_request", parsed.message);
  }

  const turnstile = await verifyTurnstileIfEnforced({
    env: context.env,
    request: context.request,
    payload,
    expectedAction: "support_ticket_submit",
    scope: "public",
  });
  if (!turnstile.ok) {
    logSecurityEvent(context.request, "turnstile_rejected", {
      outcome: "blocked",
      route: "support_ticket",
      reason: turnstile.code,
    });
    return errorJson(403, turnstile.code, turnstile.hint);
  }

  try {
    const response = await submitSupportTicket(context, parsed.data, null);
    return json({
      ok: true,
      message: response.message,
      supportEmail: response.supportEmail,
      mailtoUrl: response.mailtoUrl,
      ticket: minimizeSupportTicket(response.ticket),
    });
  } catch (error) {
    logOperationalError(context.request, "support_ticket_failed", error, {
      outcome: "failed",
    });
    return errorJson(500, "request_failed", "The support ticket could not be saved.");
  }
}

async function handlePublicBillingCheckout(context: AppContext) {
  if (requestBodyExceedsBytes(context.request, 64_000)) {
    logSecurityEvent(context.request, "billing_checkout_rejected", {
      outcome: "blocked",
      reason: "payload_too_large",
    });
    return errorJson(413, "bad_request", "Checkout request payload is too large.");
  }
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    logSecurityEvent(context.request, "billing_checkout_rejected", {
      outcome: "blocked",
      reason: "invalid_json",
    });
    return errorJson(400, "bad_request", "Request body must be valid JSON.");
  }

  const parsed = parseBillingCheckoutPayload(payload);
  if (!parsed.ok) {
    logSecurityEvent(context.request, "billing_checkout_rejected", {
      outcome: "blocked",
      reason: "invalid_payload",
    });
    return errorJson(400, "bad_request", parsed.message);
  }

  const turnstile = await verifyTurnstileIfEnforced({
    env: context.env,
    request: context.request,
    payload,
    expectedAction: "billing_checkout_submit",
    scope: "public",
  });
  if (!turnstile.ok) {
    logSecurityEvent(context.request, "turnstile_rejected", {
      outcome: "blocked",
      route: "billing_checkout",
      reason: turnstile.code,
    });
    return errorJson(403, turnstile.code, turnstile.hint);
  }

  try {
    const response = await createPublicStripeCheckout(context.env, context.request, parsed.data, null);
    return json({ ok: true, ...response });
  } catch (error) {
    logOperationalError(context.request, "billing_checkout_failed", error, {
      outcome: "failed",
    });
    return errorJson(400, "billing_checkout_failed", "Checkout could not be started for this request.");
  }
}

async function handlePublicAlternativePaymentRequest(context: AppContext) {
  if (requestBodyExceedsBytes(context.request, 96_000)) {
    logSecurityEvent(context.request, "alternative_payment_rejected", {
      outcome: "blocked",
      reason: "payload_too_large",
    });
    return errorJson(413, "bad_request", "Alternative payment request payload is too large.");
  }
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    logSecurityEvent(context.request, "alternative_payment_rejected", {
      outcome: "blocked",
      reason: "invalid_json",
    });
    return errorJson(400, "bad_request", "Request body must be valid JSON.");
  }

  const parsed = parseAlternativePaymentRequestPayload(payload, context.env);
  if (!parsed.ok) {
    logSecurityEvent(context.request, "alternative_payment_rejected", {
      outcome: "blocked",
      reason: "invalid_payload",
    });
    return errorJson(400, "bad_request", parsed.message);
  }

  const turnstile = await verifyTurnstileIfEnforced({
    env: context.env,
    request: context.request,
    payload,
    expectedAction: "alternative_payment_submit",
    scope: "public",
  });
  if (!turnstile.ok) {
    logSecurityEvent(context.request, "turnstile_rejected", {
      outcome: "blocked",
      route: "alternative_payment",
      reason: turnstile.code,
    });
    return errorJson(403, turnstile.code, turnstile.hint);
  }

  try {
    const response = await submitAlternativePaymentRequest(context, parsed.data, null);
    return json({
      ok: true,
      message: response.message,
      request: minimizeOwnerAlternativePaymentRequest(response.request),
    });
  } catch (error) {
    logOperationalError(context.request, "alternative_payment_failed", error, {
      outcome: "failed",
    });
    return errorJson(400, "alternative_payment_failed", "The alternative payment request could not be created.");
  }
}

export const onRequest = async (context: AppContext) => {
  const tenantRuntimeResult = resolveTenantRuntimeForRequest(context.request, context.env, {
    authenticatedTenantClaim: String(context.data?.tenantClaim || ""),
  });
  if (!tenantRuntimeResult.ok) {
    logSecurityEvent(context.request, "tenant_resolution_failed", {
      outcome: "blocked",
      reason: tenantRuntimeResult.code,
    });
    return errorJson(tenantRuntimeResult.status, tenantRuntimeResult.code, tenantRuntimeResult.hint);
  }
  const tenantRuntime = tenantRuntimeResult.runtime;
  context = bindTenantRuntimeContext(context, tenantRuntime);

  const segments = pathSegments(context.request);
  const pathname = new URL(context.request.url).pathname;

  try {
    if (segments.length === 1 && segments[0] === "support-ticket" && context.request.method === "POST") {
      return handlePublicSupportTicket(context);
    }

    if (segments[0] === "billing" && segments[1] === "plans" && context.request.method === "GET") {
      return json({
        ok: true,
        configured: isStripeConfigured(context.env),
        alternativePaymentsEnabled: isAlternativePaymentsEnabled(context.env),
        allowedAlternativePaymentMethods: getAllowedAlternativePaymentMethods(context.env),
        plans: getNetworkBillingPlans(context.env),
      });
    }

    if (segments[0] === "billing" && segments[1] === "checkout" && context.request.method === "POST") {
      return handlePublicBillingCheckout(context);
    }

    if (segments[0] === "billing" && segments[1] === "alternative-payment-request" && context.request.method === "POST") {
      return handlePublicAlternativePaymentRequest(context);
    }

    if (segments[0] === "stripe" && segments[1] === "webhook" && context.request.method === "POST") {
      return handleStripeWebhook(context);
    }

    const session = await resolveSession(context.request, context.env, context.env.DB);
    if (!session) {
      logSecurityEvent(context.request, "auth_required", {
        outcome: "blocked",
        path: pathname,
      });
      return errorJson(401, "auth_required", "Sign in before accessing Network Manager.");
    }
    if (!session.user.active) {
      return denyWithAudit(
        context,
        session,
        403,
        "inactive_user",
        "Your account is inactive. Contact your organization administrator.",
      );
    }
    if (!isTenantOrganizationAllowed(tenantRuntime.tenant, session.organization.id)) {
      return denyWithAudit(
        context,
        session,
        403,
        "organization_membership_required",
        "Your account is not mapped to this tenant environment.",
        {
          tenantId: tenantRuntime.tenant.id,
          organizationId: session.organization.id,
        },
      );
    }

    if (segments.length === 1 && segments[0] === "me" && context.request.method === "GET") {
      return handleMe(context, session);
    }

    if (segments[0] === "organizations" && (context.request.method === "GET" || context.request.method === "POST")) {
      return handleOrganizationCases(context, session, segments);
    }

    if (segments[0] === "cases" && segments[1]) {
      if (segments.length === 2) {
        if (context.request.method === "GET") return handleCaseGet(context, session, segments[1]);
        if (context.request.method === "PATCH") return handleCasePatch(context, session, segments[1]);
        if (context.request.method === "DELETE") return handleCaseDelete(context, session, segments[1]);
        return methodNotAllowed(["GET", "PATCH", "DELETE"]);
      }
      if (segments[2] === "close") {
        if (context.request.method === "POST") return handleCaseClose(context, session, segments[1]);
        return methodNotAllowed(["POST"]);
      }
      if (segments[2] === "journal") {
        if (context.request.method === "GET" || context.request.method === "POST") {
          return handleCaseJournal(context, session, segments[1]);
        }
        return methodNotAllowed(["GET", "POST"]);
      }
      if (segments[2] === "documents") {
        if (segments.length === 4 && (context.request.method === "GET" || context.request.method === "DELETE")) {
          return handleCaseDocuments(context, session, segments[1], segments[3]);
        }
        if (segments.length === 3 && (context.request.method === "GET" || context.request.method === "POST")) {
          return handleCaseDocuments(context, session, segments[1]);
        }
        return methodNotAllowed(["GET", "POST", "DELETE"]);
      }
    }

    if (segments[0] === "owner") {
      if (segments[1] === "overview" && context.request.method === "GET") {
        return handleOwnerOverview(context, session);
      }
      if (segments[1] === "organizations") {
        return handleOwnerOrganizations(context, session, segments);
      }
      if (segments[1] === "users") {
        return handleOwnerUsers(context, session, segments);
      }
    }

    if (segments[0] === "admin") {
      if (segments[1] === "users") return handleAdminUsers(context, session, segments);
      if (segments[1] === "organization") return handleAdminOrganization(context, session, segments);
      if (segments[1] === "license-summary" && context.request.method === "GET") return handleAdminLicenseSummary(context, session);
      if (segments[1] === "invitations") return handleAdminInvitations(context, session, segments);
      if (segments[1] === "case-memberships") return handleAdminCaseMemberships(context, session, segments);
      if (segments[1] === "audit-events") return handleAdminAuditEvents(context, session);
      if (segments[1] === "deployment-readiness" && context.request.method === "GET") {
        const decision = requirePlatformOwner(session.permissions);
        if (!decision.allowed) {
          return denyWithAudit(
            context,
            session,
            403,
            decision.reason || "platform_owner_required",
            decision.hint || "Platform owner access required.",
          );
        }
        return json({ ok: true, report: getDeploymentReadiness(context.env) });
      }
      if (segments[1] === "support-tickets" && context.request.method === "GET") {
        const decision = requirePlatformOwner(session.permissions);
        if (!decision.allowed) {
          return denyWithAudit(
            context,
            session,
            403,
            decision.reason || "platform_owner_required",
            decision.hint || "Platform owner access required.",
          );
        }
        const tickets = await listAdminSupportTickets(context.env);
        return json({ ok: true, tickets: tickets.map(minimizeSupportTicket) });
      }
      if (segments[1] === "billing-events" && context.request.method === "GET") {
        const decision = requirePlatformOwner(session.permissions);
        if (!decision.allowed) {
          return denyWithAudit(
            context,
            session,
            403,
            decision.reason || "platform_owner_required",
            decision.hint || "Platform owner access required.",
          );
        }
        const events = await listAdminBillingEvents(context.env);
        return json({ ok: true, events: events.map(minimizeBillingEvent) });
      }
      if (segments[1] === "alternative-payment-requests") {
        const decision = requireOrgAdmin(session.user);
        if (!decision.allowed) {
          return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
        }
        if (context.request.method === "GET") {
          const status = new URL(context.request.url).searchParams.get("status") || undefined;
          const requests = await listAdminAlternativePaymentRequests(context.env, status);
          return json({
            ok: true,
            requests: requests
              .filter((request) => request.organizationId === session.organization.id)
              .map(minimizeAdminAlternativePaymentRequest),
          });
        }
        if (context.request.method === "PATCH") {
          const body = await readBody<{ id?: string; requestStatus?: string; adminNotes?: string; approvedBy?: string; activationStartsAt?: string; activationEndsAt?: string; externalReference?: string }>(context.request);
          const id = String(body.id || "").trim();
          if (!id) {
            return errorJson(400, "bad_request", "Request id is required.");
          }
          const existing = await getAlternativePaymentRequestById(context.env.DB, id);
          if (!existing) {
            return errorJson(404, "not_found", "Alternative payment request not found.");
          }
          if (existing.organizationId !== session.organization.id) {
            return denyWithAudit(
              context,
              session,
              403,
              "organization_membership_required",
              "You can only manage requests for your own organization.",
              { requestId: id, requestOrganizationId: existing.organizationId || null },
            );
          }
          const nextStatus = body.requestStatus && ALTERNATIVE_PAYMENT_REQUEST_STATUSES.includes(body.requestStatus as AlternativePaymentRequestStatus)
            ? (body.requestStatus as AlternativePaymentRequestStatus)
            : undefined;
          if (body.requestStatus && !nextStatus) {
            return errorJson(400, "bad_request", "Choose a valid alternative payment request status.");
          }
          const updated = await updateAdminAlternativePaymentRequest(context.env, id, {
            ...(nextStatus ? { requestStatus: nextStatus } : {}),
            ...(body.adminNotes ? { adminNotes: body.adminNotes } : {}),
            ...(body.approvedBy ? { approvedBy: body.approvedBy } : {}),
            ...(body.activationStartsAt ? { activationStartsAt: body.activationStartsAt } : {}),
            ...(body.activationEndsAt ? { activationEndsAt: body.activationEndsAt } : {}),
            ...(body.externalReference ? { externalReference: body.externalReference } : {}),
            updatedAt: new Date().toISOString(),
          });
          if (!updated) {
            return errorJson(404, "not_found", "Alternative payment request not found.");
          }
          return json({ ok: true, request: minimizeAdminAlternativePaymentRequest(updated) });
        }
      }
    }

    if (segments[0] === "practitioner" && segments[1] === "invitations" && (context.request.method === "GET" || context.request.method === "DELETE")) {
      return handlePractitionerInvitations(context, session, segments);
    }

    return errorJson(404, "not_found", "Unknown API route.");
  } catch (error) {
    logOperationalError(context.request, "api_request_failed", error, {
      outcome: "failed",
      path: pathname,
      tenantId: String(context.data?.tenantId || ""),
    });
    return errorJson(500, "request_failed", "The request could not be completed.");
  }
};
