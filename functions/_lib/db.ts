import { cloneDefaultCaseState, defaultCaseState } from "../../shared/default-case-state";
import type {
  AlternativePaymentRequestRecord,
  AppUser,
  AuditEventRecord,
  BillingEventRecord,
  CaseMembershipRecord,
  CaseState,
  CaseSummary,
  DocumentItem,
  InvitationRecord,
  JournalEntry,
  OrganizationLicenseSummary,
  OrganizationRecord,
  PlatformOwnerOrganizationSummary,
  PlatformOwnerUserRecord,
  SupportTicketRecord,
  UserType,
} from "../../shared/types";
import type { CaseMembershipRole } from "../../shared/types";
import type {
  AuditEventInput,
  AlternativePaymentRequestRow,
  AuditRow,
  BillingEventRow,
  CaseRecordRow,
  D1Database,
  DocumentRow,
  InvitationRow,
  JournalRow,
  MembershipRow,
  OrganizationRow,
  SupportTicketRow,
  UserRow,
  LocalCredentialRow,
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

export async function listOrganizations(db: D1Database) {
  const rows = await all<OrganizationRow>(db, "SELECT * FROM organizations ORDER BY updated_at DESC");
  return rows.map(mapOrganization);
}

export async function findOrganizationByName(db: D1Database, organizationName: string) {
  const row = await first<OrganizationRow>(
    db,
    "SELECT * FROM organizations WHERE lower(name) = lower(?) LIMIT 1",
    organizationName,
  );
  return row ? mapOrganization(row) : null;
}

export async function createOrganization(db: D1Database, input: { name: string; settingsJson?: Record<string, unknown> }) {
  const id = createId("org");
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO organizations (id, name, status, settings_json, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)",
    )
    .bind(id, input.name.trim(), JSON.stringify(input.settingsJson || {}), timestamp, timestamp)
    .run();
  return await getOrganizationById(db, id);
}

