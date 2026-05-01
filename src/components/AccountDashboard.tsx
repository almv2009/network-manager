import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ApiError,
  closeCase,
  createCase,
  createInvitation,
  deletePractitionerInvitation,
  deleteCase,
  fetchPractitionerInvitations,
  type PractitionerInvitationRecord,
  type SessionResponse,
} from "../api";

type Props = {
  session: SessionResponse;
  onSessionRefresh: () => Promise<void>;
};

type PractitionerInviteRole = "caregiver" | "network_member";

const practitionerInviteRoleOptions: { value: PractitionerInviteRole; label: string }[] = [
  { value: "caregiver", label: "Caregiver" },
  { value: "network_member", label: "Network member" },
];

function formatAccessState(accessState: string) {
  return accessState.replace(/_/g, " ");
}

function formatRoleLabel(userType: string) {
  return userType.replace(/_/g, " ");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return parsed.toLocaleString();
}

function formatCaseLabel(invitation: PractitionerInvitationRecord) {
  if (invitation.caseFamilyName) return invitation.caseFamilyName;
  if (!invitation.caseId) return "No case linked";
  return "Linked case";
}

function buildInviteUrl(inviteToken: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/sign-in?invite=${encodeURIComponent(inviteToken)}&returnTo=${encodeURIComponent("/account")}`;
}

function formatPractitionerInviteError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "case_membership_required") {
      return "Invite blocked: you are not an active member of the selected case. Ask your admin/supervisor to add or restore your case membership first.";
    }
    if (error.code === "case_closed_worker_access_revoked" || error.code === "case_closed_supervisor_access_revoked") {
      return "Invite blocked: the selected case is closed for your role. Choose an open case or ask an admin to review closed-case access settings.";
    }
    if (error.code === "organization_membership_required") {
      return "Invite blocked: your account is not scoped to this organization/case. Sign in to the correct workspace or contact your admin.";
    }
    return error.hint || error.message;
  }
  if (error instanceof Error) return error.message;
  return "The invitation could not be sent.";
}

export function AccountDashboard({ session, onSessionRefresh }: Props) {
  const isPractitioner = session.user.userType === "worker" || session.user.userType === "supervisor";
  const isFamilyOrNetwork = session.user.userType === "caregiver" || session.user.userType === "network_member";

  if (isPractitioner) {
    return <PractitionerDashboard session={session} onSessionRefresh={onSessionRefresh} />;
  }
  if (isFamilyOrNetwork) {
    return <FamilyNetworkDashboard session={session} />;
  }
  return <OrganizationAdminAccountDashboard session={session} />;
}

function PractitionerDashboard({ session, onSessionRefresh }: Props) {
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState("");
  const [caseSubmitting, setCaseSubmitting] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCaseId, setInviteCaseId] = useState("");
  const [inviteRole, setInviteRole] = useState<PractitionerInviteRole>("caregiver");
  const [closeCaseId, setCloseCaseId] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState("");
  const [busyInvitationId, setBusyInvitationId] = useState("");
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [invitations, setInvitations] = useState<PractitionerInvitationRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const accessibleCases = session.accessibleCases || [];

  const openCases = useMemo(
    () =>
      accessibleCases
        .filter((caseRecord) => caseRecord.status === "open")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [accessibleCases],
  );
  const closedCases = useMemo(
    () =>
      accessibleCases
        .filter((caseRecord) => caseRecord.status === "closed")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [accessibleCases],
  );

  const pendingInvites = useMemo(
    () => invitations.filter((invitation) => invitation.active && !invitation.acceptedAt),
    [invitations],
  );
  const acceptedInvites = useMemo(
    () => invitations.filter((invitation) => invitation.active && Boolean(invitation.acceptedAt)),
    [invitations],
  );

  useEffect(() => {
    if (!inviteCaseId && openCases.length) {
      setInviteCaseId(openCases[0].id);
      return;
    }
    if (inviteCaseId && !openCases.find((caseRecord) => caseRecord.id === inviteCaseId)) {
      setInviteCaseId(openCases[0]?.id || "");
    }
  }, [inviteCaseId, openCases]);

  useEffect(() => {
    if (!closeCaseId && openCases.length) {
      setCloseCaseId(openCases[0].id);
      return;
    }
    if (closeCaseId && !openCases.find((caseRecord) => caseRecord.id === closeCaseId)) {
      setCloseCaseId(openCases[0]?.id || "");
    }
  }, [closeCaseId, openCases]);

  const loadPractitionerInvitations = async () => {
    setInvitesLoading(true);
    setErrorMessage("");
    try {
      const response = await fetchPractitionerInvitations();
      setInvitations(response.invitations);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invitation tracking could not be loaded.");
    } finally {
      setInvitesLoading(false);
    }
  };

  useEffect(() => {
    void loadPractitionerInvitations();
  }, []);

  const handleRefreshDashboard = async () => {
    setRefreshingDashboard(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await onSessionRefresh();
      await loadPractitionerInvitations();
      setStatusMessage("Practitioner dashboard refreshed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The practitioner dashboard could not be refreshed.");
    } finally {
      setRefreshingDashboard(false);
    }
  };

  const handleCreateCase = async () => {
    const trimmedFamilyName = familyName.trim();
    if (!trimmedFamilyName) {
      setErrorMessage("Family name is required before creating a case.");
      return;
    }
    setCaseSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await createCase(session.organization.id, { familyName: trimmedFamilyName });
      setFamilyName("");
      await onSessionRefresh();
      setStatusMessage("Case created and added to your roster.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The case could not be created.");
    } finally {
      setCaseSubmitting(false);
    }
  };

  const handleSendInvite = async () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Invitation email is required.");
      return;
    }
    if (!session.license.isLicensed) {
      setErrorMessage(session.license.licenseGateMessage || "Licensing is inactive for this workspace.");
      return;
    }
    if (!inviteCaseId) {
      setErrorMessage("Choose an open case before sending an invitation.");
      return;
    }
    setInviteSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await createInvitation({
        email: normalizedEmail,
        userType: inviteRole === "caregiver" ? "caregiver" : "network_member",
        caseRole: inviteRole,
        caseId: inviteCaseId,
      });
      setInviteEmail("");
      await loadPractitionerInvitations();
      if (response.delivery.status === "sent") {
        setStatusMessage(response.delivery.detail || "Invitation approved and sent. Track acceptance in the invitation status section.");
      } else if (response.delivery.status === "manual") {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(response.inviteUrl);
          }
          setStatusMessage("Email delivery is not configured. The invite link has been copied so you can send it directly.");
        } catch {
          setStatusMessage(`Email delivery is not configured. Share this invite link manually: ${response.inviteUrl}`);
        }
      } else {
        let copied = false;
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(response.inviteUrl);
            copied = true;
          }
        } catch {
          copied = false;
        }
        setErrorMessage(
          `Invite created, but email delivery failed: ${response.delivery.detail}${copied ? " The invite link was copied so you can send it manually." : ""}`,
        );
      }
    } catch (error) {
      setErrorMessage(formatPractitionerInviteError(error));
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleCopyInviteLink = async (inviteToken: string, email: string) => {
    const inviteUrl = buildInviteUrl(inviteToken);
    setErrorMessage("");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      }
      setStatusMessage(`Invite link copied for ${email}.`);
    } catch {
      setStatusMessage(`Copy this invite link manually: ${inviteUrl}`);
    }
  };

  const handleRemoveInvitation = async (
    invitation: PractitionerInvitationRecord,
    mode: "pending" | "accepted",
  ) => {
    const prompt =
      mode === "accepted"
        ? `Remove ${invitation.email} from the case? This will deactivate their case membership access.`
        : `Remove the pending invite for ${invitation.email}?`;
    if (!window.confirm(prompt)) {
      return;
    }
    setBusyInvitationId(invitation.id);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await deletePractitionerInvitation(invitation.id);
      await loadPractitionerInvitations();
      if (response.action === "member_removed") {
        setStatusMessage("Member removed from the case.");
      } else if (response.action === "invite_revoked") {
        setStatusMessage("Pending invite removed.");
      } else if (response.action === "invite_already_inactive") {
        setStatusMessage("Invite was already inactive.");
      } else {
        setStatusMessage("Invite updated.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The invite could not be updated.");
    } finally {
      setBusyInvitationId("");
    }
  };

  const handleCloseCase = async () => {
    if (!closeCaseId) {
      setErrorMessage("Choose an open case to close.");
      return;
    }
    const selectedCase = openCases.find((caseRecord) => caseRecord.id === closeCaseId);
    const selectedCaseLabel = selectedCase?.familyName || "this case";
    if (
      !window.confirm(
        `Final warning: closing "${selectedCaseLabel}" is treated as final and may result in loss of case data visibility.\n\nAre you sure you want to close/delete this case?`,
      )
    ) {
      return;
    }
    setCloseSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await closeCase(closeCaseId, closureNote.trim());
      await onSessionRefresh();
      setClosureNote("");
      setStatusMessage("Case closed. Family and network access can continue when memberships stay active.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The case could not be closed.");
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleDeleteCase = async (caseId: string, familyCaseName: string) => {
    if (
      !window.confirm(
        `Delete the case file for "${familyCaseName}"? This will permanently remove the case and all related data. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingCaseId(caseId);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await deleteCase(caseId);
      await onSessionRefresh();
      setStatusMessage("Case file deleted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The case file could not be deleted.");
    } finally {
      setDeletingCaseId("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Practitioner dashboard</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Case, invite, and family access operations</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Practitioners create cases, invite family and network members, and close cases when needed. Organization admins manage licensing and seat allocation.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleRefreshDashboard()}
            disabled={refreshingDashboard}
            className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            {refreshingDashboard ? "Refreshing..." : "Refresh dashboard"}
          </button>
        </div>
        {statusMessage ? (
          <div className="nm-toast-success mt-4" role="status" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="nm-toast-error mt-4" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Role" value={formatRoleLabel(session.user.userType)} helper="Practitioner access profile" />
        <MetricCard label="Visible cases" value={String(accessibleCases.length)} helper="Cases currently in your roster" />
        <MetricCard label="Open cases" value={String(openCases.length)} helper="Cases available for active work" />
        <MetricCard label="Pending invites" value={String(pendingInvites.length)} helper="Invitations awaiting acceptance" />
      </div>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Case creation and closure</h3>
        <p className="mt-1 text-sm text-slate-600">
          Create new cases from this dashboard. Close cases here when work is complete. Closed cases move into archived case records.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Create case</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Family name
                <input
                  className="input"
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  placeholder="Example: Khan family"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={caseSubmitting || !familyName.trim() || !session.license.isLicensed}
                  onClick={() => void handleCreateCase()}
                  className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                >
                  {caseSubmitting ? "Creating..." : !session.license.isLicensed ? "License inactive" : "Create case"}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Close case</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Open case
                <select className="input" value={closeCaseId} onChange={(event) => setCloseCaseId(event.target.value)}>
                  <option value="">Choose an open case</option>
                  {openCases.map((caseRecord) => (
                    <option key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.familyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Closure note (optional)
                <textarea
                  className="textarea min-h-[84px]"
                  value={closureNote}
                  onChange={(event) => setClosureNote(event.target.value)}
                  placeholder="Short note for closure context"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={closeSubmitting || !closeCaseId}
                  onClick={() => void handleCloseCase()}
                  className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                >
                  {closeSubmitting ? "Closing..." : "Close case"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Family and network invitation status</h3>
        <p className="mt-1 text-sm text-slate-600">
          Invite caregivers or network members by case, then monitor who is pending and who has accepted.
        </p>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {session.license.isLicensed
            ? "Caregiver and network-member invitations are not limited by licensed seat allocation. Practitioner seat allocation is managed separately by organization admins."
            : session.license.licenseGateMessage || "Licensing is inactive for this workspace."}
        </div>
        {statusMessage ? (
          <div className="nm-toast-success mt-3" role="status" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="nm-toast-error mt-3" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Send invitation</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Email
                <input
                  className="input"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Case
                <select
                  className="input"
                  value={inviteCaseId}
                  onChange={(event) => setInviteCaseId(event.target.value)}
                  disabled={!openCases.length}
                >
                  <option value="">Choose a case</option>
                  {openCases.map((caseRecord) => (
                    <option key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.familyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Invite as
                <select
                  className="input"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as PractitionerInviteRole)}
                  disabled={!openCases.length}
                >
                  {practitionerInviteRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={inviteSubmitting || !inviteEmail.trim() || !inviteCaseId || !session.license.isLicensed || !openCases.length}
                  onClick={() => void handleSendInvite()}
                  className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                >
                  {inviteSubmitting
                    ? "Sending..."
                    : !session.license.isLicensed
                      ? "License inactive"
                      : "Send invite"}
                </button>
              </div>
              {!openCases.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Create a family case first. Caregiver and network invitations require a linked open case.
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pending</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{pendingInvites.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Accepted</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{acceptedInvites.length}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Pending invitations</div>
              <div className="mt-3 space-y-3 nm-scroll-pane">
                {invitesLoading ? (
                  <div className="text-sm text-slate-600">Loading invitations...</div>
                ) : pendingInvites.length ? (
                  pendingInvites.map((invitation) => (
                    <div key={invitation.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">{invitation.email}</div>
                      <div className="mt-1">
                        {formatRoleLabel(invitation.caseRole || invitation.userType)} • {formatCaseLabel(invitation)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Invited {new Date(invitation.invitedAt).toLocaleString()}</div>
                      <div className="mt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyInviteLink(invitation.inviteToken, invitation.email)}
                            className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                          >
                            Copy invite link
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveInvitation(invitation, "pending")}
                            disabled={busyInvitationId === invitation.id}
                            className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-60"
                          >
                            {busyInvitationId === invitation.id ? "Removing..." : "Remove invite"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-600">No pending invitations.</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Accepted invitations by case</div>
              <div className="mt-3 space-y-3 nm-scroll-pane">
                {invitesLoading ? (
                  <div className="text-sm text-slate-600">Loading invitations...</div>
                ) : acceptedInvites.length ? (
                  acceptedInvites.map((invitation) => (
                    <div key={invitation.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">{invitation.email}</div>
                      <div className="mt-1">
                        {formatRoleLabel(invitation.caseRole || invitation.userType)} • {formatCaseLabel(invitation)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Accepted {invitation.acceptedAt ? new Date(invitation.acceptedAt).toLocaleString() : "Not yet accepted"}
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => void handleRemoveInvitation(invitation, "accepted")}
                          disabled={busyInvitationId === invitation.id}
                          className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-60"
                        >
                          {busyInvitationId === invitation.id ? "Removing..." : "Remove member"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-600">No accepted invitations yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">My case roster</h3>
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
          >
            Open case workspace
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Open cases are listed first with open timestamps. Closed cases are shown as archived with archive timestamps.
        </p>
        <div className="mt-4 space-y-3 nm-scroll-pane">
          {[...openCases, ...closedCases].length ? (
            [...openCases, ...closedCases].map((caseRecord) => (
              <div key={caseRecord.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{caseRecord.familyName}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {caseRecord.status === "closed" ? "archived" : "open"} • {caseRecord.membershipRole ? formatRoleLabel(caseRecord.membershipRole) : "No role"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Opened {formatTimestamp(caseRecord.createdAt)}</div>
                    {caseRecord.status === "closed" ? (
                      <div className="mt-1 text-xs text-slate-500">Archived {formatTimestamp(caseRecord.closedAt)}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {formatAccessState(caseRecord.accessState)}
                    </span>
                    {caseRecord.status !== "closed" ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteCase(caseRecord.id, caseRecord.familyName)}
                        disabled={deletingCaseId === caseRecord.id}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      >
                        {deletingCaseId === caseRecord.id ? "Deleting..." : "Delete case file"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No cases are currently visible to this account.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FamilyNetworkDashboard({ session }: { session: SessionResponse }) {
  const accessibleCases = session.accessibleCases || [];
  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Family and network dashboard</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Your case access and updates</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          This view is intentionally focused: your role, your visible cases, and what access you keep after case closure.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Organization" value={session.organization.name} helper="Current workspace" />
        <MetricCard label="Role" value={formatRoleLabel(session.user.userType)} helper="Provisioned case role" />
        <MetricCard label="Visible cases" value={String(accessibleCases.length)} helper="Cases available to your account" />
        <MetricCard label="License state" value={formatAccessState(session.license.accessState)} helper="Workspace billing access state" />
      </div>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">How access works for family and network members</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <div className="font-semibold text-slate-900">Relevant access only</div>
            <p className="mt-2">
              You only see cases linked to your account. Organization administration, licensing, and internal staff controls are hidden from this view.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <div className="font-semibold text-slate-900">After closure</div>
            <p className="mt-2">
              Closed cases can remain accessible to family and network members when those memberships stay active, so continuity work can continue on-platform.
            </p>
          </div>
        </div>
      </section>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">My visible case roster</h3>
        <div className="mt-4 space-y-3 nm-scroll-pane">
          {accessibleCases.length ? (
            accessibleCases.map((caseRecord) => (
              <div key={caseRecord.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{caseRecord.familyName}</div>
                    <div className="mt-1 text-sm text-slate-600">{caseRecord.status}</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {formatAccessState(caseRecord.accessState)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No cases are currently visible to this account.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function OrganizationAdminAccountDashboard({ session }: { session: SessionResponse }) {
  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization account</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">My account</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Use the admin dashboard for organization operations. Case creation is practitioner-owned in this workspace.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Organization" value={session.organization.name} helper="Current workspace" />
        <MetricCard label="Role" value={formatRoleLabel(session.user.userType)} helper="Provisioned role" />
        <MetricCard label="License status" value={formatAccessState(session.license.accessState)} helper="Workspace access state" />
        <MetricCard label="Visible cases" value={String(session.accessibleCases.length)} helper="Read-only roster visibility" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <section className="app-metric rounded-3xl border p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </section>
  );
}
