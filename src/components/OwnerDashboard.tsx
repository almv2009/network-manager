import { useEffect, useMemo, useState } from "react";

import {
  createOwnerOrganizationWithInvite,
  deleteOwnerOrganization,
  deleteOwnerUserAccount,
  fetchOwnerOverview,
  patchOwnerUserActive,
  type SessionResponse,
  updateOwnerOrganizationLicense,
  updateOwnerOrganizationStatus,
} from "../api";
import type {
  AuditEventRecord,
  BillingEventRecord,
  PlatformOwnerOrganizationSummary,
  PlatformOwnerUserRecord,
  SupportTicketRecord,
} from "../../shared/types";

type Props = {
  session: SessionResponse;
};

type LicenseDraft = {
  licensedSeatCount: string;
  licensedPlanName: string;
  licenseStatus: string;
};

function formatMoney(event: BillingEventRecord) {
  if (typeof event.amountMinor !== "number" || !event.currency) return "Not recorded";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: event.currency.toUpperCase(),
  }).format(event.amountMinor / 100);
}

function prettifyUserType(value: string) {
  return value.replace(/_/g, " ");
}

function statusBadgeClass(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active" || normalized === "ready") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "paused" || normalized === "warning") return "border border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "inactive" || normalized === "cancelled") return "border border-slate-200 bg-slate-50 text-slate-700";
  return "border border-slate-200 bg-white text-slate-700";
}

function formatSeatValue(value: number | null, fallback = "Not set") {
  return value === null ? fallback : String(value);
}

