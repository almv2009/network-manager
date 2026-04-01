import { cloneDefaultCaseState, defaultCaseState } from "../../shared/default-case-state";
import type {
  AppUser,
  AuditEventRecord,
  CaseMembershipRecord,
  CaseState,
  CaseSummary,
  DocumentItem,
  InvitationRecord,
  JournalEntry,
  OrganizationRecord,
  UserType,
} from "../../shared/types";
import type { CaseMembershipRole } from "../../shared/types";
import type {
  AuditEventInput,
  AuditRow,
  CaseRecordRow,
  D1Database,
  DocumentRow,
  InvitationRow,
  JournalRow,
  MembershipRow,
  OrganizationRow,
  UserRow,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]) {
  return await db.prepare(sql).bind(...params).first<T>();
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]) {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results || [];
}

export function mapOrganization(row: OrganizationRow): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    settingsJson: parseJson<Record<string, unknown>>(row.settings_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    externalIdentityId: row.external_identity_id,
    email: row.email,
    displayName: row.display_name,
    userType: row.user_type,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCaseState(row: CaseRecordRow): CaseState {
  return {
    ...cloneDefaultCaseState(),
    ...parseJson<Partial<CaseState>>(row.state_json, defaultCaseState),
  };
}

export function mapCaseSummary(row: CaseRecordRow, membership?: MembershipRow | null): CaseSummary {
  const status = row.status;
  const membershipRole = membership?.role ? (membership.role as CaseMembershipRole) : null;
  const accessState =
    status === "closed" && membershipRole === "worker"
      ? "closed_denied"
      : status === "closed"
        ? "closed_readonly"
        : "active";
  return {
    id: row.id,
    organizationId: row.organization_id,
    familyName: row.family_name,
    status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    updatedAt: row.updated_at,
    membershipRole,
    accessState,
  };
}

export function mapMembership(row: MembershipRow): CaseMembershipRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    role: row.role as CaseMembershipRole,
    active: row.active === 1,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    accessScopeJson: parseJson<Record<string, unknown>>(row.access_scope_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayName: row.display_name,
    email: row.email,
    userType: row.user_type as UserType | undefined,
  };
}

export function mapJournal(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    author: row.author_name || "Unknown user",
    authorUserId: row.author_user_id,
    audience: row.audience as JournalEntry["audience"],
    message: row.message,
    timestamp: row.created_at,
  };
}

export function mapDocument(row: DocumentRow): DocumentItem {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storageKey: row.storage_key,
    uploadedBy: row.uploaded_by_name || row.uploaded_by,
    createdAt: row.created_at,
  };
}

export function mapAudit(row: AuditRow): AuditEventRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    metadataJson: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
    actorDisplayName: row.actor_name,
  };
}

