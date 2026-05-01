import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ApiError,
  createCaseMembership,
  createInvitation,
  deleteAdminInvitation,
  deleteAdminOrganization,
  deleteUserAccount,
  fetchAdminLicenseSummary,
  fetchBillingPlans,
  fetchCase,
  fetchAdminAlternativePaymentRequests,
  fetchAdminUsers,
  fetchOrganizationCases,
  patchCase,
  patchCaseMembership,
  patchUserActive,
  startBillingCheckout,
  submitAlternativePaymentRequest,
  type SessionResponse,
  updateAdminOrganizationLicense,
  updateAdminOrganizationStatus,
  updateAdminAlternativePaymentRequest,
} from "../api";
import { BillingModal } from "./BillingModal";
import {
  ALTERNATIVE_PAYMENT_REQUEST_STATUSES,
  ALTERNATIVE_PAYMENT_METHODS,
  type AlternativePaymentRequestRecord,
  type AlternativePaymentMethod,
  type AlternativePaymentRequestStatus,
  type NetworkBillingPlanOption,
  type CaseMembershipRecord,
  type CaseSummary,
  type FamilyManagedHandoverStatus,
  type InvitationRecord,
  type OrganizationLicenseSummary,
  type UserType,
} from "../../shared/types";
import { getBillingPlanCatalog } from "../../shared/billing-plans";

type Props = {
  session: SessionResponse;
};

type RequestDraft = {
  requestStatus: AlternativePaymentRequestStatus;
  adminNotes: string;
  externalReference: string;
};

type HandoverFormState = {
  status: FamilyManagedHandoverStatus;
  leadMembershipId: string;
  notes: string;
};

const userTypeOptions: { value: UserType; label: string }[] = [
  { value: "supervisor", label: "Supervisor" },
  { value: "worker", label: "Worker" },
];

const caseRoleOptions: { value: CaseMembershipRecord["role"]; label: string }[] = [
  { value: "supervisor", label: "Supervisor" },
  { value: "worker", label: "Worker" },
  { value: "caregiver", label: "Caregiver" },
  { value: "network_member", label: "Network member" },
];

const inviteCaseRoleOptions: { value: Exclude<CaseMembershipRecord["role"], "caregiver" | "network_member">; label: string }[] = [
  { value: "supervisor", label: "Supervisor" },
  { value: "worker", label: "Worker" },
];

function prettifyUserType(value: string) {
  return value.replace(/_/g, " ");
}