export function OwnerDashboard({ session }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [organizations, setOrganizations] = useState<PlatformOwnerOrganizationSummary[]>([]);
  const [users, setUsers] = useState<PlatformOwnerUserRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicketRecord[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEventRecord[]>([]);
  const [alternativeRequests, setAlternativeRequests] = useState<
    Array<{
      id: string;
      organizationName: string;
      fullName: string;
      email: string;
      planName: string;
      seatCount: number;
      requestStatus: string;
      country: string;
      createdAt: string;
    }>
  >([]);
  const [deploymentReadiness, setDeploymentReadiness] = useState<{
    ready: boolean;
    checks: Array<{ key: string; label: string; status: string; detail: string; missing: string[] }>;
  } | null>(null);
  const [licenseDrafts, setLicenseDrafts] = useState<Record<string, LicenseDraft>>({});
  const [busyOrganizationId, setBusyOrganizationId] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [selectedLicenseOrganizationId, setSelectedLicenseOrganizationId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [supportSearch, setSupportSearch] = useState("");
  const [billingSearch, setBillingSearch] = useState("");
  const [billingStatusFilter, setBillingStatusFilter] = useState("all");
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [createOrgForm, setCreateOrgForm] = useState({
    organizationName: "",
    adminEmail: "",
    licensedSeatCount: "1",
    licensedPlanName: "Manual purchase",
    licenseStatus: "active",
  });

  const loadData = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError("");
    try {
      const response = await fetchOwnerOverview();
      setOrganizations(response.overview.organizations);
      setUsers(response.overview.users);
      setAuditEvents(response.overview.auditEvents);
      setSupportTickets(response.overview.supportTickets);
      setBillingEvents(response.overview.billingEvents);
      setAlternativeRequests(response.overview.alternativePaymentRequests);
      setDeploymentReadiness(response.overview.deploymentReadiness);
      setLicenseDrafts((current) => {
        const next = { ...current };
        response.overview.organizations.forEach((organization) => {
          next[organization.organizationId] = next[organization.organizationId] || {
            licensedSeatCount: organization.licensedSeatCount ? String(organization.licensedSeatCount) : "",
            licensedPlanName: organization.licensedPlanName || "",
            licenseStatus: organization.licenseStatus || organization.status || "active",
          };
        });
        return next;
      });
      setLastLoadedAt(new Date().toLocaleString());
      if (mode === "refresh") {
        setStatusMessage((current) => current || "Owner dashboard refreshed.");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The owner dashboard could not be loaded.");
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!session.permissions.isPlatformOwner) return;
    void loadData("initial");
  }, [session.permissions.isPlatformOwner]);

  const activeUsers = useMemo(() => users.filter((user) => user.active).length, [users]);
  const filteredUsers = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const statusMatches =
        userStatusFilter === "all" || (userStatusFilter === "active" ? user.active : !user.active);
      if (!statusMatches) return false;
      if (!needle) return true;
      return [user.displayName, user.email, user.organizationName, user.userType].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [userSearch, userStatusFilter, users]);
  const organizationAdminsByOrgId = useMemo(() => {
    const map = new Map<string, PlatformOwnerUserRecord[]>();
    users.forEach((user) => {
      if (user.userType !== "org_admin") return;
      const existing = map.get(user.organizationId) || [];
      existing.push(user);
      map.set(user.organizationId, existing);
    });
    map.forEach((admins, organizationId) => {
      admins.sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      map.set(organizationId, admins);
    });
    return map;
  }, [users]);
  const filteredSupportTickets = useMemo(() => {
    const needle = supportSearch.trim().toLowerCase();
    if (!needle) return supportTickets;
    return supportTickets.filter((ticket) =>
      [ticket.summary, ticket.fullName, ticket.email, ticket.details].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [supportSearch, supportTickets]);
  const billingStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          billingEvents
            .map((event) => String(event.status || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [billingEvents],
  );
  const filteredBillingEvents = useMemo(() => {
    const needle = billingSearch.trim().toLowerCase();
    return billingEvents.filter((event) => {
      const statusMatches = billingStatusFilter === "all" || String(event.status || "") === billingStatusFilter;
      if (!statusMatches) return false;
      if (!needle) return true;
      return [event.eventType, event.organizationName, event.planName, event.status, event.contactEmail].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [billingEvents, billingSearch, billingStatusFilter]);
  const visibleLicenseOrganizations = useMemo(() => {
    if (!organizations.length) return [];
    const selected = selectedLicenseOrganizationId.trim();
    if (!selected) return [organizations[0]];
    const match = organizations.find((organization) => organization.organizationId === selected);
    return match ? [match] : [organizations[0]];
  }, [organizations, selectedLicenseOrganizationId]);

  useEffect(() => {
    if (!organizations.length) {
      setSelectedLicenseOrganizationId("");
      return;
    }
    if (!selectedLicenseOrganizationId || !organizations.some((organization) => organization.organizationId === selectedLicenseOrganizationId)) {
      setSelectedLicenseOrganizationId(organizations[0].organizationId);
    }
  }, [organizations, selectedLicenseOrganizationId]);

  const updateDraft = (organizationId: string, patch: Partial<LicenseDraft>) => {
    setLicenseDrafts((current) => ({
      ...current,
      [organizationId]: {
        licensedSeatCount: patch.licensedSeatCount ?? current[organizationId]?.licensedSeatCount ?? "",
        licensedPlanName: patch.licensedPlanName ?? current[organizationId]?.licensedPlanName ?? "",
        licenseStatus: patch.licenseStatus ?? current[organizationId]?.licenseStatus ?? "",
      },
    }));
  };

  const handleCreateOrganizationAndInvite = async () => {
    const organizationName = createOrgForm.organizationName.trim();
    const adminEmail = createOrgForm.adminEmail.trim().toLowerCase();
    const seatCountInput = createOrgForm.licensedSeatCount.trim();
    const seatCount = seatCountInput ? Number.parseInt(seatCountInput, 10) : null;

    if (!organizationName) {
      setError("Organization name is required.");
      return;
    }
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      setError("A valid admin email is required.");
      return;
    }
    if (seatCountInput && (!Number.isInteger(seatCount) || Number(seatCount) < 1)) {
      setError("Licensed seat count must be a whole number greater than zero.");
      return;
    }

    setCreatingOrganization(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await createOwnerOrganizationWithInvite({
        organizationName,
        adminEmail,
        licensedSeatCount: seatCount,
        licensedPlanName: createOrgForm.licensedPlanName.trim() || undefined,
        licenseStatus: createOrgForm.licenseStatus as "active" | "trial" | "paused" | "inactive",
      });
      setLatestInviteUrl(response.inviteUrl);
      setCreateOrgForm({
        organizationName: "",
        adminEmail: "",
        licensedSeatCount: "1",
        licensedPlanName: "Manual purchase",
        licenseStatus: "active",
      });
      await loadData("refresh");
      if (response.delivery.status === "sent") {
        setStatusMessage("Organization created and admin invite email sent.");
      } else if (response.delivery.status === "failed") {
        setStatusMessage("Organization created, but invite email delivery failed. Use the invite link below.");
        setError(response.delivery.detail);
      } else {
        setStatusMessage("Organization created. Email delivery is not configured; share the invite link manually.");
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Organization creation failed.");
    } finally {
      setCreatingOrganization(false);
    }
  };

  const handleCopyLatestInvite = async () => {
    if (!latestInviteUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(latestInviteUrl);
        setStatusMessage("Invite link copied.");
      } else {
        setStatusMessage(`Copy invite link manually: ${latestInviteUrl}`);
      }
    } catch {
      setStatusMessage(`Copy invite link manually: ${latestInviteUrl}`);
    }
  };

  const handleLicenseSave = async (organizationId: string) => {
    const draft = licenseDrafts[organizationId];
    if (!draft) return;

    setBusyOrganizationId(organizationId);
    setError("");
    setStatusMessage("");
    try {
      const seatCount = draft.licensedSeatCount.trim() ? Number.parseInt(draft.licensedSeatCount, 10) : null;
      if (draft.licensedSeatCount.trim() && (!Number.isInteger(seatCount) || Number(seatCount) < 1)) {
        throw new Error("Seat count must be a whole number greater than zero.");
      }
      const response = await updateOwnerOrganizationLicense(organizationId, {
        licensedSeatCount: seatCount,
        licensedPlanName: draft.licensedPlanName.trim() || undefined,
        licenseStatus: draft.licenseStatus.trim() || undefined,
      });
      setOrganizations((current) =>
        current.map((organization) =>
          organization.organizationId === organizationId
            ? {
                ...organization,
                ...response.summary,
              }
            : organization,
        ),
      );
      setStatusMessage("Organization license settings updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The organization license settings could not be updated.");
    } finally {
      setBusyOrganizationId("");
    }
  };

  const handleOrganizationStatus = async (organizationId: string, status: "active" | "archived") => {
    setBusyOrganizationId(organizationId);
    setError("");
    setStatusMessage("");
    try {
      const response = await updateOwnerOrganizationStatus(organizationId, status);
      setOrganizations((current) =>
        current.map((organization) =>
          organization.organizationId === organizationId
            ? {
                ...organization,
                ...response.summary,
                status,
              }
            : organization,
        ),
      );
      setStatusMessage(status === "archived" ? "Workspace archived." : "Workspace restored.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The workspace status could not be updated.");
    } finally {
      setBusyOrganizationId("");
    }
  };

  const handlePauseToggle = async (userId: string, nextActive: boolean) => {
    setBusyUserId(userId);
    setError("");
    setStatusMessage("");
    try {
      const response = await patchOwnerUserActive(userId, nextActive);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...response.user } : user)));
      setStatusMessage(nextActive ? "Account restored." : "Account paused.");
      await loadData("refresh");
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
      await deleteOwnerUserAccount(userId);
      setUsers((current) => current.filter((user) => user.id !== userId));
      setStatusMessage("Account deleted.");
      await loadData("refresh");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The account could not be deleted.");
    } finally {
      setBusyUserId("");
    }
  };

  const handleDeleteOrganization = async (organizationId: string, organizationName: string) => {
    if (!window.confirm(`Delete organization "${organizationName}" from the platform? This removes workspace data and cannot be undone.`)) {
      return;
    }
    setBusyOrganizationId(organizationId);
    setError("");
    setStatusMessage("");
    try {
      await deleteOwnerOrganization(organizationId);
      setOrganizations((current) => current.filter((organization) => organization.organizationId !== organizationId));
      setLicenseDrafts((current) => {
        const next = { ...current };
        delete next[organizationId];
        return next;
      });
      setStatusMessage("Organization deleted.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The organization could not be deleted.");
    } finally {
      setBusyOrganizationId("");
    }
  };

  if (!session.permissions.isPlatformOwner) {
    return (
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Owner dashboard</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Platform owner access is required for this view.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Platform owner</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Owner dashboard</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              This is the platform-level control surface. It is separate from the organization admin dashboard and brings
              together organizations, purchased-seat allocation, global users, support demand, billing activity, audit visibility, and deployment readiness.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData("refresh")}
            disabled={refreshing}
            className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
          >
            {refreshing ? "Refreshing..." : "Refresh dashboard"}
          </button>
        </div>
        {lastLoadedAt ? <div className="mt-3 text-xs text-slate-500">Last refreshed {lastLoadedAt}</div> : null}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Organizations" value={String(organizations.length)} helper="Organizations provisioned on the platform" />
        <MetricCard label="Active users" value={String(activeUsers)} helper={`${users.length - activeUsers} paused or deleted`} />
        <MetricCard label="Support tickets" value={String(supportTickets.length)} helper="Recent tickets across all organizations" />
        <MetricCard label="Pricing requests" value={String(alternativeRequests.length)} helper="Alternative payment and activation requests" />
      </div>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Create organization and invite admin</h3>
        <p className="mt-1 text-sm text-slate-600">
          Use this after payment is received. It creates the organization with licensed access and immediately sends the admin invite link.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_minmax(0,1fr)_170px_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Organization name
            <input
              className="input"
              value={createOrgForm.organizationName}
              onChange={(event) => setCreateOrgForm((current) => ({ ...current, organizationName: event.target.value }))}
              placeholder="Example: Toronto Family Safeguarding Service"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Admin email
            <input
              className="input"
              type="email"
              value={createOrgForm.adminEmail}
              onChange={(event) => setCreateOrgForm((current) => ({ ...current, adminEmail: event.target.value }))}
              placeholder="admin@organization.org"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Seats
            <input
              className="input"
              inputMode="numeric"
              value={createOrgForm.licensedSeatCount}
              onChange={(event) => setCreateOrgForm((current) => ({ ...current, licensedSeatCount: event.target.value }))}
              placeholder="1"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Plan name
            <input
              className="input"
              value={createOrgForm.licensedPlanName}
              onChange={(event) => setCreateOrgForm((current) => ({ ...current, licensedPlanName: event.target.value }))}
              placeholder="Manual purchase"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            License status
            <select
              className="input"
              value={createOrgForm.licenseStatus}
              onChange={(event) => setCreateOrgForm((current) => ({ ...current, licenseStatus: event.target.value }))}
            >
              <option value="active">active</option>
              <option value="trial">trial</option>
              <option value="paused">paused</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleCreateOrganizationAndInvite()}
              disabled={creatingOrganization}
              className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
            >
              {creatingOrganization ? "Creating..." : "Create + invite"}
            </button>
          </div>
        </div>
        {latestInviteUrl ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-800">Latest admin invite link</div>
            <div className="mt-1 break-all text-xs text-slate-600">{latestInviteUrl}</div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleCopyLatestInvite()}
                className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
              >
                Copy invite link
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Organization licensing and seat allocation</h3>
            <p className="mt-1 text-sm text-slate-600">
              Set purchased seat counts, plan names, and license status here. Organization admins then assign people against those seats.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Organization selector
              <select
                className="input"
                value={selectedLicenseOrganizationId}
                onChange={(event) => setSelectedLicenseOrganizationId(event.target.value)}
              >
                {organizations.map((organization) => (
                  <option key={organization.organizationId} value={organization.organizationId}>
                    {organization.organizationName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {visibleLicenseOrganizations.length ? (
            visibleLicenseOrganizations.map((organization) => {
              const orgAdmins = organizationAdminsByOrgId.get(organization.organizationId) || [];
              const primaryAdminText = orgAdmins.length
                ? orgAdmins
                    .slice(0, 2)
                    .map((admin) => `${admin.displayName} (${admin.email})`)
                    .join(" • ")
                : "No org admin account linked yet";
              const draft = licenseDrafts[organization.organizationId] || {
                licensedSeatCount: organization.licensedSeatCount ? String(organization.licensedSeatCount) : "",
                licensedPlanName: organization.licensedPlanName || "",
                licenseStatus: organization.licenseStatus || organization.status || "active",
              };
              return (
                <div key={organization.organizationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{organization.organizationName}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {organization.openCases} open cases • {organization.activeUsers} active users • {organization.pendingInvitations} pending invites
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        <span className="font-semibold text-slate-700">Org admin:</span> {primaryAdminText}
                        {orgAdmins.length > 2 ? ` • +${orgAdmins.length - 2} more` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(draft.licenseStatus || organization.status)}`}>
                        {(draft.licenseStatus || organization.status || "active").replace(/_/g, " ")}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(organization.accessState)}`}>
                        {organization.accessState.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[180px_minmax(0,1fr)_180px_auto]">
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Licensed seats
                      <input
                        className="input"
                        inputMode="numeric"
                        value={draft.licensedSeatCount}
                        onChange={(event) => updateDraft(organization.organizationId, { licensedSeatCount: event.target.value })}
                        placeholder="Example: 25"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Plan name
                      <input
                        className="input"
                        value={draft.licensedPlanName}
                        onChange={(event) => updateDraft(organization.organizationId, { licensedPlanName: event.target.value })}
                        placeholder="Example: Small organization"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      License status
                      <select
                        className="input"
                        value={draft.licenseStatus}
                        onChange={(event) => updateDraft(organization.organizationId, { licenseStatus: event.target.value })}
                      >
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="trial">trial</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busyOrganizationId === organization.organizationId}
                          onClick={() => void handleLicenseSave(organization.organizationId)}
                          className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                        >
                          {busyOrganizationId === organization.organizationId ? "Saving..." : "Save license"}
                        </button>
                        <button
                          type="button"
                          disabled={busyOrganizationId === organization.organizationId}
                          onClick={() => void handleOrganizationStatus(organization.organizationId, organization.status === "archived" ? "active" : "archived")}
                          className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-800 disabled:opacity-60"
                        >
                          {organization.status === "archived" ? "Restore workspace" : "Archive workspace"}
                        </button>
                        <button
                          type="button"
                          disabled={busyOrganizationId === organization.organizationId}
                          onClick={() => void handleDeleteOrganization(organization.organizationId, organization.organizationName)}
                          className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 disabled:opacity-60"
                        >
                          {busyOrganizationId === organization.organizationId ? "Deleting..." : "Delete organization"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {!organization.isLicensed ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      {organization.licenseGateMessage}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricTile label="Purchased seats" value={formatSeatValue(organization.licensedSeatCount)} />
                    <MetricTile label="Remaining seats" value={organization.isLicensed ? String(organization.remainingSeats) : "Locked"} />
                    <MetricTile label="Invite slots left" value={organization.isLicensed ? String(organization.remainingProvisioningSlots) : "Locked"} />
                    <MetricTile label="Paused users" value={String(organization.pausedUsers)} />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No organizations have been provisioned yet.
            </div>
          )}
        </div>
      </section>

      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Global user access</h3>
        <p className="mt-1 text-sm text-slate-600">
          Pause, restore, or remove user access across organizations. This sits above the organization admin dashboard.
        </p>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
          <input
            className="input"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search by name, email, organization, or role"
          />
          <select
            className="input"
            value={userStatusFilter}
            onChange={(event) => setUserStatusFilter(event.target.value as "all" | "active" | "paused")}
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="paused">Paused/deleted only</option>
          </select>
        </div>
        <div className="mt-2 text-xs text-slate-500">{filteredUsers.length} result(s)</div>
        <div className="mt-4 space-y-3 nm-scroll-pane">
          {filteredUsers.length ? (
            filteredUsers.map((user) => (
              <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{user.displayName}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {user.email} • {prettifyUserType(user.userType)} • {user.organizationName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Created {new Date(user.createdAt).toLocaleString()} • {user.active ? "active" : "paused/deleted"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busyUserId === user.id}
                      onClick={() => void handlePauseToggle(user.id, !user.active)}
                      className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                    >
                      {busyUserId === user.id ? "Working..." : user.active ? "Pause account" : "Restore account"}
                    </button>
                    <button
                      type="button"
                      disabled={busyUserId === user.id}
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
              No users match this filter. Clear filters or invite users from the relevant organization dashboard.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Alternative payment and activation requests</h3>
          <div className="mt-4 space-y-3 nm-scroll-pane">
            {alternativeRequests.length ? (
              alternativeRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{request.organizationName}</div>
                      <div className="text-sm text-slate-600">
                        {request.fullName} • {request.email}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {request.planName} • {request.seatCount} seats • {request.country}
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(request.requestStatus)}`}>
                      {request.requestStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No pricing requests recorded yet.
              </div>
            )}
          </div>
        </section>

        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Deployment readiness</h3>
          <div className="mt-4 space-y-3 nm-scroll-pane">
            {deploymentReadiness?.checks.length ? (
              deploymentReadiness.checks.map((check) => (
                <div key={check.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{check.label}</div>
                      <div className="mt-1 text-sm text-slate-600">{check.detail}</div>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                  {check.missing.length ? (
                    <div className="mt-2 text-xs text-slate-500">Missing: {check.missing.join(", ")}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No readiness report is available yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <details open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Recent audit activity</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Platform-wide audit events are grouped here in a compact scroll area.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {auditEvents.length} shown
              </span>
            </summary>
            <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-2">
              {auditEvents.length ? (
                auditEvents.slice(0, 25).map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{event.eventType.replace(/_/g, " ")}</div>
                        <div className="text-sm text-slate-600">{event.actorDisplayName || "System action"}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {event.organizationId}
                          {event.caseId ? ` • case ${event.caseId}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  No audit activity has been recorded yet.
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Recent support tickets</h3>
          <div className="mt-4">
            <input
              className="input"
              value={supportSearch}
              onChange={(event) => setSupportSearch(event.target.value)}
              placeholder="Search support tickets by summary, requester, or detail"
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredSupportTickets.length} result(s)</div>
          <div className="mt-4 space-y-3 nm-scroll-pane">
            {filteredSupportTickets.length ? (
              filteredSupportTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{ticket.summary}</div>
                      <div className="text-sm text-slate-600">{ticket.fullName} • {ticket.email}</div>
                    </div>
                    <div className="text-xs text-slate-500">{new Date(ticket.createdAt).toLocaleString()}</div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ticket.details}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No support tickets match this filter.
              </div>
            )}
          </div>
        </section>

        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Billing events</h3>
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <input
              className="input"
              value={billingSearch}
              onChange={(event) => setBillingSearch(event.target.value)}
              placeholder="Search billing events by org, plan, status, or email"
            />
            <select
              className="input"
              value={billingStatusFilter}
              onChange={(event) => setBillingStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {billingStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-xs text-slate-500">{filteredBillingEvents.length} result(s)</div>
          <div className="mt-4 space-y-3 nm-scroll-pane">
            {filteredBillingEvents.length ? (
              filteredBillingEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{event.eventType}</div>
                      <div className="text-sm text-slate-600">
                        {event.organizationName || "Organization not recorded"} • {event.planName || "Plan not recorded"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {event.status} • {formatMoney(event)} • {event.contactEmail || "No contact email"}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No billing events match this filter.
              </div>
            )}
          </div>
        </section>
      </div>
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
