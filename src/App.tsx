import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { cloneDefaultCaseState } from "../shared/default-case-state";
import type {
  AppUser,
  CaseMembershipRecord,
  CaseResponse,
  CaseState,
  CaseSummary,
  CaseTabKey,
  InvitationRecord,
  JournalAudience,
  NextNetworkStep,
  UserType,
} from "../shared/types";
import {
  ApiError,
  closeCase,
  createCaseMembership,
  createInvitation,
  createJournal,
  fetchAdminUsers,
  fetchAuditEvents,
  fetchCase,
  fetchJournal,
  fetchOrganizationCases,
  patchCase,
  patchCaseMembership,
  patchUserActive,
  uploadCaseDocument,
} from "./api";
import { useSession } from "./session";

const tabs: { key: CaseTabKey; label: string }[] = [
  { key: "case-status", label: "Case Status" },
  { key: "timeline", label: "Timeline" },
  { key: "network", label: "Network Building" },
  { key: "planning", label: "Safeguarding Planning" },
  { key: "monitoring", label: "Monitoring & Testing" },
  { key: "journal", label: "Shared Journal" },
  { key: "closure", label: "Closure & Ongoing Safeguarding" },
];

const TAB_PREF_KEY = "network-manager-ui-case-tab";
const DEFAULT_BRAND_LOGO = "/sgt-logo.png";