function buildInviteUrl(inviteToken: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/sign-in?invite=${encodeURIComponent(inviteToken)}&returnTo=${encodeURIComponent("/account")}`;
}

function formatSeatValue(value: number | null, fallback = "Not set") {
  return value === null ? fallback : String(value);
}

function formatCaseLinkLabel(invitation: InvitationRecord, casesById: Map<string, string>) {
  if (!invitation.caseId) return "No case link";
  return casesById.get(invitation.caseId) || "Linked case";
}

function sortCases(caseA: CaseSummary, caseB: CaseSummary) {
  if (caseA.status !== caseB.status) {
    return caseA.status === "open" ? -1 : 1;
  }
  return new Date(caseB.updatedAt).getTime() - new Date(caseA.updatedAt).getTime();
}

function formatAdminInviteError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "organization_unlicensed") {
      return error.hint || "Invite blocked: this workspace license is not active.";
    }
    if (error.code === "bad_request") {
      return error.hint || "Invite blocked: check the invitation fields and try again.";
    }
    if (error.code === "org_admin_required") {
      return "Invite blocked: only organization admins can invite workers and supervisors.";
    }
    if (error.code === "case_membership_required") {
      return "Invite blocked: practitioners can only invite caregiver/network users into cases where they are active members.";
    }
    return error.hint || error.message;
  }
  if (error instanceof Error) return error.message;
  return "The invitation could not be sent.";
}

export function AdminDashboard({ session }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [users, setUsers] = useState<SessionResponse["user"][]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [requests, setRequests] = useState<AlternativePaymentRequestRecord[]>([]);
  const [licenseSummary, setLicenseSummary] = useState<OrganizationLicenseSummary | null>(null);
  const [requestsFilter, setRequestsFilter] = useState<AlternativePaymentRequestStatus | "all">("all");
  const [busyUserId, setBusyUserId] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [licenseActionBusy, setLicenseActionBusy] = useState("");
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteErrorMessage, setInviteErrorMessage] = useState("");
  const [busyInvitationId, setBusyInvitationId] = useState("");
  const [membershipCaseId, setMembershipCaseId] = useState("");
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipBusyId, setMembershipBusyId] = useState("");
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [membershipCase, setMembershipCase] = useState<Awaited<ReturnType<typeof fetchCase>> | null>(null);
  const [handoverForm, setHandoverForm] = useState<HandoverFormState>({
    status: "not_started",
    leadMembershipId: "",
    notes: "",
  });
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingPlans, setBillingPlans] = useState<NetworkBillingPlanOption[]>(
    getBillingPlanCatalog().map((plan) => ({ ...plan, availableForCheckout: false })),
  );
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [alternativePaymentsEnabled, setAlternativePaymentsEnabled] = useState(true);
  const [allowedAlternativePaymentMethods, setAllowedAlternativePaymentMethods] = useState<AlternativePaymentMethod[]>([
    ...ALTERNATIVE_PAYMENT_METHODS,
  ]);
  const [billingCheckoutSubmitting, setBillingCheckoutSubmitting] = useState(false);
  const [billingAlternativeSubmitting, setBillingAlternativeSubmitting] = useState(false);
  const [billingCheckoutErrorMessage, setBillingCheckoutErrorMessage] = useState("");
  const [billingCheckoutStatusMessage, setBillingCheckoutStatusMessage] = useState("");
  const [billingAlternativeErrorMessage, setBillingAlternativeErrorMessage] = useState("");
  const [billingAlternativeStatusMessage, setBillingAlternativeStatusMessage] = useState("");
  const [membershipForm, setMembershipForm] = useState<{
    userId: string;
    role: CaseMembershipRecord["role"];
  }>({
    userId: "",
    role: "worker",
  });
  const [requestDrafts, setRequestDrafts] = useState<Record<string, RequestDraft>>({});
  const [inviteForm, setInviteForm] = useState<{
    email: string;
    userType: UserType;
    caseId: string;
    caseRole: CaseMembershipRecord["role"] | "";
  }>({
    email: "",
    userType: "worker",
    caseId: "",
    caseRole: "",
  });
  const [invitationSearch, setInvitationSearch] = useState("");
  const [invitationTypeFilter, setInvitationTypeFilter] = useState<"all" | UserType>("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [caseStatusFilter, setCaseStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [membershipSearch, setMembershipSearch] = useState("");
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const shouldOpenBillingOnLoad = searchParams.get("openBilling") === "1";
  const setupMode = searchParams.get("setup") || "";

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersResponse, casesResponse, requestsResponse, licenseSummaryResponse] = await Promise.all([
        fetchAdminUsers(),
        fetchOrganizationCases(session.organization.id),
        fetchAdminAlternativePaymentRequests(requestsFilter),
        fetchAdminLicenseSummary(),
      ]);

      setUsers(usersResponse.users.filter((user) => user.organizationId === session.organization.id));
      setInvitations(usersResponse.invitations.filter((invitation) => invitation.organizationId === session.organization.id));
      setCases(casesResponse.cases);
      setRequests(requestsResponse.requests);
      setLicenseSummary(licenseSummaryResponse.summary);
      setMembershipCaseId((current) => current || casesResponse.cases[0]?.id || "");
      setRequestDrafts((current) => {
        const next = { ...current };
        requestsResponse.requests.forEach((request) => {
          next[request.id] = next[request.id] || {
            requestStatus: request.requestStatus,
            adminNotes: request.adminNotes || "",
            externalReference: request.externalReference || "",
          };
        });
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The admin dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const refreshDashboard = async () => {
    setRefreshingDashboard(true);
    setError("");
    setStatusMessage("");
    try {
      await loadData();
      setStatusMessage("Admin dashboard refreshed.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The admin dashboard could not be refreshed.");
    } finally {
      setRefreshingDashboard(false);
    }
  };

  useEffect(() => {
    if (!session.permissions.isOrgAdmin) return;
    void loadData();
  }, [session.organization.id, session.permissions.isOrgAdmin, requestsFilter]);

  useEffect(() => {
    if (!session.permissions.isOrgAdmin) return;
    if (typeof window === "undefined") return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadData();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 15000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [session.organization.id, session.permissions.isOrgAdmin, requestsFilter]);

  useEffect(() => {
    if (!session.permissions.isOrgAdmin) return;
    void (async () => {
      try {
        const response = await fetchBillingPlans();
        setBillingPlans(response.plans);
        setBillingConfigured(response.configured);
        setAlternativePaymentsEnabled(response.alternativePaymentsEnabled);
        setAllowedAlternativePaymentMethods(response.allowedAlternativePaymentMethods);
      } catch {
        setBillingPlans(getBillingPlanCatalog().map((plan) => ({ ...plan, availableForCheckout: false })));
      }
    })();
  }, [session.permissions.isOrgAdmin]);

  useEffect(() => {
    if (!membershipCaseId) {
      setMembershipCase(null);
      return;
    }
    void loadMembershipCase(membershipCaseId);
  }, [membershipCaseId]);

  useEffect(() => {
    if (!membershipCase) {
      setHandoverForm({
        status: "not_started",
        leadMembershipId: "",
        notes: "",
      });
      return;
    }
    setHandoverForm({
      status: membershipCase.state.familyManagedHandoverStatus || "not_started",
      leadMembershipId: membershipCase.state.familyManagedHandoverLeadMembershipId || "",
      notes: membershipCase.state.familyManagedHandoverNotes || "",
    });
  }, [membershipCase]);

  useEffect(() => {
    if (!shouldOpenBillingOnLoad) return;
    openBillingModal();
    setStatusMessage("Choose a package to activate this workspace before inviting users or opening the live case workspace.");
    const next = new URLSearchParams(searchParams);
    next.delete("openBilling");
    next.delete("setup");
    const nextSearch = next.toString();
    navigate(`/admin${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
  }, [navigate, searchParams, shouldOpenBillingOnLoad]);

  const orgUsers = useMemo(
    () => users.filter((user) => user.organizationId === session.organization.id),
    [session.organization.id, users],
  );
  const orgInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.organizationId === session.organization.id),
    [invitations, session.organization.id],
  );
  const activeUsers = useMemo(() => orgUsers.filter((user) => user.active), [orgUsers]);
  const pausedUsers = orgUsers.length - activeUsers.length;
  const pendingInvitations = useMemo(
    () => orgInvitations.filter((invitation) => invitation.active && !invitation.acceptedAt),
    [orgInvitations],
  );
  const openCases = useMemo(() => cases.filter((caseRecord) => caseRecord.status === "open"), [cases]);
  const closedCases = cases.length - openCases.length;
  const sortedCases = useMemo(() => [...cases].sort(sortCases), [cases]);
  const assignableUsers = useMemo(
    () => orgUsers.filter((user) => user.active && user.userType !== "org_admin"),
    [orgUsers],
  );
  const casesById = useMemo(
    () => new Map(cases.map((caseRecord) => [caseRecord.id, caseRecord.familyName])),
    [cases],
  );
  const selectedMembershipCaseSummary = useMemo(
    () => cases.find((caseRecord) => caseRecord.id === membershipCaseId) || null,
    [cases, membershipCaseId],
  );
  const filteredPendingInvitations = useMemo(() => {
    const needle = invitationSearch.trim().toLowerCase();
    return pendingInvitations.filter((invitation) => {
      const typeMatches = invitationTypeFilter === "all" || invitation.userType === invitationTypeFilter;
      if (!typeMatches) return false;
      if (!needle) return true;
      return [
        invitation.email,
        invitation.userType,
        invitation.caseRole || "",
        formatCaseLinkLabel(invitation, casesById),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [casesById, invitationSearch, invitationTypeFilter, pendingInvitations]);
  const filteredSortedCases = useMemo(() => {
    const needle = caseSearch.trim().toLowerCase();
    return sortedCases.filter((caseRecord) => {
      const statusMatches = caseStatusFilter === "all" || caseRecord.status === caseStatusFilter;
      if (!statusMatches) return false;
      if (!needle) return true;
      return [caseRecord.familyName, caseRecord.status].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [caseSearch, caseStatusFilter, sortedCases]);
  const filteredMemberships = useMemo(() => {
    const memberships = membershipCase?.memberships || [];
    const needle = membershipSearch.trim().toLowerCase();
    if (!needle) return memberships;
    return memberships.filter((membership) =>
      [
        membership.displayName || "",
        membership.email || "",
        membership.userId,
        membership.role,
        membership.userType || "",
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [membershipCase, membershipSearch]);
  const familyHandoverCandidates = useMemo(
    () =>
      (membershipCase?.memberships || []).filter(
        (membership) =>
          membership.active &&
          (membership.role === "caregiver" || membership.role === "network_member"),
      ),
    [membershipCase],
  );
  const organizationLicensed = Boolean(licenseSummary?.isLicensed);
  const licenseProvisioningLocked = !organizationLicensed || (licenseSummary?.remainingProvisioningSlots || 0) < 1;
  const licenseRestoreLocked = !organizationLicensed || (licenseSummary?.remainingSeats || 0) < 1;

  const handlePauseToggle = async (userId: string, nextActive: boolean) => {
    if (nextActive && licenseRestoreLocked) {
      setError("No purchased seats are currently free. Increase the seat allocation or free a seat first.");
      return;
    }
    setBusyUserId(userId);
    setError("");
    setStatusMessage("");
    try {
      const response = await patchUserActive(userId, nextActive);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...response.user } : user)));
      setStatusMessage(nextActive ? "Account restored." : "Account paused.");
      const nextSummary = await fetchAdminLicenseSummary();
      setLicenseSummary(nextSummary.summary);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "User access could not be updated.");
    } finally {
      setBusyUserId("");
    }
  };

  const handleDelete = async (userId: string, displayName: string) => {
    if (!window.confirm(`Delete ${displayName}'s account access? This will deactivate the account and remove sign-in access.`)) {
      return;
    }
    setBusyUserId(userId);
    setError("");
    setStatusMessage("");
    try {
      const response = await deleteUserAccount(userId);
      setUsers((current) => current.filter((user) => user.id !== userId));
      setStatusMessage("Account deleted.");
      const nextSummary = await fetchAdminLicenseSummary();
      setLicenseSummary(nextSummary.summary);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The account could not be deleted.");
    } finally {
      setBusyUserId("");
    }
  };

  const handleInvite = async () => {
    if (licenseProvisioningLocked) {
      setInviteErrorMessage("This organization has no remaining purchased seats available for new invitations.");
      return;
    }
    setInviteSubmitting(true);
    setInviteErrorMessage("");
    setError("");
    setStatusMessage("");
    try {
      const response = await createInvitation({
        email: inviteForm.email,
        userType: inviteForm.userType,
        caseRole: inviteForm.caseRole,
        caseId: inviteForm.caseId,
      });
      setInvitations((current) => [response.invitation, ...current.filter((invitation) => invitation.id !== response.invitation.id)]);
      setInviteForm({ email: "", userType: "worker", caseId: "", caseRole: "" });
      setStatusMessage(
        response.delivery.status === "manual"
          ? "Invitation created. Copy the invite link below and share it through organization-owned messaging."
          : response.delivery.detail || "Invitation created.",
      );
      const nextSummary = await fetchAdminLicenseSummary();
      setLicenseSummary(nextSummary.summary);
    } catch (inviteError) {
      setInviteErrorMessage(formatAdminInviteError(inviteError));
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleCopyInviteLink = async (inviteToken: string) => {
    const inviteUrl = buildInviteUrl(inviteToken);
    setError("");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      }
      setStatusMessage("Invite link copied.");
    } catch {
      setStatusMessage(`Copy this invite link manually: ${inviteUrl}`);
    }
  };

  const handleRemoveInvite = async (invitationId: string, email: string) => {
    if (!window.confirm(`Remove the pending invite for ${email}? This will release the allocated seat for reassignment.`)) {
      return;
    }
    setBusyInvitationId(invitationId);
    setError("");
    setStatusMessage("");
    try {
      const response = await deleteAdminInvitation(invitationId);
      setInvitations((current) =>
        current.map((invitation) => (invitation.id === invitationId ? response.invitation : invitation)),
      );
      setStatusMessage(
        response.alreadyRevoked
          ? "Invite was already inactive."
          : "Invite removed. The seat is now available for reassignment.",
      );
      const nextSummary = await fetchAdminLicenseSummary();
      setLicenseSummary(nextSummary.summary);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The invitation could not be removed.");
    } finally {
      setBusyInvitationId("");
    }
  };

  const refreshLicenseSummary = async () => {
    const nextSummary = await fetchAdminLicenseSummary();
    setLicenseSummary(nextSummary.summary);
    return nextSummary.summary;
  };

  const handleAdjustSeats = async (delta: 1 | -1) => {
    const currentSeatCount = Number(licenseSummary?.licensedSeatCount || 0);
    const nextSeatCount = Math.max(1, currentSeatCount + delta);
    if (delta < 0 && currentSeatCount <= 1) {
      setError("At least one seat must remain. Archive the organization if this workspace should be disabled.");
      return;
    }
    setLicenseActionBusy(delta > 0 ? "add-seat" : "remove-seat");
    setError("");
    setStatusMessage("");
    try {
      const response = await updateAdminOrganizationLicense({
        licensedSeatCount: nextSeatCount,
      });
      setLicenseSummary(response.summary);
      setStatusMessage(delta > 0 ? "Seat allocation increased." : "Seat allocation reduced.");
    } catch (licenseError) {
      setError(licenseError instanceof Error ? licenseError.message : "Seat allocation could not be updated.");
    } finally {
      setLicenseActionBusy("");
    }
  };

  const handleToggleLicensePause = async () => {
    const currentlyPaused = String(licenseSummary?.accessState || "").toLowerCase() === "paused";
    setLicenseActionBusy(currentlyPaused ? "resume-license" : "pause-license");
    setError("");
    setStatusMessage("");
    try {
      const response = await updateAdminOrganizationLicense({
        licenseStatus: currentlyPaused ? "active" : "paused",
      });
      setLicenseSummary(response.summary);
      setStatusMessage(currentlyPaused ? "License resumed." : "License paused.");
    } catch (licenseError) {
      setError(licenseError instanceof Error ? licenseError.message : "License status could not be updated.");
    } finally {
      setLicenseActionBusy("");
    }
  };

  const handleArchiveToggle = async () => {
    const isArchived = String(licenseSummary?.accessState || "").toLowerCase() === "archived";
    const confirmation = isArchived
      ? "Restore this organization workspace?"
      : "Archive this organization workspace? This locks access until restored.";
    if (!window.confirm(confirmation)) return;
    setLicenseActionBusy(isArchived ? "restore-org" : "archive-org");
    setError("");
    setStatusMessage("");
    try {
      const response = await updateAdminOrganizationStatus(isArchived ? "active" : "archived");
      setLicenseSummary(response.summary);
      setStatusMessage(isArchived ? "Organization restored." : "Organization archived.");
      await refreshLicenseSummary();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Organization status could not be updated.");
    } finally {
      setLicenseActionBusy("");
    }
  };

  const handleDeleteOrganization = async () => {
    const confirmed = window.confirm(
      `Delete organization "${session.organization.name}"? This removes all workspace access and cannot be undone.`,
    );
    if (!confirmed) return;
    setLicenseActionBusy("delete-org");
    setError("");
    setStatusMessage("");
    try {
      await deleteAdminOrganization();
      window.location.assign("/auth/sign-out?returnTo=/sign-in?signedOut=1");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Organization could not be deleted.");
      setLicenseActionBusy("");
    }
  };

  const loadMembershipCase = async (caseId: string) => {
    setMembershipLoading(true);
    setError("");
    try {
      const response = await fetchCase(caseId);
      setMembershipCase(response);
    } catch (membershipError) {
      setError(membershipError instanceof Error ? membershipError.message : "The case memberships could not be loaded.");
      setMembershipCase(null);
    } finally {
      setMembershipLoading(false);
    }
  };

  const handleCreateMembership = async () => {
    if (!membershipCaseId || !membershipForm.userId) {
      setError("Choose a case, user, and role before adding a case membership.");
      return;
    }
    setMembershipBusyId("new");
    setError("");
    setStatusMessage("");
    try {
      await createCaseMembership({
        caseId: membershipCaseId,
        userId: membershipForm.userId,
        role: membershipForm.role,
      });
      await loadMembershipCase(membershipCaseId);
      setMembershipForm({ userId: "", role: "worker" });
      setStatusMessage("Case membership added.");
    } catch (membershipError) {
      setError(membershipError instanceof Error ? membershipError.message : "The case membership could not be created.");
    } finally {
      setMembershipBusyId("");
    }
  };

  const handleMembershipUpdate = async (
    membershipId: string,
    payload: { role?: CaseMembershipRecord["role"]; active?: boolean },
    successMessage: string,
  ) => {
    setMembershipBusyId(membershipId);
    setError("");
    setStatusMessage("");
    try {
      const response = await patchCaseMembership(membershipId, payload);
      setMembershipCase((current) =>
        current
          ? {
              ...current,
              memberships: current.memberships.map((membership) =>
                membership.id === membershipId ? response.membership : membership,
              ),
            }
          : current,
      );
      setStatusMessage(successMessage);
    } catch (membershipError) {
      setError(membershipError instanceof Error ? membershipError.message : "The case membership could not be updated.");
    } finally {
      setMembershipBusyId("");
    }
  };

  const handleSaveFamilyManagedHandover = async () => {
    if (!membershipCaseId || !membershipCase) {
      setError("Choose a closed case before updating the handover.");
      return;
    }
    if (selectedMembershipCaseSummary?.status !== "closed") {
      setError("Family-managed handover can only be activated after the case has been closed.");
      return;
    }

    const selectedLead = familyHandoverCandidates.find((membership) => membership.id === handoverForm.leadMembershipId);
    if (handoverForm.status === "active" && !selectedLead) {
      setError("Choose an active caregiver or network member before activating family-managed handover.");
      return;
    }

    setHandoverSaving(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await patchCase(membershipCaseId, {
        state: {
          familyManagedHandoverStatus: handoverForm.status,
          familyManagedHandoverLeadMembershipId: handoverForm.status === "not_started" ? "" : selectedLead?.id || "",
          familyManagedHandoverLeadName: handoverForm.status === "not_started"
            ? ""
            : (selectedLead?.displayName || selectedLead?.email || ""),
          familyManagedHandoverLeadRole: handoverForm.status === "not_started"
            ? ""
            : ((selectedLead?.role as "caregiver" | "network_member" | undefined) || ""),
          familyManagedHandoverActivatedAt:
            handoverForm.status === "active"
              ? membershipCase.state.familyManagedHandoverActivatedAt || new Date().toISOString()
              : "",
          familyManagedHandoverNotes: handoverForm.notes.trim(),
        },
      });
      setMembershipCase((current) =>
        current
          ? {
              ...current,
              caseRecord: response.caseRecord,
              state: response.state,
            }
          : current,
      );
      setCases((current) =>
        current.map((caseRecord) => (caseRecord.id === response.caseRecord.id ? response.caseRecord : caseRecord)),
      );
      setStatusMessage(
        handoverForm.status === "active"
          ? "Family-managed handover is now active for this closed case."
          : handoverForm.status === "planned"
            ? "Family-managed handover has been marked as planned."
            : "Family-managed handover has been reset.",
      );
    } catch (handoverError) {
      setError(handoverError instanceof Error ? handoverError.message : "The handover state could not be updated.");
    } finally {
      setHandoverSaving(false);
    }
  };

  const updateRequestDraft = (requestId: string, patch: Partial<RequestDraft>) => {
    setRequestDrafts((current) => ({
      ...current,
      [requestId]: {
        requestStatus: patch.requestStatus ?? current[requestId]?.requestStatus ?? "submitted",
        adminNotes: patch.adminNotes ?? current[requestId]?.adminNotes ?? "",
        externalReference: patch.externalReference ?? current[requestId]?.externalReference ?? "",
      },
    }));
  };

  const handleRequestUpdate = async (requestId: string) => {
    const draft = requestDrafts[requestId];
    if (!draft) return;
    setBusyRequestId(requestId);
    setError("");
    setStatusMessage("");
    try {
      const response = await updateAdminAlternativePaymentRequest(requestId, {
        requestStatus: draft.requestStatus,
        adminNotes: draft.adminNotes || undefined,
        externalReference: draft.externalReference || undefined,
      });
      setRequests((current) => current.map((request) => (request.id === requestId ? response.request : request)));
      setStatusMessage("Alternative payment request updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The payment request could not be updated.");
    } finally {
      setBusyRequestId("");
    }
  };

  const openBillingModal = () => {
    setBillingCheckoutErrorMessage("");
    setBillingCheckoutStatusMessage("");
    setBillingAlternativeErrorMessage("");
    setBillingAlternativeStatusMessage("");
    setIsBillingModalOpen(true);
  };

  const handleStartCheckout = async (payload: {
    fullName: string;
    organizationName: string;
    email: string;
    requestedPlan: NetworkBillingPlanOption["key"];
    seatCount: number;
  }) => {
    setBillingCheckoutSubmitting(true);
    setBillingCheckoutErrorMessage("");
    setBillingCheckoutStatusMessage("");
    try {
      const response = await startBillingCheckout(payload);
      setBillingCheckoutStatusMessage(response.message);
      window.location.assign(response.url);
    } catch (checkoutError) {
      setBillingCheckoutErrorMessage(checkoutError instanceof Error ? checkoutError.message : "Stripe checkout could not be started.");
    } finally {
      setBillingCheckoutSubmitting(false);
    }
  };

  const handleAlternativePaymentRequest = async (payload: {
    fullName: string;
    organizationName: string;
    email: string;
    requestedPlan: NetworkBillingPlanOption["key"];
    seatCount: number;
    preferredPaymentMethod: AlternativePaymentMethod;
    country: string;
    region?: string;
    poNumber?: string;
    notes?: string;
  }) => {
    setBillingAlternativeSubmitting(true);
    setBillingAlternativeErrorMessage("");
    setBillingAlternativeStatusMessage("");
    try {
      const response = await submitAlternativePaymentRequest(payload);
      setBillingAlternativeStatusMessage(response.message);
      setStatusMessage("Pricing and activation request submitted.");
      await loadData();
    } catch (requestError) {
      setBillingAlternativeErrorMessage(requestError instanceof Error ? requestError.message : "Pricing request could not be submitted.");
    } finally {
      setBillingAlternativeSubmitting(false);
    }
  };

  const renderAlternativePaymentSection = () => (
    <section className="app-card rounded-3xl border p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Alternative payment and activation requests</h3>
          <p className="mt-1 text-sm text-slate-600">Review contact-admin pricing requests, move them through billing status, and record references.</p>
        </div>
        <select
          className="input max-w-[220px]"
          value={requestsFilter}
          onChange={(event) => setRequestsFilter(event.target.value as AlternativePaymentRequestStatus | "all")}
        >
          <option value="all">All statuses</option>
          {ALTERNATIVE_PAYMENT_REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 space-y-4">
        {requests.length ? (
          requests.map((request) => {
            const draft = requestDrafts[request.id] || {
              requestStatus: request.requestStatus,
              adminNotes: request.adminNotes || "",
              externalReference: request.externalReference || "",
            };
            return (
              <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-slate-900">{request.organizationName}</div>
                    <div className="text-sm text-slate-600">{request.fullName} • {request.email}</div>
                    <div className="text-sm text-slate-600">
                      {request.planName} • {request.seatCount} seats • {request.preferredPaymentMethod.replace(/_/g, " ")} • {request.country}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{new Date(request.createdAt).toLocaleString()}</div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Status
                    <select
                      className="input"
                      value={draft.requestStatus}
                      onChange={(event) =>
                        updateRequestDraft(request.id, {
                          requestStatus: event.target.value as AlternativePaymentRequestStatus,
                        })
                      }
                    >
                      {ALTERNATIVE_PAYMENT_REQUEST_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    External reference
                    <input
                      className="input"
                      value={draft.externalReference}
                      onChange={(event) => updateRequestDraft(request.id, { externalReference: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-1">
                    Admin notes
                    <textarea
                      className="textarea min-h-[96px]"
                      value={draft.adminNotes}
                      onChange={(event) => updateRequestDraft(request.id, { adminNotes: event.target.value })}
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyRequestId === request.id}
                    onClick={() => void handleRequestUpdate(request.id)}
                    className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                  >
                    {busyRequestId === request.id ? "Saving..." : "Update request"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            No pricing requests match this filter.
          </div>
        )}
      </div>
    </section>
  );

  if (!session.permissions.isOrgAdmin) {
    return (
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Admin dashboard</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Organization admin access is required for this view.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization admin</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Admin dashboard</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              This dashboard is for organization operations: seat allocation, user access, invitations, cases, case memberships, and local payment requests.
            </p>
            {setupMode === "account" ? (
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Your organization account has been created. The next step is to choose a package so licensed access can be activated.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void refreshDashboard()}
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
        {error ? (
          <div className="nm-toast-error mt-4" role="alert">
            {error}
          </div>
        ) : null}
      </section>

      {openCases.length === 0 ? (
        <section id="invitations" className="app-card rounded-3xl border p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start here</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">No open cases yet</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Case creation is practitioner-owned. Invite or activate practitioners, then they can create cases from their practitioner dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="#invitations" className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Invite practitioner
              </a>
              <a href="/app" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Open case workspace
              </a>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Signed-up users" value={String(orgUsers.length)} helper={`${activeUsers.length} active • ${pausedUsers} paused`} />
        <MetricCard label="Pending invitations" value={String(pendingInvitations.length)} helper="Open invites still awaiting acceptance" />
        <MetricCard label="Open cases" value={String(openCases.length)} helper={`${cases.length} total cases visible to the organization`} />
        <MetricCard
          label="Seats left to allocate"
          value={organizationLicensed ? String(licenseSummary?.remainingProvisioningSlots || 0) : "Locked"}
          helper={organizationLicensed ? "Available for invitations and restored accounts" : "Activate a license to provision users"}
        />
      </div>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Licenses and seat allocation</h3>
            <p className="mt-1 text-sm text-slate-600">
              Track the purchased seats for this organization and allocate people against those seats through invitations and account access.
            </p>
          </div>
          {licenseSummary?.licenseStatus ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {(licenseSummary.accessState || licenseSummary.licenseStatus).replace(/_/g, " ")}
            </span>
          ) : null}
        </div>
        {!organizationLicensed ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Case workspace access is currently locked.</div>
            <div className="mt-1">{licenseSummary?.licenseGateMessage || "Activate a licensed plan before creating cases, inviting users, or assigning people into the live workspace."}</div>
            <div className="mt-3">
              <button
                type="button"
                onClick={openBillingModal}
                className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
              >
                Open pricing request
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Purchased seats"
            value={formatSeatValue(licenseSummary?.licensedSeatCount ?? null)}
            helper={licenseSummary?.licensedPlanName || "Plan name not recorded yet"}
          />
          <MetricCard label="Active assigned users" value={String(licenseSummary?.activeUsers || 0)} helper="People currently using purchased seats" />
          <MetricCard label="Paused users" value={String(licenseSummary?.pausedUsers || 0)} helper="Accounts that can be restored when seats are free" />
          <MetricCard label="Pending invitations" value={String(licenseSummary?.pendingInvitations || 0)} helper="Invitations already holding a seat slot" />
          <MetricCard
            label="Seats left to allocate"
            value={organizationLicensed ? String(licenseSummary?.remainingProvisioningSlots || 0) : "Locked"}
            helper={organizationLicensed ? "Available for new invitations or restored accounts" : "No allocations can be made until licensing is active"}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {!organizationLicensed
            ? licenseSummary?.licenseGateMessage || "Activate a plan before using the live workspace."
            : licenseProvisioningLocked
            ? "All purchased seats are currently allocated. Free a seat or ask the platform owner to increase the seat count before inviting more users."
            : "Only org-admin/worker/supervisor invitations and restored accounts count against purchased seat allocation. Caregiver and network invitations are case-based and do not consume licensed seats."}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          License quantities and organization-level license controls are managed by the platform owner.
          Organization admins can reassign existing seats through user activation, pausing, restoring, and invitation workflows.
        </div>
      </section>

      {!organizationLicensed ? (
        <>
          <section className="app-card rounded-3xl border p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Plans and payment options</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Review the available Network Manager tiers and open the pricing or activation request flow for your organization.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openBillingModal}
                  className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium"
                >
                  Open pricing request
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {billingPlans.map((plan) => (
                <div key={plan.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{plan.label}</div>
                      <div className="mt-1 text-sm text-slate-600">{plan.summary}</div>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                      Contact admin
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Best for</div>
                      <div className="mt-1">{plan.bestFor}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Value</div>
                      <div className="mt-1">{plan.value}</div>
                    </div>
                    <div className="space-y-1">
                      {plan.featureBullets.map((item) => (
                        <div key={item}>• {item}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Payment routes available for pricing requests: {allowedAlternativePaymentMethods.map((method) => method.replace(/_/g, " ")).join(", ")}.
              {billingConfigured ? " Stripe is configured for this deployment." : " Direct pricing requests are currently the primary route in this deployment."}
            </div>
          </section>
          {renderAlternativePaymentSection()}
        </>
      ) : null}

      <div className="space-y-6">
        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">User roster</h3>
              <p className="mt-1 text-sm text-slate-600">Only accounts provisioned for this organization appear here.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active users</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activeUsers.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Paused users</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{pausedUsers}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pending invites</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{pendingInvitations.length}</div>
            </div>
          </div>
          {loading ? (
            <div className="mt-4 text-sm text-slate-600">Loading users…</div>
          ) : (
            <div className="mt-4 space-y-3">
              {orgUsers.length ? (
                orgUsers.map((user) => (
                <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900">{user.displayName}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user.active ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {user.active ? "Active" : "Paused"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                          {prettifyUserType(user.userType)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">{user.email}</div>
                      <div className="text-xs text-slate-500">Created {new Date(user.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busyUserId === user.id || (!user.active && licenseRestoreLocked)}
                        onClick={() => void handlePauseToggle(user.id, !user.active)}
                        className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                      >
                        {user.active ? "Pause account" : !organizationLicensed ? "License inactive" : licenseRestoreLocked ? "No seats free" : "Restore account"}
                      </button>
                      <button
                        type="button"
                        disabled={busyUserId === user.id || user.id === session.user.id}
                        onClick={() => void handleDelete(user.id, user.displayName)}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 disabled:opacity-60"
                      >
                        Delete account
                      </button>
                    </div>
                  </div>
                </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  No users are provisioned in this organization yet.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Invite a user</h3>
          <p className="mt-1 text-sm text-slate-600">
            Admin invitations are limited to workers and supervisors. Caregiver and network invitations must be sent by practitioners from their dashboard.
            If email delivery is not configured yet, copy the invite link and share it manually. Admin practitioner invitations allocate against purchased seats.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <input
                className="input"
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                User type
                <select
                  className="input"
                  value={inviteForm.userType}
                  onChange={(event) =>
                    setInviteForm((current) => ({
                      ...current,
                      userType: event.target.value as UserType,
                    }))
                  }
                >
                  {userTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Case link
                <select
                  className="input"
                  value={inviteForm.caseId}
                  onChange={(event) => setInviteForm((current) => ({ ...current, caseId: event.target.value }))}
                >
                  <option value="">No case link</option>
                  {cases.map((caseRecord) => (
                    <option key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.familyName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Case role
              <select
                className="input"
                value={inviteForm.caseRole}
                onChange={(event) =>
                  setInviteForm((current) => ({ ...current, caseRole: event.target.value as CaseMembershipRecord["role"] | "" }))
                }
              >
                <option value="">No case role</option>
                {inviteCaseRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={inviteSubmitting || !inviteForm.email.trim() || licenseProvisioningLocked}
                onClick={() => void handleInvite()}
                className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
              >
                {inviteSubmitting ? "Sending invite..." : !organizationLicensed ? "License inactive" : licenseProvisioningLocked ? "No seats available" : "Send invitation"}
              </button>
            </div>
            {inviteErrorMessage ? (
              <div className="nm-toast-error mt-1" role="alert">
                {inviteErrorMessage}
              </div>
            ) : null}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {organizationLicensed
              ? "Only pending org-admin/worker/supervisor invitations hold a seat slot until accepted or revoked. Caregiver/network invitations do not consume seats."
              : "Activate a licensed plan before inviting people into the workspace."}
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <input
              className="input"
              value={invitationSearch}
              onChange={(event) => setInvitationSearch(event.target.value)}
              placeholder="Search invitations by email, case, or role"
            />
            <select
              className="input"
              value={invitationTypeFilter}
              onChange={(event) => setInvitationTypeFilter(event.target.value as "all" | UserType)}
            >
              <option value="all">All invite types</option>
              {userTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredPendingInvitations.length} result(s)</div>
          <div className="mt-6 space-y-3 nm-scroll-pane">
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Recent invitations</h4>
            {filteredPendingInvitations.length ? (
              filteredPendingInvitations.map((invitation) => (
                <div key={invitation.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{invitation.email}</div>
                  <div className="mt-1">
                    {prettifyUserType(invitation.userType)}
                    {invitation.caseRole ? ` • ${prettifyUserType(invitation.caseRole)}` : ""}
                    {` • ${formatCaseLinkLabel(invitation, casesById)}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Invited {new Date(invitation.invitedAt).toLocaleString()}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCopyInviteLink(invitation.inviteToken)}
                      className="app-secondary-button rounded-2xl px-4 py-2 text-sm font-medium"
                    >
                      Copy invite link
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveInvite(invitation.id, invitation.email)}
                      disabled={busyInvitationId === invitation.id}
                      className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60"
                    >
                      {busyInvitationId === invitation.id ? "Removing..." : "Remove invite"}
                    </button>
                    <span className="text-xs text-slate-500">
                      One-time access link for {invitation.email}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No pending invitations match this filter. Clear filters or send a new invitation.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6">
        <section id="case-roster" className="app-card rounded-3xl border p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Case roster</h3>
              <p className="mt-1 text-sm text-slate-600">
                Review all organization cases. Case creation and closure are practitioner-owned workflows.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-6 xl:items-stretch xl:grid-cols-[0.82fr_1.18fr]">
            <div className="flex h-full flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total cases</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{cases.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Open</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{openCases.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Closed</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{closedCases}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Admins can review case status here and manage memberships. Practitioners create and close cases from their own dashboard.
              </div>
            </div>
            <div className="flex h-full flex-col gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current case list</div>
                <div className="mt-1 text-sm text-slate-600">Open cases are shown first so the live workspace stays easy to scan.</div>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px]">
                <input
                  className="input"
                  value={caseSearch}
                  onChange={(event) => setCaseSearch(event.target.value)}
                  placeholder="Search cases by family name"
                />
                <select
                  className="input"
                  value={caseStatusFilter}
                  onChange={(event) => setCaseStatusFilter(event.target.value as "all" | "open" | "closed")}
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open only</option>
                  <option value="closed">Closed only</option>
                </select>
              </div>
              <div className="text-xs text-slate-500">{filteredSortedCases.length} result(s)</div>
              {filteredSortedCases.length ? (
                <div className="grid gap-3 lg:grid-cols-2 nm-scroll-pane">
                  {filteredSortedCases.map((caseRecord) => (
                    <div key={caseRecord.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Case</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">{caseRecord.familyName}</div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            caseRecord.status === "open"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          {caseRecord.status}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last updated</div>
                          <div className="mt-1 text-sm text-slate-700">{new Date(caseRecord.updatedAt).toLocaleString()}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace state</div>
                          <div className="mt-1 text-sm text-slate-700">
                            {caseRecord.closedAt ? `Closed ${new Date(caseRecord.closedAt).toLocaleDateString()}` : "Live workspace open"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  No cases match this filter.
                </div>
              )}
            </div>
          </div>
        </section>

      </div>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Case membership management</h3>
            <p className="mt-1 text-sm text-slate-600">
              Assign existing users to cases, change their case role, or remove their access without editing the database directly.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              After closure, keep or add caregiver or network-member access here if the family or chosen family representative should carry the plan forward inside the workspace.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <select
              className="input"
              value={membershipCaseId}
              onChange={(event) => setMembershipCaseId(event.target.value)}
            >
              <option value="">Choose a case</option>
              {cases.map((caseRecord) => (
                <option key={caseRecord.id} value={caseRecord.id}>
                  {caseRecord.familyName} • {caseRecord.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {membershipCaseId ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {selectedMembershipCaseSummary?.status === "closed" ? (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">Family-managed handover</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        Use this closed-case control to make the handover explicit, name the family or network lead, and confirm that the plan is now being carried forward inside the workspace.
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      handoverForm.status === "active"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : handoverForm.status === "planned"
                          ? "border border-amber-200 bg-amber-50 text-amber-700"
                          : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}>
                      {handoverForm.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Handover status
                      <select
                        className="input"
                        value={handoverForm.status}
                        onChange={(event) =>
                          setHandoverForm((current) => ({
                            ...current,
                            status: event.target.value as FamilyManagedHandoverStatus,
                            leadMembershipId: event.target.value === "not_started" ? "" : current.leadMembershipId,
                          }))
                        }
                      >
                        <option value="not_started">Not started</option>
                        <option value="planned">Planned</option>
                        <option value="active">Active</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Family or network lead
                      <select
                        className="input"
                        value={handoverForm.leadMembershipId}
                        onChange={(event) =>
                          setHandoverForm((current) => ({ ...current, leadMembershipId: event.target.value }))
                        }
                        disabled={!familyHandoverCandidates.length || handoverForm.status === "not_started"}
                      >
                        <option value="">
                          {familyHandoverCandidates.length
                            ? "Choose the active caregiver or network representative"
                            : "Add or restore an active caregiver or network member first"}
                        </option>
                        {familyHandoverCandidates.map((membership) => (
                          <option key={membership.id} value={membership.id}>
                            {(membership.displayName || membership.email || membership.userId)} • {membership.role.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Handover notes
                      <textarea
                        className="textarea min-h-[112px]"
                        value={handoverForm.notes}
                        onChange={(event) => setHandoverForm((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Record what has been agreed, what the family or network will manage, and what still needs review."
                      />
                    </label>
                    {membershipCase?.state.familyManagedHandoverActivatedAt ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Activated {new Date(membershipCase.state.familyManagedHandoverActivatedAt).toLocaleString()}.
                      </div>
                    ) : null}
                    <div>
                      <button
                        type="button"
                        disabled={handoverSaving || !organizationLicensed}
                        onClick={() => void handleSaveFamilyManagedHandover()}
                        className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                      >
                        {handoverSaving
                          ? "Saving..."
                          : handoverForm.status === "active"
                            ? "Activate family-managed handover"
                            : handoverForm.status === "planned"
                              ? "Save handover plan"
                              : !organizationLicensed
                                ? "License inactive"
                                : "Reset handover"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  This case is still open. Family-managed handover becomes available here after closure, once you decide who in the family or network will carry the plan forward inside the workspace.
                </div>
              )}

              <h4 className="text-base font-semibold text-slate-900">Add existing user to case</h4>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  User
                  <select
                    className="input"
                    value={membershipForm.userId}
                    onChange={(event) => setMembershipForm((current) => ({ ...current, userId: event.target.value }))}
                  >
                    <option value="">Choose a user</option>
                    {assignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName} • {user.email} • {prettifyUserType(user.userType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Case role
                  <select
                    className="input"
                    value={membershipForm.role}
                    onChange={(event) =>
                      setMembershipForm((current) => ({
                        ...current,
                        role: event.target.value as CaseMembershipRecord["role"],
                      }))
                    }
                  >
                    {caseRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <button
                    type="button"
                    disabled={membershipBusyId === "new" || !membershipForm.userId || !organizationLicensed}
                    onClick={() => void handleCreateMembership()}
                    className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                  >
                    {membershipBusyId === "new" ? "Adding..." : !organizationLicensed ? "License inactive" : "Add case membership"}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 nm-scroll-pane">
              <input
                className="input"
                value={membershipSearch}
                onChange={(event) => setMembershipSearch(event.target.value)}
                placeholder="Search memberships by name, role, or email"
              />
              <div className="text-xs text-slate-500">{filteredMemberships.length} result(s)</div>
              {membershipLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading memberships…</div>
              ) : filteredMemberships.length ? (
                filteredMemberships.map((membership) => (
                  <div key={membership.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{membership.displayName || membership.email || membership.userId}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {membership.email || "No email recorded"} • {membership.userType || "member"} • {membership.active ? "active" : "inactive"}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[minmax(180px,220px)_auto_auto]">
                        <select
                          className="input"
                          value={membership.role}
                          onChange={(event) =>
                            void handleMembershipUpdate(
                              membership.id,
                              { role: event.target.value as CaseMembershipRecord["role"] },
                              "Case membership updated.",
                            )
                          }
                          disabled={membershipBusyId === membership.id}
                        >
                          {caseRoleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={membershipBusyId === membership.id || (!membership.active && !organizationLicensed)}
                          onClick={() =>
                            void handleMembershipUpdate(
                              membership.id,
                              { active: !membership.active },
                              membership.active ? "Case membership removed." : "Case membership restored.",
                            )
                          }
                          className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                        >
                          {membership.active ? "Remove access" : !organizationLicensed ? "License inactive" : "Restore access"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  No case memberships match this filter. Clear filters or add a case membership.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Choose a case to manage its existing-user memberships.
          </div>
        )}
      </section>

      <BillingModal
        isOpen={isBillingModalOpen}
        plans={billingPlans}
        allowedAlternativePaymentMethods={allowedAlternativePaymentMethods}
        billingConfigured={billingConfigured}
        alternativePaymentsEnabled={alternativePaymentsEnabled}
        checkoutSubmitting={billingCheckoutSubmitting}
        alternativeSubmitting={billingAlternativeSubmitting}
        checkoutErrorMessage={billingCheckoutErrorMessage}
        checkoutStatusMessage={billingCheckoutStatusMessage}
        alternativeErrorMessage={billingAlternativeErrorMessage}
        alternativeStatusMessage={billingAlternativeStatusMessage}
        onClose={() => setIsBillingModalOpen(false)}
        onStartCheckout={handleStartCheckout}
        onRequestAlternativePayment={handleAlternativePaymentRequest}
      />
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <section className="app-metric rounded-3xl border p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </section>
  );
}