export function mapInvitation(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    email: row.email,
    userType: row.user_type,
    caseRole: row.case_role as CaseMembershipRole | null,
    active: row.active === 1,
    inviteToken: row.invite_token,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

export async function getUserById(db: D1Database, userId: string) {
  const row = await first<UserRow>(db, "SELECT * FROM users WHERE id = ?", userId);
  return row ? mapUser(row) : null;
}

export async function getOrganizationById(db: D1Database, organizationId: string) {
  const row = await first<OrganizationRow>(db, "SELECT * FROM organizations WHERE id = ?", organizationId);
  return row ? mapOrganization(row) : null;
}

export async function getCaseRow(db: D1Database, caseId: string) {
  return await first<CaseRecordRow>(db, "SELECT * FROM cases WHERE id = ?", caseId);
}

export async function getMembershipRow(db: D1Database, caseId: string, userId: string) {
  return await first<MembershipRow>(
    db,
    "SELECT * FROM case_memberships WHERE case_id = ? AND user_id = ? AND active = 1",
    caseId,
    userId,
  );
}

export async function getAccessibleCases(db: D1Database, organizationId: string, userId: string, userType: UserType) {
  if (userType === "org_admin") {
    const rows = await all<CaseRecordRow>(
      db,
      "SELECT * FROM cases WHERE organization_id = ? ORDER BY updated_at DESC",
      organizationId,
    );
    return rows.map((row) => mapCaseSummary(row));
  }

  const rows = await all<CaseRecordRow & { membership_role: string }>(
    db,
    `SELECT c.*, cm.role AS membership_role
       FROM cases c
       JOIN case_memberships cm ON cm.case_id = c.id
      WHERE c.organization_id = ? AND cm.user_id = ? AND cm.active = 1
      ORDER BY c.updated_at DESC`,
    organizationId,
    userId,
  );

  return rows.map((row) =>
    mapCaseSummary(row, {
      id: "",
      case_id: row.id,
      user_id: userId,
      role: row.membership_role,
      active: 1,
      invited_by: null,
      invited_at: null,
      access_scope_json: "{}",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  );
}

export async function listCaseMemberships(db: D1Database, caseId: string) {
  const rows = await all<MembershipRow>(
    db,
    `SELECT cm.*, u.display_name, u.email, u.user_type
       FROM case_memberships cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.case_id = ?
      ORDER BY u.display_name ASC`,
    caseId,
  );
  return rows.map(mapMembership);
}

export async function listCaseDocuments(db: D1Database, caseId: string) {
  const rows = await all<DocumentRow>(
    db,
    `SELECT d.*, u.display_name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.case_id = ?
      ORDER BY d.created_at DESC`,
    caseId,
  );
  return rows.map(mapDocument);
}

export async function listJournalEntries(db: D1Database, caseId: string) {
  const rows = await all<JournalRow>(
    db,
    `SELECT j.*, u.display_name AS author_name
       FROM journal_entries j
       JOIN users u ON u.id = j.author_user_id
      WHERE j.case_id = ?
      ORDER BY j.created_at DESC`,
    caseId,
  );
  return rows.map(mapJournal);
}

export async function createJournalEntry(db: D1Database, input: { caseId: string; authorUserId: string; audience: string; message: string }) {
  const id = createId("journal");
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO journal_entries (id, case_id, author_user_id, audience, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.caseId, input.authorUserId, input.audience, input.message, timestamp)
    .run();
  const row = await first<JournalRow>(
    db,
    `SELECT j.*, u.display_name AS author_name
       FROM journal_entries j
       JOIN users u ON u.id = j.author_user_id
      WHERE j.id = ?`,
    id,
  );
  return row ? mapJournal(row) : null;
}

export async function createDocumentRecord(db: D1Database, input: { caseId: string; storageKey: string; fileName: string; mimeType: string; uploadedBy: string }) {
  const id = createId("document");
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO documents (id, case_id, storage_key, file_name, mime_type, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.caseId, input.storageKey, input.fileName, input.mimeType, input.uploadedBy, timestamp)
    .run();
  const row = await first<DocumentRow>(
    db,
    `SELECT d.*, u.display_name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.id = ?`,
    id,
  );
  return row ? mapDocument(row) : null;
}

export async function updateCaseState(db: D1Database, caseId: string, familyName: string | null, state: CaseState) {
  const updatedAt = nowIso();
  await db
    .prepare("UPDATE cases SET family_name = COALESCE(?, family_name), state_json = ?, updated_at = ? WHERE id = ?")
    .bind(familyName, JSON.stringify(state), updatedAt, caseId)
    .run();
  return await getCaseRow(db, caseId);
}

export async function closeCase(db: D1Database, caseId: string, closureNote?: string) {
  const row = await getCaseRow(db, caseId);
  if (!row) return null;
  const state = mapCaseState(row);
  const timestamp = nowIso();
  state.currentPhaseLabel = "Closed to CPS";
  if (closureNote) {
    state.closureAlertNote = closureNote;
  }
  await db
    .prepare("UPDATE cases SET status = 'closed', closed_at = ?, state_json = ?, updated_at = ? WHERE id = ?")
    .bind(timestamp, JSON.stringify(state), timestamp, caseId)
    .run();
  return await getCaseRow(db, caseId);
}

export async function listOrganizationUsers(db: D1Database, organizationId: string) {
  const rows = await all<UserRow>(
    db,
    "SELECT * FROM users WHERE organization_id = ? ORDER BY display_name ASC",
    organizationId,
  );
  return rows.map(mapUser);
}

export async function updateUserActiveState(db: D1Database, userId: string, active: boolean) {
  const timestamp = nowIso();
  await db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, timestamp, userId).run();
  return await getUserById(db, userId);
}

export async function listAuditEvents(db: D1Database, organizationId: string, limit = 200) {
  const rows = await all<AuditRow>(
    db,
    `SELECT a.*, u.display_name AS actor_name
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.organization_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?`,
    organizationId,
    limit,
  );
  return rows.map(mapAudit);
}

export async function writeAuditEvent(db: D1Database, input: AuditEventInput) {
  await db
    .prepare(
      "INSERT INTO audit_events (id, organization_id, case_id, actor_user_id, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      createId("audit"),
      input.organizationId,
      input.caseId || null,
      input.actorUserId || null,
      input.eventType,
      JSON.stringify(input.metadata || {}),
      nowIso(),
    )
    .run();
}

export async function listInvitations(db: D1Database, organizationId: string) {
  const rows = await all<InvitationRow>(
    db,
    "SELECT * FROM invitations WHERE organization_id = ? ORDER BY invited_at DESC",
    organizationId,
  );
  return rows.map(mapInvitation);
}

export async function createInvitation(db: D1Database, input: { organizationId: string; caseId?: string | null; email: string; userType: UserType; caseRole?: CaseMembershipRole | null; invitedBy: string }) {
  const invitation: InvitationRecord = {
    id: createId("invite"),
    organizationId: input.organizationId,
    caseId: input.caseId || null,
    email: input.email.trim().toLowerCase(),
    userType: input.userType,
    caseRole: input.caseRole || null,
    active: true,
    inviteToken: createId("token"),
    invitedBy: input.invitedBy,
    invitedAt: nowIso(),
    acceptedAt: null,
    revokedAt: null,
  };
  await db
    .prepare(
      "INSERT INTO invitations (id, organization_id, case_id, email, user_type, case_role, active, invite_token, invited_by, invited_at, accepted_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
    )
    .bind(
      invitation.id,
      invitation.organizationId,
      invitation.caseId,
      invitation.email,
      invitation.userType,
      invitation.caseRole,
      invitation.active ? 1 : 0,
      invitation.inviteToken,
      invitation.invitedBy,
      invitation.invitedAt,
    )
    .run();
  return invitation;
}

export async function acceptInvitationByEmailOrToken(db: D1Database, input: { email: string; inviteToken?: string | null }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const row = input.inviteToken
    ? await first<InvitationRow>(
        db,
        "SELECT * FROM invitations WHERE invite_token = ? AND active = 1 AND revoked_at IS NULL AND accepted_at IS NULL",
        input.inviteToken,
      )
    : await first<InvitationRow>(
        db,
        "SELECT * FROM invitations WHERE lower(email) = ? AND active = 1 AND revoked_at IS NULL AND accepted_at IS NULL ORDER BY invited_at DESC LIMIT 1",
        normalizedEmail,
      );

  if (!row) return null;
  const timestamp = nowIso();
  await db.prepare("UPDATE invitations SET accepted_at = ? WHERE id = ?").bind(timestamp, row.id).run();
  row.accepted_at = timestamp;
  return mapInvitation(row);
}

export async function findProvisionedUserForIdentity(db: D1Database, email: string | null, subject: string) {
  if (subject) {
    const bySubject = await first<UserRow>(
      db,
      "SELECT * FROM users WHERE external_identity_id = ? LIMIT 1",
      subject,
    );
    if (bySubject) return mapUser(bySubject);
  }
  if (!email) return null;
  const byEmail = await first<UserRow>(
    db,
    "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1",
    email,
  );
  return byEmail ? mapUser(byEmail) : null;
}

export async function bindExternalIdentity(db: D1Database, userId: string, subject: string, email: string | null) {
  await db
    .prepare("UPDATE users SET external_identity_id = ?, email = COALESCE(?, email), updated_at = ? WHERE id = ?")
    .bind(subject, email, nowIso(), userId)
    .run();
  return await getUserById(db, userId);
}

export async function createInvitedUser(db: D1Database, input: { organizationId: string; email: string; displayName: string; userType: UserType; externalIdentityId: string }) {
  const userId = createId("user");
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO users (id, organization_id, external_identity_id, email, display_name, user_type, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(userId, input.organizationId, input.externalIdentityId, input.email.toLowerCase(), input.displayName, input.userType, timestamp, timestamp)
    .run();
  return await getUserById(db, userId);
}

export async function ensureCaseMembership(db: D1Database, input: { caseId: string; userId: string; role: CaseMembershipRole; invitedBy?: string | null; accessScopeJson?: Record<string, unknown> }) {
  const existing = await first<MembershipRow>(
    db,
    "SELECT * FROM case_memberships WHERE case_id = ? AND user_id = ? AND role = ? LIMIT 1",
    input.caseId,
    input.userId,
    input.role,
  );
  const timestamp = nowIso();
  if (existing) {
    await db
      .prepare("UPDATE case_memberships SET active = 1, updated_at = ?, access_scope_json = ? WHERE id = ?")
      .bind(timestamp, JSON.stringify(input.accessScopeJson || {}), existing.id)
      .run();
    const updated = await first<MembershipRow>(
      db,
      "SELECT cm.*, u.display_name, u.email, u.user_type FROM case_memberships cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?",
      existing.id,
    );
    return updated ? mapMembership(updated) : null;
  }

  const id = createId("membership");
  await db
    .prepare(
      "INSERT INTO case_memberships (id, case_id, user_id, role, active, invited_by, invited_at, access_scope_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.caseId,
      input.userId,
      input.role,
      input.invitedBy || null,
      timestamp,
      JSON.stringify(input.accessScopeJson || {}),
      timestamp,
      timestamp,
    )
    .run();
  const row = await first<MembershipRow>(
    db,
    "SELECT cm.*, u.display_name, u.email, u.user_type FROM case_memberships cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?",
    id,
  );
  return row ? mapMembership(row) : null;
}

export async function updateMembership(db: D1Database, membershipId: string, patch: { role?: CaseMembershipRole; active?: boolean; accessScopeJson?: Record<string, unknown> }) {
  const existing = await first<MembershipRow>(
    db,
    "SELECT * FROM case_memberships WHERE id = ?",
    membershipId,
  );
  if (!existing) return null;
  const nextRole = patch.role || (existing.role as CaseMembershipRole);
  const nextActive = typeof patch.active === "boolean" ? (patch.active ? 1 : 0) : existing.active;
  const nextScope = JSON.stringify(patch.accessScopeJson || parseJson<Record<string, unknown>>(existing.access_scope_json, {}));
  await db
    .prepare("UPDATE case_memberships SET role = ?, active = ?, access_scope_json = ?, updated_at = ? WHERE id = ?")
    .bind(nextRole, nextActive, nextScope, nowIso(), membershipId)
    .run();
  const row = await first<MembershipRow>(
    db,
    "SELECT cm.*, u.display_name, u.email, u.user_type FROM case_memberships cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?",
    membershipId,
  );
  return row ? mapMembership(row) : null;
}