function splitLines(text: string) {
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeNextNetworkStep(text: string, completed = false): NextNetworkStep {
  return {
    id: `network-step-${Math.random().toString(36).slice(2, 10)}`,
    text,
    completed,
  };
}

function normalizeStepKey(text: string) {
  return text.trim().toLowerCase();
}

function buildNextNetworkStepsFromText(text: string, existingSteps: NextNetworkStep[] = []) {
  const existingByKey = new Map(
    existingSteps
      .filter((item) => item.text.trim())
      .map((item) => [normalizeStepKey(item.text), item] as const),
  );

  return splitLines(text).map((item) => {
    const existing = existingByKey.get(normalizeStepKey(item));
    if (existing) {
      return { ...existing, text: item };
    }
    return makeNextNetworkStep(item);
  });
}

function serializeNextNetworkSteps(steps: NextNetworkStep[]) {
  return steps
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeCaseState(state: CaseState): CaseState {
  const merged = {
    ...cloneDefaultCaseState(),
    ...state,
  };
  const nextNetworkSteps =
    Array.isArray(state.nextNetworkSteps) && state.nextNetworkSteps.length > 0
      ? state.nextNetworkSteps
          .map((item) => ({
            id: item.id || `network-step-${Math.random().toString(36).slice(2, 10)}`,
            text: String(item.text || "").trim(),
            completed: Boolean(item.completed),
          }))
          .filter((item) => item.text)
      : buildNextNetworkStepsFromText(merged.nextNetworkStepsText);

  return {
    ...merged,
    nextNetworkStepsText:
      merged.nextNetworkStepsText && merged.nextNetworkStepsText.trim()
        ? merged.nextNetworkStepsText
        : serializeNextNetworkSteps(nextNetworkSteps),
    nextNetworkSteps,
  };
}

function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      {(title || right) ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : null}
          </div>
          {right}
        </div>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

function PageFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "slate" | "blue" }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "amber"
        ? "bg-amber-100 text-amber-900"
        : tone === "red"
          ? "bg-rose-100 text-rose-900"
          : tone === "blue"
            ? "bg-blue-100 text-blue-900"
            : "bg-slate-100 text-slate-800";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${clamped}%` }} />
      </div>
      <div className="text-sm text-slate-600">{clamped}%</div>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function ErrorNotice({ error }: { error: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
  );
}

function useStoredTab(defaultValue: CaseTabKey) {
  const [tab, setTab] = useState<CaseTabKey>(() => {
    if (typeof window === "undefined") return defaultValue;
    const stored = window.localStorage.getItem(TAB_PREF_KEY) as CaseTabKey | null;
    return stored || defaultValue;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_PREF_KEY, tab);
    }
  }, [tab]);
  return [tab, setTab] as const;
}

function RootRedirect() {
  const { loading, session } = useSession();
  if (loading) return <div className="p-8 text-sm text-slate-600">Loading…</div>;
  return <Navigate to={session ? "/app" : "/sign-in"} replace />;
}

function ProtectedRoute() {
  const { loading, session, error } = useSession();
  const location = useLocation();
  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading session…</div>;
  }
  if (
    error?.code === "inactive_user" ||
    error?.code === "user_not_provisioned" ||
    error?.code === "organization_membership_required" ||
    error?.code === "auth_not_configured"
  ) {
    return <Navigate to={`/access-denied?reason=${encodeURIComponent(error.code)}`} replace />;
  }
  if (!session) {
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

function AdminRoute() {
  const { session } = useSession();
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!session.permissions.isOrgAdmin) {
    return <Navigate to="/access-denied?reason=org_admin_required" replace />;
  }
  return <Outlet />;
}

function Layout() {
  const { session } = useSession();
  const logoSrc = session?.branding.logoUrl || DEFAULT_BRAND_LOGO;
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <img
              src={logoSrc}
              alt={`${session?.branding.name || session?.organization.name || "Organization"} logo`}
              className="h-12 w-12 rounded-2xl border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
            />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Network Manager</div>
              <div className="text-lg font-semibold text-slate-950">
                {session?.branding.name || session?.organization.name || "Organization"}
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/app">
              Cases
            </NavLink>
            {session?.permissions.isOrgAdmin ? (
              <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/admin">
                Admin
              </NavLink>
            ) : null}
            <a className="rounded-full px-4 py-2 hover:bg-slate-100" href="/auth/sign-out">
              Sign out
            </a>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

function SignInPage() {
  const [params] = useSearchParams();
  const signedOut = params.get("signedOut") === "1";
  const invite = params.get("invite");
  const returnTo = params.get("returnTo") || "/app";
  const { session } = useSession();

  if (session) {
    return <Navigate to={returnTo} replace />;
  }

  const signInHref = `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;

  return (
    <PageFrame
      title="Sign in to Network Manager"
      subtitle="Network Manager is organization-owned. Access is granted through your organization’s identity provider and backend case membership, not local browser state."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="Secure access">
          <div className="grid gap-4 text-sm text-slate-600">
            {signedOut ? <ErrorNotice error="You have been signed out." /> : null}
            <p>
              Sign-in is handled through your organization’s OIDC provider. Your role, organization membership, and case access
              are resolved by the backend after authentication.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Organization-owned identity provider</li>
              <li>Secure backend session cookies</li>
              <li>Case closure automatically removes worker access</li>
              <li>Caregiver and network access continues after closure if still active</li>
            </ul>
            <div>
              <a
                href={signInHref}
                className="inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Continue to sign in
              </a>
            </div>
          </div>
        </Card>
        <Card title="Deployment model">
          <div className="space-y-3 text-sm text-slate-600">
            <p>The organization owns identity, storage, secrets, audit, and retention controls.</p>
            <p>This app does not rely on Avi manually managing end users.</p>
            <p>Admins invite staff, caregivers, and network users. Access is enforced on the API layer.</p>
          </div>
        </Card>
      </div>
    </PageFrame>
  );
}

function AuthCallbackPage() {
  return (
    <PageFrame
      title="Completing sign-in"
      subtitle="If your sign-in does not complete automatically, return to the sign-in page and try again."
    >
      <Card>
        <p className="text-sm text-slate-600">The backend auth callback is being processed.</p>
      </Card>
    </PageFrame>
  );
}

