import { cloneDefaultCaseState } from "../../shared/default-case-state";
import type { CaseMembershipRole, JournalAudience, UserType } from "../../shared/types";
import { audit } from "../_lib/audit";
import {
  canAccessCase,
  canCloseCase,
  canEditCaseState,
  canManageMemberships,
  canPostJournal,
  defaultAudienceForRole,
  filterJournalForUser,
  orgBranding,
  requireOrgAdmin,
  resolveClosedSupervisorAccess,
} from "../_lib/authz";
import { buildDocumentStorageKey, canUploadDocuments, validateDocumentFile } from "../_lib/documents";
import {
  acceptInvitationByEmailOrToken,
  all,
  createDocumentRecord,
  createInvitation,
  createJournalEntry,
  ensureCaseMembership,
  first,
  getAccessibleCases,
  getCaseRow,
  getMembershipRow,
  listAuditEvents,
  listCaseDocuments,
  listCaseMemberships,
  listInvitations,
  listJournalEntries,
  listOrganizationUsers,
  mapCaseState,
  mapCaseSummary,
  updateCaseState,
  updateMembership,
  updateUserActiveState,
  closeCase,
} from "../_lib/db";
import { deliverInvitationEmail } from "../_lib/invite-email";
import { errorJson, json, methodNotAllowed } from "../_lib/responses";
import { resolveSession } from "../_lib/session";
import type { AppContext, CaseRecordRow, MembershipRow, UserRow } from "../_lib/types";

function pathSegments(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  return pathname.split("/").filter(Boolean);
}

async function readBody<T>(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return {} as T;
  return (await request.json()) as T;
}

function assertOrganizationMatch(requestedOrgId: string, actualOrgId: string) {
  return requestedOrgId === actualOrgId;
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
  return errorJson(status, reason, hint, extra);
}

async function handleMe(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const accessibleCases = await getAccessibleCases(
    context.env.DB,
    session.organization.id,
    session.user.id,
    session.user.userType,
  );

  return json({
    ok: true,
    user: session.user,
    organization: session.organization,
    branding: orgBranding(session.organization, context.env),
    accessibleCases,
    permissions: session.permissions,
  });
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

  const cases = await getAccessibleCases(context.env.DB, session.organization.id, session.user.id, session.user.userType);
  return json({ ok: true, cases });
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
    documents,
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

async function handleCaseDocuments(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, caseId: string) {
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
    const documents = await listCaseDocuments(context.env.DB, caseId);
    return json({ ok: true, documents });
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
  return json({ ok: true, document });
}

async function handleAdminUsers(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, segments: string[]) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }

  if (segments.length === 2 && context.request.method === "GET") {
    const users = await listOrganizationUsers(context.env.DB, session.organization.id);
    const invitations = await listInvitations(context.env.DB, session.organization.id);
    return json({ ok: true, users, invitations });
  }

  if (segments.length === 3 && context.request.method === "PATCH") {
    const body = await readBody<{ active?: boolean }>(context.request);
    if (typeof body.active !== "boolean") {
      return errorJson(400, "bad_request", "Patch payload must include an active boolean.");
    }
    const updated = await updateUserActiveState(context.env.DB, segments[2], body.active);
    if (!updated) return errorJson(404, "not_found", "User not found.");
    await audit(context.env.DB, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      eventType: "user_access_changed",
      metadata: { targetUserId: updated.id, active: updated.active },
    });
    return json({ ok: true, user: updated });
  }

  return errorJson(404, "not_found", "Unknown admin users route.");
}

async function handleAdminInvitations(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  if (context.request.method === "GET") {
    const decision = requireOrgAdmin(session.user);
    if (!decision.allowed) {
      return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
    }
    const invitations = await listInvitations(context.env.DB, session.organization.id);
    return json({ ok: true, invitations });
  }

  const body = await readBody<{ email: string; userType: UserType; caseRole?: CaseMembershipRole; caseId?: string | null }>(context.request);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return errorJson(400, "bad_request", "Invitation email is required.");
  const requestedUserType = body.userType;
  const requestedCaseRole = body.caseRole || null;

  const adminDecision = requireOrgAdmin(session.user);
  const workerInviteFlow =
    (session.user.userType === "worker" || session.user.userType === "supervisor") &&
    body.caseId &&
    (requestedUserType === "caregiver" || requestedUserType === "network_member") &&
    (requestedCaseRole === "caregiver" || requestedCaseRole === "network_member");

  if (!adminDecision.allowed && !workerInviteFlow) {
    return denyWithAudit(
      context,
      session,
      403,
      "org_admin_required",
      "Only organization admins, or case workers inviting caregiver/network users for their own case, can send invitations.",
    );
  }

  if (workerInviteFlow) {
    const loaded = await loadCaseAccess(context, session, String(body.caseId));
    if ("error" in loaded) return loaded.error;
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
  const inviteUrl = `${context.env.APP_BASE_URL.replace(/\/+$/g, "")}/sign-in?invite=${encodeURIComponent(invitation.inviteToken)}`;
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
  return json({ ok: true, invitation, inviteUrl, delivery });
}

async function handleAdminCaseMemberships(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, segments: string[]) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }

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

async function handleAdminAuditEvents(context: AppContext, session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const decision = requireOrgAdmin(session.user);
  if (!decision.allowed) {
    return denyWithAudit(context, session, 403, decision.reason || "org_admin_required", decision.hint || "Admin access required.");
  }
  const events = await listAuditEvents(context.env.DB, session.organization.id);
  return json({ ok: true, events });
}

export const onRequest = async (context: AppContext) => {
  const segments = pathSegments(context.request);

  const session = await resolveSession(context.request, context.env, context.env.DB);
  if (!session) {
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

  if (segments.length === 1 && segments[0] === "me" && context.request.method === "GET") {
    return handleMe(context, session);
  }

  if (segments[0] === "organizations" && context.request.method === "GET") {
    return handleOrganizationCases(context, session, segments);
  }

  if (segments[0] === "cases" && segments[1]) {
    if (segments.length === 2) {
      if (context.request.method === "GET") return handleCaseGet(context, session, segments[1]);
      if (context.request.method === "PATCH") return handleCasePatch(context, session, segments[1]);
      return methodNotAllowed(["GET", "PATCH"]);
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
      if (context.request.method === "GET" || context.request.method === "POST") {
        return handleCaseDocuments(context, session, segments[1]);
      }
      return methodNotAllowed(["GET", "POST"]);
    }
  }

  if (segments[0] === "admin") {
    if (segments[1] === "users") return handleAdminUsers(context, session, segments);
    if (segments[1] === "invitations") return handleAdminInvitations(context, session);
    if (segments[1] === "case-memberships") return handleAdminCaseMemberships(context, session, segments);
    if (segments[1] === "audit-events") return handleAdminAuditEvents(context, session);
  }

  return errorJson(404, "not_found", "Unknown API route.");
};