export async function findOrganizationUserByEmail(db: D1Database, organizationId: string, email: string | null) {
  if (!email) return null;
  const row = await first<UserRow>(
    db,
    "SELECT * FROM users WHERE organization_id = ? AND lower(email) = lower(?) LIMIT 1",
    organizationId,
    email,
  );
  return row ? mapUser(row) : null;
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

export async function getCaseDocument(db: D1Database, caseId: string, documentId: string) {
  const row = await first<DocumentRow>(
    db,
    `SELECT d.*, u.display_name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.case_id = ? AND d.id = ?`,
    caseId,
    documentId,
  );
  return row ? mapDocument(row) : null;
}

export async function deleteCaseDocumentRecord(db: D1Database, caseId: string, documentId: string) {
  const row = await first<DocumentRow>(
    db,
    `SELECT d.*, u.display_name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.case_id = ? AND d.id = ?`,
    caseId,
    documentId,
  );
  if (!row) return null;
  await db.prepare("DELETE FROM documents WHERE case_id = ? AND id = ?").bind(caseId, documentId).run();
  return mapDocument(row);
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

export async function createCaseRecord(
  db: D1Database,
  input: { organizationId: string; familyName: string; createdBy: string; state?: Partial<CaseState> },
) {
  const id = createId("case");
  const timestamp = nowIso();
  const familyName = input.familyName.trim();
  const baseState = cloneDefaultCaseState();
  const nextState: CaseState = {
    ...baseState,
    ...input.state,
    workspaceName:
      input.state?.workspaceName?.trim() ||
      (familyName ? `${familyName} Safeguarding Workspace` : baseState.workspaceName),
    changeLog: [
      {
        id: createId("change"),
        message: "Case created",
        author: input.createdBy,
        audience: "staff_only",
        timestamp,
      },
      ...((input.state?.changeLog || baseState.changeLog) ?? []),
    ],
  };

  await db
    .prepare(
      "INSERT INTO cases (id, organization_id, family_name, status, state_json, created_by, created_at, closed_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?, ?, NULL, ?)",
    )
    .bind(id, input.organizationId, familyName, JSON.stringify(nextState), input.createdBy, timestamp, timestamp)
    .run();

  return await getCaseRow(db, id);
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
  state.currentPhaseLabel = "Closed to service";
  if (closureNote) {
    state.closureAlertNote = closureNote;
  }
  await db
    .prepare("UPDATE cases SET status = 'closed', closed_at = ?, state_json = ?, updated_at = ? WHERE id = ?")
    .bind(timestamp, JSON.stringify(state), timestamp, caseId)
    .run();
  return await getCaseRow(db, caseId);
}

async function resolveExistingTableSet(db: D1Database) {
  const rows = await all<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  return new Set(rows.map((row) => String(row.name || "").trim()));
}

export async function deleteCaseRecord(db: D1Database, caseId: string) {
  const row = await getCaseRow(db, caseId);
  if (!row) return null;
  const existingTables = await resolveExistingTableSet(db);
  const hasTable = (name: string) => existingTables.has(name);
  const statements = [];

  if (hasTable("documents")) {
    statements.push(db.prepare("DELETE FROM documents WHERE case_id = ?").bind(caseId));
  }
  if (hasTable("journal_entries")) {
    statements.push(db.prepare("DELETE FROM journal_entries WHERE case_id = ?").bind(caseId));
  }
  if (hasTable("case_memberships")) {
    statements.push(db.prepare("DELETE FROM case_memberships WHERE case_id = ?").bind(caseId));
  }
  if (hasTable("invitations")) {
    statements.push(db.prepare("DELETE FROM invitations WHERE case_id = ?").bind(caseId));
  }
  if (hasTable("audit_events")) {
    statements.push(db.prepare("DELETE FROM audit_events WHERE case_id = ?").bind(caseId));
  }
  if (hasTable("cases")) {
    statements.push(db.prepare("DELETE FROM cases WHERE id = ?").bind(caseId));
  }

  if (statements.length) {
    await db.batch(statements);
  }
  return row;
}

export async function listOrganizationUsers(db: D1Database, organizationId: string) {
  const rows = await all<UserRow>(
    db,
    "SELECT * FROM users WHERE organization_id = ? AND email NOT LIKE '%@deleted.local' ORDER BY display_name ASC",
    organizationId,
  );
  return rows.map(mapUser);
}

export async function listAllUsersForOwner(db: D1Database, limit = 500) {
  const rows = await all<UserRow & { organization_name: string }>(
    db,
    `SELECT u.*, o.name AS organization_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.email NOT LIKE '%@deleted.local'
      ORDER BY u.updated_at DESC
      LIMIT ?`,
    limit,
  );

  return rows.map((row) => ({
    ...mapUser(row),
    organizationName: row.organization_name,
  })) as PlatformOwnerUserRecord[];
}

export async function countPendingInvitationsForOrganization(db: D1Database, organizationId: string) {
  const row = await first<{ total: number }>(
    db,
    "SELECT COUNT(*) AS total FROM invitations WHERE organization_id = ? AND active = 1 AND accepted_at IS NULL AND revoked_at IS NULL AND user_type IN ('org_admin', 'worker', 'supervisor')",
    organizationId,
  );
  return Number(row?.total || 0);
}

export async function countOpenCasesForOrganization(db: D1Database, organizationId: string) {
  const row = await first<{ total: number }>(
    db,
    "SELECT COUNT(*) AS total FROM cases WHERE organization_id = ? AND status = 'open'",
    organizationId,
  );
  return Number(row?.total || 0);
}

export function deriveOrganizationLicenseSummary(
  organization: OrganizationRecord,
  stats: {
    activeUsers: number;
    pausedUsers: number;
    pendingInvitations: number;
    openCases: number;
  },
): OrganizationLicenseSummary {
  const settings = organization.settingsJson || {};
  const rawSeatCount = Number(settings.licensedSeatCount);
  const licensedSeatCount = Number.isInteger(rawSeatCount) && rawSeatCount > 0 ? rawSeatCount : null;
  const rawLicenseStatus = typeof settings.licenseStatus === "string" ? settings.licenseStatus.trim().toLowerCase() : "";
  const accessState: OrganizationLicenseSummary["accessState"] =
    organization.status === "archived"
      ? "archived"
      : rawLicenseStatus === "paused"
        ? "paused"
        : rawLicenseStatus === "trial" && licensedSeatCount !== null
          ? "trial"
          : rawLicenseStatus === "active" && licensedSeatCount !== null
            ? "licensed"
            : "unlicensed";
  const isLicensed = accessState === "licensed" || accessState === "trial";
  const licenseGateMessage =
    accessState === "archived"
      ? "This workspace has been archived. Contact the platform owner if access needs to be restored."
      : accessState === "paused"
        ? "This workspace is currently paused. Contact the platform owner to restore licensed access."
        : accessState === "unlicensed"
          ? "This workspace does not yet have an active licensed seat allocation. Contact the platform owner to activate access before using the live case workspace."
          : accessState === "trial"
            ? "This workspace is using an active trial allocation."
            : "Licensed workspace access is active.";
  const remainingSeats = isLicensed && licensedSeatCount !== null ? Math.max(0, licensedSeatCount - stats.activeUsers) : 0;
  const remainingProvisioningSlots =
    isLicensed && licensedSeatCount !== null ? Math.max(0, licensedSeatCount - stats.activeUsers - stats.pendingInvitations) : 0;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    licensedSeatCount,
    licensedPlanName: typeof settings.licensedPlanName === "string" ? settings.licensedPlanName : undefined,
    licenseStatus: typeof settings.licenseStatus === "string" ? settings.licenseStatus : undefined,
    accessState,
    isLicensed,
    licenseGateMessage,
    activeUsers: stats.activeUsers,
    pausedUsers: stats.pausedUsers,
    pendingInvitations: stats.pendingInvitations,
    openCases: stats.openCases,
    remainingSeats,
    remainingProvisioningSlots,
  };
}

export async function getOrganizationLicenseSummary(db: D1Database, organization: OrganizationRecord) {
  const [users, pendingInvitations, openCases] = await Promise.all([
    listOrganizationUsers(db, organization.id),
    countPendingInvitationsForOrganization(db, organization.id),
    countOpenCasesForOrganization(db, organization.id),
  ]);

  const activeUsers = users.filter((user) => user.active).length;
  const pausedUsers = users.length - activeUsers;
  return deriveOrganizationLicenseSummary(organization, {
    activeUsers,
    pausedUsers,
    pendingInvitations,
    openCases,
  });
}

export async function listOrganizationsForOwner(db: D1Database) {
  const organizations = await listOrganizations(db);
  const summaries = await Promise.all(organizations.map((organization) => getOrganizationLicenseSummary(db, organization)));
  return organizations.map((organization, index) => ({
    ...summaries[index],
    status: organization.status,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  })) as PlatformOwnerOrganizationSummary[];
}

export async function updateOrganizationSettings(
  db: D1Database,
  organizationId: string,
  patch: Record<string, unknown>,
) {
  const current = await getOrganizationById(db, organizationId);
  if (!current) return null;
  const nextSettings = {
    ...(current.settingsJson || {}),
    ...patch,
  };
  const updatedAt = nowIso();
  await db
    .prepare("UPDATE organizations SET settings_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(nextSettings), updatedAt, organizationId)
    .run();
  return await getOrganizationById(db, organizationId);
}

export async function updateOrganizationStatus(db: D1Database, organizationId: string, status: string) {
  const updatedAt = nowIso();
  await db
    .prepare("UPDATE organizations SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, updatedAt, organizationId)
    .run();
  return await getOrganizationById(db, organizationId);
}

export async function deleteOrganizationRecord(db: D1Database, organizationId: string) {
  const organization = await getOrganizationById(db, organizationId);
  if (!organization) return null;
  const existingTables = new Set(
    (
      await all<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
    ).map((row) => String(row.name || "").trim()),
  );
  const hasTable = (name: string) => existingTables.has(name);

  const statements = [];

  if (hasTable("support_tickets")) {
    statements.push(db.prepare("UPDATE support_tickets SET organization_id = NULL WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("alternative_payment_requests")) {
    statements.push(
      db.prepare("UPDATE alternative_payment_requests SET organization_id = NULL WHERE organization_id = ?").bind(organizationId),
    );
  }
  if (hasTable("billing_events")) {
    statements.push(db.prepare("UPDATE billing_events SET organization_id = NULL WHERE organization_id = ?").bind(organizationId));
  }

  if (hasTable("documents") && hasTable("cases")) {
    statements.push(
      db.prepare("DELETE FROM documents WHERE case_id IN (SELECT id FROM cases WHERE organization_id = ?)").bind(organizationId),
    );
  }
  if (hasTable("journal_entries") && hasTable("cases")) {
    statements.push(
      db.prepare("DELETE FROM journal_entries WHERE case_id IN (SELECT id FROM cases WHERE organization_id = ?)").bind(organizationId),
    );
  }
  if (hasTable("case_memberships") && hasTable("cases")) {
    statements.push(
      db.prepare("DELETE FROM case_memberships WHERE case_id IN (SELECT id FROM cases WHERE organization_id = ?)").bind(organizationId),
    );
  }
  if (hasTable("case_memberships") && hasTable("users")) {
    statements.push(
      db.prepare("DELETE FROM case_memberships WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)").bind(organizationId),
    );
  }
  if (hasTable("invitations")) {
    statements.push(db.prepare("DELETE FROM invitations WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("audit_events")) {
    statements.push(db.prepare("DELETE FROM audit_events WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("auth_sessions")) {
    statements.push(db.prepare("DELETE FROM auth_sessions WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("cases")) {
    statements.push(db.prepare("DELETE FROM cases WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("local_credentials") && hasTable("users")) {
    statements.push(
      db.prepare("DELETE FROM local_credentials WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)").bind(organizationId),
    );
  }
  if (hasTable("users")) {
    statements.push(db.prepare("DELETE FROM users WHERE organization_id = ?").bind(organizationId));
  }
  if (hasTable("organizations")) {
    statements.push(db.prepare("DELETE FROM organizations WHERE id = ?").bind(organizationId));
  }

  if (statements.length) {
    await db.batch(statements);
  }
  return organization;
}

export async function countActiveOrganizationUsersByType(db: D1Database, organizationId: string, userType: UserType) {
  const row = await first<{ total: number }>(
    db,
    "SELECT COUNT(*) AS total FROM users WHERE organization_id = ? AND user_type = ? AND active = 1",
    organizationId,
    userType,
  );
  return Number(row?.total || 0);
}

export async function updateUserActiveState(db: D1Database, userId: string, active: boolean) {
  const timestamp = nowIso();
  await db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, timestamp, userId).run();
  return await getUserById(db, userId);
}

export async function updateUserDisplayName(db: D1Database, userId: string, displayName: string) {
  const timestamp = nowIso();
  await db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").bind(displayName, timestamp, userId).run();
  return await getUserById(db, userId);
}

export async function softDeleteUserAccount(db: D1Database, organizationId: string, userId: string) {
  const current = await first<UserRow>(
    db,
    "SELECT * FROM users WHERE id = ? AND organization_id = ?",
    userId,
    organizationId,
  );
  if (!current) return null;

  const timestamp = nowIso();
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase() || crypto.randomUUID().slice(0, 12);
  const deletedEmail = `deleted+${suffix}@deleted.local`;
  const deletedName = `Deleted account ${suffix.slice(-6)}`;

  const existingTables = await resolveExistingTableSet(db);
  const hasTable = (name: string) => existingTables.has(name);
  const statements = [
    db
      .prepare(
        "UPDATE users SET active = 0, external_identity_id = NULL, email = ?, display_name = ?, updated_at = ? WHERE id = ? AND organization_id = ?",
      )
      .bind(deletedEmail, deletedName, timestamp, userId, organizationId),
  ];

  if (hasTable("auth_sessions")) {
    statements.push(db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId));
  }
  if (hasTable("local_credentials")) {
    statements.push(db.prepare("DELETE FROM local_credentials WHERE user_id = ?").bind(userId));
  }
  if (hasTable("case_memberships")) {
    statements.push(db.prepare("UPDATE case_memberships SET active = 0, updated_at = ? WHERE user_id = ?").bind(timestamp, userId));
  }
  if (hasTable("invitations")) {
    statements.push(
      db
        .prepare(
          "UPDATE invitations SET active = 0, revoked_at = COALESCE(revoked_at, ?) WHERE organization_id = ? AND lower(email) = lower(?) AND active = 1",
        )
        .bind(timestamp, organizationId, current.email),
    );
  }

  await db.batch(statements);

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

export async function listAuditEventsForOwner(db: D1Database, limit = 200) {
  const rows = await all<AuditRow>(
    db,
    `SELECT a.*, u.display_name AS actor_name
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT ?`,
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

export async function getInvitationById(db: D1Database, organizationId: string, invitationId: string) {
  const row = await first<InvitationRow>(
    db,
    "SELECT * FROM invitations WHERE organization_id = ? AND id = ? LIMIT 1",
    organizationId,
    invitationId,
  );
  return row ? mapInvitation(row) : null;
}

export async function revokeInvitation(db: D1Database, organizationId: string, invitationId: string) {
  const timestamp = nowIso();
  await db
    .prepare(
      "UPDATE invitations SET active = 0, revoked_at = COALESCE(revoked_at, ?) WHERE organization_id = ? AND id = ? AND active = 1 AND accepted_at IS NULL",
    )
    .bind(timestamp, organizationId, invitationId)
    .run();
  return await getInvitationById(db, organizationId, invitationId);
}

export async function deactivateInvitation(db: D1Database, organizationId: string, invitationId: string) {
  const timestamp = nowIso();
  await db
    .prepare(
      "UPDATE invitations SET active = 0, revoked_at = COALESCE(revoked_at, ?) WHERE organization_id = ? AND id = ?",
    )
    .bind(timestamp, organizationId, invitationId)
    .run();
  return await getInvitationById(db, organizationId, invitationId);
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

export async function findActiveInvitationByEmailOrToken(db: D1Database, input: { email: string; inviteToken?: string | null }) {
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
  return row ? mapInvitation(row) : null;
}

export async function markInvitationAccepted(db: D1Database, invitationId: string) {
  const timestamp = nowIso();
  await db.prepare("UPDATE invitations SET accepted_at = ? WHERE id = ?").bind(timestamp, invitationId).run();
  const row = await first<InvitationRow>(db, "SELECT * FROM invitations WHERE id = ?", invitationId);
  return row ? mapInvitation(row) : null;
}

export async function revokeSiblingInvitationsForEmail(
  db: D1Database,
  organizationId: string,
  email: string,
  keepInvitationId: string,
) {
  const timestamp = nowIso();
  await db
    .prepare(
      "UPDATE invitations SET active = 0, revoked_at = COALESCE(revoked_at, ?) WHERE organization_id = ? AND lower(email) = lower(?) AND id != ? AND active = 1 AND accepted_at IS NULL",
    )
    .bind(timestamp, organizationId, email.trim().toLowerCase(), keepInvitationId)
    .run();
}

export async function acceptInvitationByEmailOrToken(db: D1Database, input: { email: string; inviteToken?: string | null }) {
  const invitation = await findActiveInvitationByEmailOrToken(db, input);
  if (!invitation) return null;
  return await markInvitationAccepted(db, invitation.id);
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
  const byEmail = await all<UserRow>(
    db,
    "SELECT * FROM users WHERE lower(email) = lower(?) AND email NOT LIKE '%@deleted.local' LIMIT 3",
    email,
  );
  if (byEmail.length !== 1) return null;
  return mapUser(byEmail[0]);
}

export async function bindExternalIdentity(db: D1Database, userId: string, subject: string, email: string | null) {
  await db
    .prepare("UPDATE users SET external_identity_id = ?, email = COALESCE(?, email), updated_at = ? WHERE id = ?")
    .bind(subject, email, nowIso(), userId)
    .run();
  return await getUserById(db, userId);
}

export async function createInvitedUser(db: D1Database, input: { organizationId: string; email: string; displayName: string; userType: UserType; externalIdentityId?: string | null }) {
  const userId = createId("user");
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO users (id, organization_id, external_identity_id, email, display_name, user_type, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(
      userId,
      input.organizationId,
      input.externalIdentityId || null,
      input.email.toLowerCase(),
      input.displayName,
      input.userType,
      timestamp,
      timestamp,
    )
    .run();
  return await getUserById(db, userId);
}

export async function getLocalCredentialByUserId(db: D1Database, userId: string) {
  return await first<LocalCredentialRow>(db, "SELECT * FROM local_credentials WHERE user_id = ?", userId);
}

export async function upsertLocalCredential(
  db: D1Database,
  input: { userId: string; passwordHash: string; passwordSalt: string; passwordIterations: number },
) {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO local_credentials (user_id, password_hash, password_salt, password_iterations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         password_salt = excluded.password_salt,
         password_iterations = excluded.password_iterations,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.userId,
      input.passwordHash,
      input.passwordSalt,
      input.passwordIterations,
      timestamp,
      timestamp,
    )
    .run();
  return await getLocalCredentialByUserId(db, input.userId);
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

function mapSupportTicket(row: SupportTicketRow): SupportTicketRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    ...(row.organization_name ? { organizationName: row.organization_name } : {}),
    summary: row.summary,
    details: row.details,
    ...(row.steps_to_reproduce ? { stepsToReproduce: row.steps_to_reproduce } : {}),
    ...(row.expected_outcome ? { expectedOutcome: row.expected_outcome } : {}),
    ...(row.actual_outcome ? { actualOutcome: row.actual_outcome } : {}),
    ...(row.current_path ? { currentPath: row.current_path } : {}),
    ...(row.active_tab ? { activeTab: row.active_tab } : {}),
    ...(row.screenshot_name ? { screenshotName: row.screenshot_name } : {}),
    ...(row.screenshot_content_type ? { screenshotContentType: row.screenshot_content_type } : {}),
    ...(row.screenshot_data_url ? { screenshotDataUrl: row.screenshot_data_url } : {}),
    targetEmail: row.target_email,
    createdAt: row.created_at,
    status: "submitted",
  };
}

function mapAlternativePaymentRequest(row: AlternativePaymentRequestRow): AlternativePaymentRequestRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.user_id ? { userId: row.user_id } : {}),
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    fullName: row.full_name,
    organizationName: row.organization_name,
    email: row.email,
    requestedPlan: row.plan_id as AlternativePaymentRequestRecord["requestedPlan"],
    planName: row.plan_name,
    seatCount: row.seat_count,
    preferredPaymentMethod: row.preferred_payment_method as AlternativePaymentRequestRecord["preferredPaymentMethod"],
    country: row.country,
    ...(row.region ? { region: row.region } : {}),
    ...(row.po_number ? { poNumber: row.po_number } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    requestStatus: row.request_status as AlternativePaymentRequestRecord["requestStatus"],
    ...(row.admin_notes ? { adminNotes: row.admin_notes } : {}),
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    ...(row.activation_starts_at ? { activationStartsAt: row.activation_starts_at } : {}),
    ...(row.activation_ends_at ? { activationEndsAt: row.activation_ends_at } : {}),
    ...(row.external_reference ? { externalReference: row.external_reference } : {}),
  };
}

function mapBillingEvent(row: BillingEventRow): BillingEventRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source as BillingEventRecord["source"],
    eventType: row.event_type,
    status: row.status,
    ...(row.organization_name ? { organizationName: row.organization_name } : {}),
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
    ...(row.plan_id ? { planId: row.plan_id } : {}),
    ...(row.plan_name ? { planName: row.plan_name } : {}),
    ...(row.stripe_event_id ? { stripeEventId: row.stripe_event_id } : {}),
    ...(row.stripe_checkout_session_id ? { stripeCheckoutSessionId: row.stripe_checkout_session_id } : {}),
    ...(row.stripe_customer_id ? { stripeCustomerId: row.stripe_customer_id } : {}),
    ...(row.stripe_subscription_id ? { stripeSubscriptionId: row.stripe_subscription_id } : {}),
    ...(typeof row.amount_minor === "number" ? { amountMinor: row.amount_minor } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
    metadataJson: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

export async function createSupportTicket(
  db: D1Database,
  input: SupportTicketRecord & { userId?: string | null; organizationId?: string | null }
) {
  await db
    .prepare(
      `INSERT INTO support_tickets (
        id, user_id, organization_id, full_name, email, organization_name, summary, details,
        steps_to_reproduce, expected_outcome, actual_outcome, current_path, active_tab,
        screenshot_name, screenshot_content_type, screenshot_data_url, target_email, status, admin_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .bind(
      input.id,
      input.userId || null,
      input.organizationId || null,
      input.fullName,
      input.email.toLowerCase(),
      input.organizationName || null,
      input.summary,
      input.details,
      input.stepsToReproduce || null,
      input.expectedOutcome || null,
      input.actualOutcome || null,
      input.currentPath || null,
      input.activeTab || null,
      input.screenshotName || null,
      input.screenshotContentType || null,
      input.screenshotDataUrl || null,
      input.targetEmail,
      input.status,
      input.createdAt
    )
    .run();
  const row = await first<SupportTicketRow>(db, "SELECT * FROM support_tickets WHERE id = ?", input.id);
  return row ? mapSupportTicket(row) : null;
}

export async function listSupportTicketsForAdmin(db: D1Database, limit = 100) {
  const rows = await all<SupportTicketRow>(db, "SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?", limit);
  return rows.map(mapSupportTicket);
}

export async function createAlternativePaymentRequest(db: D1Database, input: AlternativePaymentRequestRecord) {
  await db
    .prepare(
      `INSERT INTO alternative_payment_requests (
        id, created_at, updated_at, user_id, organization_id, full_name, organization_name, email, plan_id, plan_name,
        seat_count, preferred_payment_method, country, region, po_number, notes, request_status, admin_notes,
        approved_at, approved_by, activation_starts_at, activation_ends_at, external_reference
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.createdAt,
      input.updatedAt,
      input.userId || null,
      input.organizationId || null,
      input.fullName,
      input.organizationName,
      input.email.toLowerCase(),
      input.requestedPlan,
      input.planName,
      input.seatCount,
      input.preferredPaymentMethod,
      input.country,
      input.region || null,
      input.poNumber || null,
      input.notes || null,
      input.requestStatus,
      input.adminNotes || null,
      input.approvedAt || null,
      input.approvedBy || null,
      input.activationStartsAt || null,
      input.activationEndsAt || null,
      input.externalReference || null
    )
    .run();
  const row = await first<AlternativePaymentRequestRow>(db, "SELECT * FROM alternative_payment_requests WHERE id = ?", input.id);
  return row ? mapAlternativePaymentRequest(row) : null;
}

export async function listAlternativePaymentRequestsForAdmin(db: D1Database, status?: string, limit = 100) {
  const rows = status
    ? await all<AlternativePaymentRequestRow>(
        db,
        "SELECT * FROM alternative_payment_requests WHERE request_status = ? ORDER BY created_at DESC LIMIT ?",
        status,
        limit
      )
    : await all<AlternativePaymentRequestRow>(
        db,
        "SELECT * FROM alternative_payment_requests ORDER BY created_at DESC LIMIT ?",
        limit
      );
  return rows.map(mapAlternativePaymentRequest);
}

export async function getAlternativePaymentRequestById(db: D1Database, id: string) {
  const row = await first<AlternativePaymentRequestRow>(db, "SELECT * FROM alternative_payment_requests WHERE id = ?", id);
  return row ? mapAlternativePaymentRequest(row) : null;
}

export async function updateAlternativePaymentRequestById(
  db: D1Database,
  id: string,
  patch: Partial<AlternativePaymentRequestRecord>
) {
  const current = await first<AlternativePaymentRequestRow>(db, "SELECT * FROM alternative_payment_requests WHERE id = ?", id);
  if (!current) return null;

  const next = {
    ...mapAlternativePaymentRequest(current),
    ...patch,
    id,
  };

  await db
    .prepare(
      `UPDATE alternative_payment_requests
          SET updated_at = ?, full_name = ?, organization_name = ?, email = ?, plan_id = ?, plan_name = ?, seat_count = ?,
              preferred_payment_method = ?, country = ?, region = ?, po_number = ?, notes = ?, request_status = ?,
              admin_notes = ?, approved_at = ?, approved_by = ?, activation_starts_at = ?, activation_ends_at = ?, external_reference = ?
        WHERE id = ?`
    )
    .bind(
      next.updatedAt,
      next.fullName,
      next.organizationName,
      next.email.toLowerCase(),
      next.requestedPlan,
      next.planName,
      next.seatCount,
      next.preferredPaymentMethod,
      next.country,
      next.region || null,
      next.poNumber || null,
      next.notes || null,
      next.requestStatus,
      next.adminNotes || null,
      next.approvedAt || null,
      next.approvedBy || null,
      next.activationStartsAt || null,
      next.activationEndsAt || null,
      next.externalReference || null,
      id
    )
    .run();

  const row = await first<AlternativePaymentRequestRow>(db, "SELECT * FROM alternative_payment_requests WHERE id = ?", id);
  return row ? mapAlternativePaymentRequest(row) : null;
}

export async function createBillingEvent(db: D1Database, input: BillingEventRecord & { userId?: string | null; organizationId?: string | null }) {
  await db
    .prepare(
      `INSERT INTO billing_events (
        id, created_at, source, stripe_event_id, stripe_checkout_session_id, stripe_customer_id, stripe_subscription_id,
        organization_name, contact_email, plan_id, plan_name, amount_minor, currency, event_type, status, metadata_json,
        user_id, organization_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.createdAt,
      input.source,
      input.stripeEventId || null,
      input.stripeCheckoutSessionId || null,
      input.stripeCustomerId || null,
      input.stripeSubscriptionId || null,
      input.organizationName || null,
      input.contactEmail || null,
      input.planId || null,
      input.planName || null,
      typeof input.amountMinor === "number" ? input.amountMinor : null,
      input.currency || null,
      input.eventType,
      input.status,
      JSON.stringify(input.metadataJson || {}),
      input.userId || null,
      input.organizationId || null
    )
    .run();
  const row = await first<BillingEventRow>(db, "SELECT * FROM billing_events WHERE id = ?", input.id);
  return row ? mapBillingEvent(row) : null;
}

export async function listBillingEventsForAdmin(db: D1Database, limit = 100) {
  const rows = await all<BillingEventRow>(db, "SELECT * FROM billing_events ORDER BY created_at DESC LIMIT ?", limit);
  return rows.map(mapBillingEvent);
}