function AccessDeniedPage() {
  const [params] = useSearchParams();
  const reason = params.get("reason") || "access_denied";
  const messageByReason: Record<string, string> = {
    auth_required: "Sign in is required before you can access the application.",
    auth_not_configured: "Enterprise sign-in is not configured for this deployment yet.",
    org_admin_required: "Only organization administrators can access this area.",
    organization_membership_required: "You do not belong to the required organization for this resource.",
    case_membership_required: "You do not have an active membership for this case.",
    case_closed_worker_access_revoked: "Worker access ends automatically when the CPS case is closed.",
    case_closed_supervisor_access_revoked: "Supervisor access to this closed case is disabled by current organization policy.",
    inactive_user: "Your account is inactive.",
    user_not_provisioned: "Your identity is valid, but your organization has not provisioned you for this app yet.",
  };

  return (
    <PageFrame title="Access denied" subtitle="The backend denied this request based on organization, case, role, or case-state rules.">
      <Card>
        <div className="grid gap-3">
          <ErrorNotice error={messageByReason[reason] || "You do not have permission to access this route."} />
          <div className="text-sm text-slate-600">Reason code: {reason}</div>
          <div>
            <NavLink className="inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700" to="/app">
              Back to app
            </NavLink>
          </div>
        </div>
      </Card>
    </PageFrame>
  );
}

function AppHomePage() {
  const { session } = useSession();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    void fetchOrganizationCases(session.organization.id)
      .then((response) => {
        setCases(response.cases);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.hint : "Unable to load organization cases.");
      });
  }, [session]);

  if (!session) return null;

  return (
    <PageFrame
      title="Organization cases"
      subtitle="Access to cases is resolved per organization, case membership, user role, and case status."
    >
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Metric label="Organization" value={session.organization.name} helper="Organization-owned tenant" />
        <Metric label="Signed in as" value={session.user.displayName} helper={`${session.user.userType.replace(/_/g, " ")}`} />
        <Metric label="Accessible cases" value={String(cases.length)} helper="Resolved by backend authorization" />
      </div>
      {error ? <ErrorNotice error={error} /> : null}
      <div className="grid gap-4">
        {cases.map((caseRecord) => (
          <Card
            key={caseRecord.id}
            title={caseRecord.familyName}
            right={
              <div className="flex items-center gap-2">
                <StatusPill tone={caseRecord.status === "open" ? "green" : "amber"}>{caseRecord.status}</StatusPill>
                {caseRecord.accessState === "closed_denied" ? (
                  <StatusPill tone="red">worker blocked</StatusPill>
                ) : null}
              </div>
            }
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1 text-sm text-slate-600">
                <div>Membership role: {caseRecord.membershipRole || "org_admin"}</div>
                <div>Created: {new Date(caseRecord.createdAt).toLocaleString()}</div>
                {caseRecord.closedAt ? <div>Closed: {new Date(caseRecord.closedAt).toLocaleString()}</div> : null}
              </div>
              <div className="flex items-center gap-3">
                {caseRecord.accessState === "closed_denied" ? (
                  <NavLink
                    className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    to="/access-denied?reason=case_closed_worker_access_revoked"
                  >
                    Access denied
                  </NavLink>
                ) : (
                  <NavLink
                    className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    to={`/cases/${caseRecord.id}`}
                  >
                    Open case
                  </NavLink>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PageFrame>
  );
}

function AdminPage() {
  const { session } = useSession();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<Awaited<ReturnType<typeof fetchAuditEvents>>["events"]>([]);
  const [error, setError] = useState<string>("");
  const [inviteResult, setInviteResult] = useState<string>("");
  const [inviteDelivery, setInviteDelivery] = useState<string>("");
  const [inviteForm, setInviteForm] = useState({
    email: "",
    userType: "network_member" as UserType,
    caseId: "",
    caseRole: "network_member" as CaseMembershipRecord["role"],
  });
  const [membershipForm, setMembershipForm] = useState({
    caseId: "",
    userId: "",
    role: "network_member" as CaseMembershipRecord["role"],
  });

  const loadAdmin = async () => {
    if (!session) return;
    try {
      const [usersResponse, auditResponse, casesResponse] = await Promise.all([
        fetchAdminUsers(),
        fetchAuditEvents(),
        fetchOrganizationCases(session.organization.id),
      ]);
      setUsers(usersResponse.users);
      setInvitations(usersResponse.invitations);
      setAuditEvents(auditResponse.events);
      setCases(casesResponse.cases);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to load admin data.");
    }
  };

  useEffect(() => {
    void loadAdmin();
  }, [session]);

  const onInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await createInvitation(inviteForm);
      setInviteResult(response.inviteUrl);
      setInviteDelivery(response.delivery.detail);
      setInviteForm({ email: "", userType: "network_member", caseId: "", caseRole: "network_member" });
      await loadAdmin();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to create invitation.");
    }
  };

  const onMembership = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createCaseMembership(membershipForm);
      setMembershipForm({ caseId: "", userId: "", role: "network_member" });
      await loadAdmin();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to create case membership.");
    }
  };

  if (!session) return null;

  return (
    <PageFrame
      title="Organization admin"
      subtitle="Organization administrators manage users, invitations, case access, closure, and audit visibility without relying on vendor-side manual account handling."
    >
      {error ? <div className="mb-4"><ErrorNotice error={error} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-6">
          <Card title="Users">
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="py-3">{user.displayName}</td>
                      <td className="py-3 text-slate-600">{user.email}</td>
                      <td className="py-3">{user.userType}</td>
                      <td className="py-3">
                        <StatusPill tone={user.active ? "green" : "red"}>{user.active ? "active" : "inactive"}</StatusPill>
                      </td>
                      <td className="py-3">
                        <button
                          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={async () => {
                            await patchUserActive(user.id, !user.active);
                            await loadAdmin();
                          }}
                        >
                          {user.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Audit events">
            <div className="space-y-3">
              {auditEvents.map((eventRecord) => (
                <div key={eventRecord.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{eventRecord.eventType}</div>
                    <div className="text-xs text-slate-500">{new Date(eventRecord.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Actor: {eventRecord.actorDisplayName || eventRecord.actorUserId || "system"}
                  </div>
                  <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950/95 p-3 text-xs text-slate-100">
                    {JSON.stringify(eventRecord.metadataJson, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card title="Invite user">
            <form className="grid gap-4" onSubmit={onInvite}>
              <Field label="Email">
                <input
                  className="input"
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                />
              </Field>
              <Field label="User type">
                <select
                  className="select"
                  value={inviteForm.userType}
                  onChange={(event) =>
                    setInviteForm((current) => ({
                      ...current,
                      userType: event.target.value as UserType,
                    }))
                  }
                >
                  <option value="worker">worker</option>
                  <option value="supervisor">supervisor</option>
                  <option value="caregiver">caregiver</option>
                  <option value="network_member">network_member</option>
                  <option value="org_admin">org_admin</option>
                </select>
              </Field>
              <Field label="Case (optional)">
                <select
                  className="select"
                  value={inviteForm.caseId}
                  onChange={(event) => setInviteForm((current) => ({ ...current, caseId: event.target.value }))}
                >
                  <option value="">No case binding</option>
                  {cases.map((caseRecord) => (
                    <option key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.familyName} ({caseRecord.status})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Case role">
                <select
                  className="select"
                  value={inviteForm.caseRole}
                  onChange={(event) =>
                    setInviteForm((current) => ({
                      ...current,
                      caseRole: event.target.value as CaseMembershipRecord["role"],
                    }))
                  }
                >
                  <option value="worker">worker</option>
                  <option value="supervisor">supervisor</option>
                  <option value="caregiver">caregiver</option>
                  <option value="network_member">network_member</option>
                </select>
              </Field>
              <button className="rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700" type="submit">
                Send invitation
              </button>
              {inviteResult ? (
                <div className="grid gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 break-all">
                  <div>Invite URL: {inviteResult}</div>
                  {inviteDelivery ? <div>Delivery: {inviteDelivery}</div> : null}
                </div>
              ) : null}
            </form>
          </Card>

          <Card title="Add user to case">
            <form className="grid gap-4" onSubmit={onMembership}>
              <Field label="Case">
                <select
                  className="select"
                  value={membershipForm.caseId}
                  onChange={(event) => setMembershipForm((current) => ({ ...current, caseId: event.target.value }))}
                >
                  <option value="">Select a case</option>
                  {cases.map((caseRecord) => (
                    <option key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.familyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="User">
                <select
                  className="select"
                  value={membershipForm.userId}
                  onChange={(event) => setMembershipForm((current) => ({ ...current, userId: event.target.value }))}
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} ({user.userType})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Case role">
                <select
                  className="select"
                  value={membershipForm.role}
                  onChange={(event) =>
                    setMembershipForm((current) => ({
                      ...current,
                      role: event.target.value as CaseMembershipRecord["role"],
                    }))
                  }
                >
                  <option value="worker">worker</option>
                  <option value="supervisor">supervisor</option>
                  <option value="caregiver">caregiver</option>
                  <option value="network_member">network_member</option>
                </select>
              </Field>
              <button className="rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800" type="submit">
                Add case membership
              </button>
            </form>
          </Card>

          <Card title="Open invitations">
            <div className="space-y-3 text-sm">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{invitation.email}</div>
                  <div className="text-slate-600">
                    {invitation.userType}
                    {invitation.caseRole ? ` · ${invitation.caseRole}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {invitation.acceptedAt ? `Accepted ${new Date(invitation.acceptedAt).toLocaleString()}` : "Pending"}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}

function CasePage() {
  const { caseId = "" } = useParams();
  const navigate = useNavigate();
  const { session, refresh } = useSession();
  const [activeTab, setActiveTab] = useStoredTab("case-status");
  const [casePayload, setCasePayload] = useState<({ ok: true } & CaseResponse) | null>(null);
  const [draftState, setDraftState] = useState<CaseState>(cloneDefaultCaseState());
  const [journalEntries, setJournalEntries] = useState<Awaited<ReturnType<typeof fetchJournal>>["entries"]>([]);
  const [journalForm, setJournalForm] = useState({
    audience: "all_members" as JournalAudience,
    message: "",
  });
  const [closureNote, setClosureNote] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentMessage, setDocumentMessage] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const loadCase = async () => {
    if (!caseId) return;
    try {
      const [caseResponse, journalResponse] = await Promise.all([fetchCase(caseId), fetchJournal(caseId)]);
      setCasePayload(caseResponse);
      setDraftState(normalizeCaseState(caseResponse.state));
      setJournalEntries(journalResponse.entries);
      setError("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code.startsWith("case_closed") || err.code === "case_membership_required") {
          navigate(`/access-denied?reason=${encodeURIComponent(err.code)}`, { replace: true });
          return;
        }
        setError(err.hint);
      } else {
        setError("Unable to load case.");
      }
    }
  };

  useEffect(() => {
    void loadCase();
  }, [caseId]);

  const currentRole = casePayload?.membership?.role || session?.user.userType || "org_admin";

  const nextNetworkStepSummary = useMemo(() => {
    const completed = draftState.nextNetworkSteps.filter((item) => item.completed).length;
    return {
      completed,
      pending: Math.max(0, draftState.nextNetworkSteps.length - completed),
    };
  }, [draftState.nextNetworkSteps]);

  const updateDraftNextNetworkStepsText = (value: string) => {
    setDraftState((current) => ({
      ...current,
      nextNetworkStepsText: value,
      nextNetworkSteps: buildNextNetworkStepsFromText(value, current.nextNetworkSteps),
    }));
  };

  const toggleDraftNextNetworkStep = (id: string) => {
    setDraftState((current) => ({
      ...current,
      nextNetworkSteps: current.nextNetworkSteps.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    }));
  };

  const saveCaseState = async () => {
    if (!casePayload) return;
    setSaving(true);
    try {
      await patchCase(casePayload.caseRecord.id, {
        familyName: casePayload.caseRecord.familyName,
        state: draftState,
      });
      await loadCase();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to save case.");
    } finally {
      setSaving(false);
    }
  };

  const submitJournal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!casePayload) return;
    try {
      await createJournal(casePayload.caseRecord.id, journalForm);
      setJournalForm((current) => ({ ...current, message: "" }));
      await loadCase();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to post journal entry.");
    }
  };

  const submitClosure = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!casePayload) return;
    try {
      await closeCase(casePayload.caseRecord.id, closureNote);
      await loadCase();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to close case.");
    }
  };

  const submitDocumentUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!casePayload || !documentFile) return;
    setUploadingDocument(true);
    try {
      await uploadCaseDocument(casePayload.caseRecord.id, documentFile);
      setDocumentMessage(`Uploaded ${documentFile.name}.`);
      setDocumentFile(null);
      await loadCase();
    } catch (err) {
      setError(err instanceof ApiError ? err.hint : "Unable to upload document.");
    } finally {
      setUploadingDocument(false);
    }
  };

  if (!casePayload) {
    return (
      <PageFrame title="Case" subtitle="Loading case data…">
        {error ? <ErrorNotice error={error} /> : <div className="text-sm text-slate-600">Loading…</div>}
      </PageFrame>
    );
  }

  const { caseRecord, memberships, permissions, documents } = casePayload;

  return (
    <PageFrame
      title={caseRecord.familyName}
      subtitle="Case access is enforced server-side by organization, role, case membership, and case status."
    >
      {error ? <div className="mb-4"><ErrorNotice error={error} /></div> : null}
      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Metric label="Case status" value={caseRecord.status} helper="Backend-enforced closure rules" />
        <Metric label="Your role" value={String(currentRole)} helper="Derived from membership or org admin" />
        <Metric label="Plan stability" value={`${draftState.planStability}%`} helper="Stored in case state" />
        <Metric label="Journal entries" value={String(journalEntries.length)} helper="Persisted in backend data" />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              activeTab === tab.key ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6">
        {activeTab === "case-status" ? (
          <Card
            title="Case status"
            right={
              permissions.canEditCaseState ? (
                <button
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={saving}
                  onClick={saveCaseState}
                >
                  {saving ? "Saving..." : "Save case state"}
                </button>
              ) : null
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Current phase">
                <input
                  className="input"
                  value={draftState.currentPhaseLabel}
                  onChange={(event) => setDraftState((current) => ({ ...current, currentPhaseLabel: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
              <Field label="Current watchpoint">
                <input
                  className="input"
                  value={draftState.currentWatchpoint}
                  onChange={(event) => setDraftState((current) => ({ ...current, currentWatchpoint: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
              <Field label="Caregiver summary">
                <textarea
                  className="textarea"
                  value={draftState.caregiverSummary}
                  onChange={(event) => setDraftState((current) => ({ ...current, caregiverSummary: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
              <Field label="Risk statement">
                <textarea
                  className="textarea"
                  value={draftState.riskStatement}
                  onChange={(event) => setDraftState((current) => ({ ...current, riskStatement: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
            </div>
            <div className="mt-6">
              <Field label="Plan stability">
                <ProgressBar value={draftState.planStability} />
              </Field>
            </div>
          </Card>
        ) : null}

        {activeTab === "timeline" ? (
          <Card title="Timeline">
            <div className="space-y-4">
              {draftState.timelineEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{entry.title}</div>
                    <div className="text-xs text-slate-500">{entry.date}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{entry.helper}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {activeTab === "network" ? (
          <Card
            title="Network building"
            right={
              permissions.canEditCaseState ? (
                <button
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={saving}
                  onClick={saveCaseState}
                >
                  {saving ? "Saving..." : "Save network updates"}
                </button>
              ) : null
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Case memberships</h3>
                {memberships.map((membership) => (
                  <div key={membership.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{membership.displayName || membership.email || membership.userId}</div>
                        <div className="text-sm text-slate-600">{membership.role}</div>
                      </div>
                      <StatusPill tone={membership.active ? "green" : "red"}>{membership.active ? "active" : "inactive"}</StatusPill>
                    </div>
                    {permissions.canManageMemberships ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={async () => {
                            await patchCaseMembership(membership.id, { active: !membership.active });
                            await loadCase();
                          }}
                        >
                          {membership.active ? "Revoke access" : "Restore access"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Supporting network detail</h3>
                {draftState.networkMembers.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="font-semibold text-slate-900">{member.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{member.relationship}</div>
                    <div className="mt-2 text-sm text-slate-600">{member.role}</div>
                    <div className="mt-2 text-xs text-slate-500">Availability: {member.availability || "Not recorded"}</div>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Network gaps</div>
                  <Field label="Current gaps">
                    <textarea
                      className="textarea mt-3"
                      value={draftState.currentGapsText}
                      onChange={(event) => setDraftState((current) => ({ ...current, currentGapsText: event.target.value }))}
                      disabled={!permissions.canEditCaseState}
                    />
                  </Field>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Next steps</div>
                    <div className="text-xs font-medium text-slate-500">
                      {nextNetworkStepSummary.completed} completed · {nextNetworkStepSummary.pending} pending
                    </div>
                  </div>
                  <Field label="Next network-building steps">
                    <textarea
                      className="textarea mt-3"
                      value={draftState.nextNetworkStepsText}
                      onChange={(event) => updateDraftNextNetworkStepsText(event.target.value)}
                      disabled={!permissions.canEditCaseState}
                    />
                  </Field>
                  <div className="mt-4 space-y-3">
                    {draftState.nextNetworkSteps.length === 0 ? (
                      <div className="text-sm text-slate-500">No next steps recorded yet.</div>
                    ) : (
                      draftState.nextNetworkSteps.map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${
                            item.completed
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-rose-200 bg-rose-50 text-rose-900"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleDraftNextNetworkStep(item.id)}
                            disabled={!permissions.canEditCaseState}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className={item.completed ? "line-through opacity-80" : ""}>{item.text}</div>
                            <div
                              className={`mt-1 text-xs font-medium uppercase tracking-[0.12em] ${
                                item.completed ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {item.completed ? "Completed" : "Pending"}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {activeTab === "planning" ? (
          <Card title="Safeguarding planning">
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label="Safeguarding goals">
                <textarea
                  className="textarea"
                  value={draftState.safeguardingGoals}
                  onChange={(event) => setDraftState((current) => ({ ...current, safeguardingGoals: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
              <Field label="Immediate actions">
                <textarea
                  className="textarea"
                  value={draftState.immediateActionsText}
                  onChange={(event) => setDraftState((current) => ({ ...current, immediateActionsText: event.target.value }))}
                  disabled={!permissions.canEditCaseState}
                />
              </Field>
            </div>
            <div className="mt-6 space-y-4">
              {draftState.rules.map((rule) => (
                <div key={rule.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{rule.title}</div>
                    <StatusPill tone={rule.status === "On track" ? "green" : rule.status === "Needs review" ? "amber" : "red"}>
                      {rule.status}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Owner: {rule.owner} · Backup: {rule.backup}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{rule.note}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {activeTab === "monitoring" ? (
          <Card title="Monitoring and testing">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                {draftState.monitoringItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    {item.text}
                  </div>
                ))}
              </div>
              <div className="grid gap-4">
                <Field label="Fire drill scenario">
                  <textarea
                    className="textarea"
                    value={draftState.fireDrillScenario}
                    onChange={(event) => setDraftState((current) => ({ ...current, fireDrillScenario: event.target.value }))}
                    disabled={!permissions.canEditCaseState}
                  />
                </Field>
                <Field label="Fire drill notes">
                  <textarea
                    className="textarea"
                    value={draftState.fireDrillRecordNotes}
                    onChange={(event) => setDraftState((current) => ({ ...current, fireDrillRecordNotes: event.target.value }))}
                    disabled={!permissions.canEditCaseState}
                  />
                </Field>
              </div>
            </div>
          </Card>
        ) : null}

        {activeTab === "journal" ? (
          <Card title="Shared journal">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {journalEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">{entry.author}</div>
                      <div className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{entry.audience.replace(/_/g, " ")}</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{entry.message}</div>
                  </div>
                ))}
              </div>
              <form className="grid gap-4" onSubmit={submitJournal}>
                <Field label="Audience">
                  <select
                    className="select"
                    value={journalForm.audience}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        audience: event.target.value as JournalAudience,
                      }))
                    }
                    disabled={!permissions.canPostJournal}
                  >
                    <option value="all_members">all members</option>
                    <option value="caregiver_network">caregiver and network</option>
                    <option value="staff_only">staff only</option>
                  </select>
                </Field>
                <Field label="Message">
                  <textarea
                    className="textarea"
                    value={journalForm.message}
                    onChange={(event) => setJournalForm((current) => ({ ...current, message: event.target.value }))}
                    disabled={!permissions.canPostJournal}
                  />
                </Field>
                <button
                  className="rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  disabled={!permissions.canPostJournal}
                  type="submit"
                >
                  Add journal entry
                </button>
              </form>
            </div>
          </Card>
        ) : null}

        {activeTab === "closure" ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card title="Closure and ongoing safeguarding">
              <div className="grid gap-4">
                <Field label="Closure alert">
                  <textarea
                    className="textarea"
                    value={draftState.closureAlertNote}
                    onChange={(event) => setDraftState((current) => ({ ...current, closureAlertNote: event.target.value }))}
                    disabled={!permissions.canEditCaseState}
                  />
                </Field>
                <Field label="Post-closure continuity">
                  <textarea
                    className="textarea"
                    value={draftState.closureJournalText}
                    onChange={(event) => setDraftState((current) => ({ ...current, closureJournalText: event.target.value }))}
                    disabled={!permissions.canEditCaseState}
                  />
                </Field>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Workers lose access automatically once the case is closed. Caregivers and active network members retain access.
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Documents</div>
                  <form className="grid gap-3 rounded-2xl border border-slate-200 p-4" onSubmit={submitDocumentUpload}>
                    <Field
                      label="Upload supporting document"
                      helper="Documents are stored in organization-owned object storage when the deployment has a storage binding."
                    >
                      <input
                        className="input"
                        type="file"
                        onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                        disabled={uploadingDocument || !permissions.canUploadDocuments}
                      />
                    </Field>
                    <button
                      className="rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      type="submit"
                      disabled={!documentFile || uploadingDocument || !permissions.canUploadDocuments}
                    >
                      {uploadingDocument ? "Uploading..." : "Upload document"}
                    </button>
                    {documentMessage ? <div className="text-xs text-emerald-700">{documentMessage}</div> : null}
                  </form>
                  {documents.length === 0 ? (
                    <div className="text-sm text-slate-500">No documents have been uploaded yet.</div>
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} className="rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
                        <div className="font-medium text-slate-900">{document.fileName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {document.mimeType} · uploaded by {document.uploadedBy} · {new Date(document.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card title="Case closure">
              <form className="grid gap-4" onSubmit={submitClosure}>
                <div className="text-sm text-slate-600">
                  Closing a case updates the case state, writes an audit event, and causes worker access to end automatically on the backend.
                </div>
                <Field label="Closure note">
                  <textarea
                    className="textarea"
                    value={closureNote}
                    onChange={(event) => setClosureNote(event.target.value)}
                    disabled={!permissions.canCloseCase || caseRecord.status === "closed"}
                  />
                </Field>
                <button
                  className="rounded-full bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  disabled={!permissions.canCloseCase || caseRecord.status === "closed"}
                  type="submit"
                >
                  {caseRecord.status === "closed" ? "Case already closed" : "Close case"}
                </button>
              </form>
            </Card>
          </div>
        ) : null}
      </div>
    </PageFrame>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/app" element={<AppHomePage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
