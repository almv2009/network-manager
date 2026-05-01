import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { submitSupportTicket, type SessionResponse } from "./api";
import type { SupportTicketPayload } from "../shared/types";
import { useSession } from "./session";
import { AdminDashboard } from "./components/AdminDashboard";
import { AccountDashboard } from "./components/AccountDashboard";
import { OwnerDashboard } from "./components/OwnerDashboard";
import { SupportModal } from "./components/SupportModal";
import { TurnstileWidget } from "./components/TurnstileWidget";
import EnterpriseWorkspace from "./EnterpriseWorkspace";
import type { TabKey } from "./StandaloneApp";

const supportEmail = "admin@ataconsultancy.net";
const workspaceTabs = new Set<TabKey>(["case-status", "timeline", "network", "planning", "monitoring", "journal", "closure"]);

function extractInviteToken(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return String(url.searchParams.get("invite") || "").trim();
  } catch {
    return trimmed;
  }
}

function resolveWorkspaceTab(route: string, searchParams: URLSearchParams): TabKey | undefined {
  if (route.startsWith("/process")) return "planning";
  const requested = String(searchParams.get("tab") || "").trim();
  if (workspaceTabs.has(requested as TabKey)) return requested as TabKey;
  return undefined;
}

export default function EnterpriseApp() {
  const { loading, session, error, refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const route = location.pathname;
  const workspaceTab = resolveWorkspaceTab(route, searchParams);
  const inviteTokenFromUrl = String(searchParams.get("invite") || "").trim();
  const requestedReturnTo = String(searchParams.get("returnTo") || "/account");
  const safeInviteReturnTo = requestedReturnTo.startsWith("/") ? requestedReturnTo : "/account";
  const isInviteSwitchFlow = Boolean(session && route === "/sign-in" && inviteTokenFromUrl);
  const accessDeniedReason = searchParams.get("reason") || "";
  const signedOut = searchParams.get("signedOut") === "1";
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportErrorMessage, setSupportErrorMessage] = useState("");
  const [supportStatusMessage, setSupportStatusMessage] = useState("");

  useEffect(() => {
    if (!isInviteSwitchFlow) return;
    const returnToPath = `/auth/sign-in?invite=${encodeURIComponent(inviteTokenFromUrl)}&returnTo=${encodeURIComponent(safeInviteReturnTo)}`;
    window.location.assign(`/auth/sign-out?returnTo=${encodeURIComponent(returnToPath)}`);
  }, [inviteTokenFromUrl, isInviteSwitchFlow, safeInviteReturnTo]);

  useEffect(() => {
    if (loading || !session) return;
    if (isInviteSwitchFlow) return;
    if (route === "/" || route === "/sign-in" || route === "/access-denied") {
      if (session.permissions.isPlatformOwner) {
        navigate("/owner", { replace: true });
        return;
      }
      if (session.permissions.isOrgAdmin) {
        navigate("/admin", { replace: true });
        return;
      }
      navigate("/app", { replace: true });
      return;
    }
    if (route.startsWith("/process")) {
      navigate("/app?tab=planning", { replace: true });
      return;
    }
    if (route.startsWith("/admin") && session.permissions.isPlatformOwner) {
      navigate("/owner", { replace: true });
      return;
    }
    if (route.startsWith("/admin") && !session.permissions.isOrgAdmin) {
      navigate("/app", { replace: true });
    }
    if (route.startsWith("/account") && session.permissions.isOrgAdmin) {
      navigate("/admin", { replace: true });
      return;
    }
    if (route.startsWith("/owner") && !session.permissions.isPlatformOwner) {
      navigate(session.permissions.isOrgAdmin ? "/admin" : "/app", { replace: true });
    }
  }, [isInviteSwitchFlow, loading, navigate, route, session]);

  if (loading) {
    return (
      <div className="nm-app min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-6">
          <section className="app-card w-full rounded-3xl border p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SgT Network Manager</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">Loading your case workspace</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Checking session access and organization permissions.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!session) {
    if (route === "/access-denied") {
      return <AccessDeniedPage reason={accessDeniedReason || error?.code || "auth_required"} />;
    }
    return <SignInPage signedOut={signedOut} />;
  }

  if (isInviteSwitchFlow) {
    const returnToPath = `/auth/sign-in?invite=${encodeURIComponent(inviteTokenFromUrl)}&returnTo=${encodeURIComponent(safeInviteReturnTo)}`;
    return (
      <InviteAccountSwitchPage
        signedInEmail={session.user.email}
        switchAccountHref={`/auth/sign-out?returnTo=${encodeURIComponent(returnToPath)}`}
      />
    );
  }

  const canUseAccountDashboard = !session.permissions.isPlatformOwner && !session.permissions.isOrgAdmin;
  const viewingOwner = route.startsWith("/owner") && session.permissions.isPlatformOwner;
  const viewingAdmin = route.startsWith("/admin") && session.permissions.isOrgAdmin;
  const viewingAccount = route.startsWith("/account") && canUseAccountDashboard;
  const viewingWorkspace = !viewingOwner && !viewingAdmin && !viewingAccount;
  const showOrgAdminNav = session.permissions.isOrgAdmin && !session.permissions.isPlatformOwner;
  const accountTabLabel =
    session.user.userType === "worker" || session.user.userType === "supervisor"
      ? "Practitioner dashboard"
      : session.user.userType === "caregiver" || session.user.userType === "network_member"
        ? "Family dashboard"
        : "My account";
  const roleBadgeLabel = session.permissions.isPlatformOwner
    ? "Platform owner account"
    : session.permissions.isOrgAdmin
      ? "Organization admin account"
      : session.user.userType === "worker" || session.user.userType === "supervisor"
        ? "Practitioner account"
        : session.user.userType === "caregiver" || session.user.userType === "network_member"
          ? "Family and network account"
          : "Workspace account";

  const handleSupportSubmit = async (payload: SupportTicketPayload) => {
    setSupportSubmitting(true);
    setSupportErrorMessage("");
    setSupportStatusMessage("");
    try {
      const response = await submitSupportTicket(payload);
      setSupportStatusMessage(response.message);
    } catch (error) {
      setSupportErrorMessage(error instanceof Error ? error.message : "The support ticket could not be sent.");
    } finally {
      setSupportSubmitting(false);
    }
  };

  const supportContextLabel = viewingOwner
    ? "Owner dashboard"
    : viewingAdmin
      ? "Admin dashboard"
      : viewingAccount
        ? accountTabLabel
        : "Case workspace";

  return (
    <div className="nm-app min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <section className="app-card nm-shell-header rounded-3xl border px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="nm-brand-mark flex h-12 w-12 items-center justify-center rounded-full border p-2">
                  <img src="/sgt-logo.png" alt="SgT logo" className="h-full w-full object-contain" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SgT Network Manager</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900">{session.branding.name || "Network Manager"}</h1>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {session.organization.name}
                </span>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                  {roleBadgeLabel}
                </span>
                {!session.license.isLicensed ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    {session.license.accessState === "archived" ? "Workspace archived" : "License inactive"}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-slate-600">
                Signed in as {session.user.displayName} • {session.user.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                  Current view: {supportContextLabel}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                  Access: {session.license.isLicensed ? "licensed" : session.license.accessState.replace(/_/g, " ")}
                </span>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-wrap">
              <button
                type="button"
                onClick={() => navigate("/app")}
                className={`rounded-2xl px-4 py-3 text-sm font-medium ${viewingWorkspace ? "app-primary-button" : "app-secondary-button"}`}
              >
                Case workspace
              </button>
              {canUseAccountDashboard ? (
                <button
                  type="button"
                  onClick={() => navigate("/account")}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium ${viewingAccount ? "app-primary-button" : "app-secondary-button"}`}
                >
                  {accountTabLabel}
                </button>
              ) : null}
              {showOrgAdminNav ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium ${viewingAdmin ? "app-primary-button" : "app-secondary-button"}`}
                >
                  Admin dashboard
                </button>
              ) : null}
              {session.permissions.isPlatformOwner ? (
                <button
                  type="button"
                  onClick={() => navigate("/owner")}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium ${viewingOwner ? "app-primary-button" : "app-secondary-button"}`}
                >
                  Owner dashboard
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(true)}
                className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
              >
                Help
              </button>
              <a href="/privacy.html" target="_blank" rel="noreferrer" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Privacy
              </a>
              <a href="/terms.html" target="_blank" rel="noreferrer" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Terms
              </a>
              <a href="/auth/sign-out" className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700">
                Sign out
              </a>
            </div>
          </div>
        </section>

        {viewingOwner ? (
          <OwnerDashboard session={session} />
        ) : viewingAdmin ? (
          <AdminDashboard session={session} />
        ) : viewingAccount ? (
          <AccountDashboard session={session as SessionResponse} onSessionRefresh={refresh} />
        ) : (
          <EnterpriseWorkspace session={session} initialTab={workspaceTab} />
        )}
      </div>
      <SupportModal
        isOpen={isSupportModalOpen}
        isSubmitting={supportSubmitting}
        errorMessage={supportErrorMessage}
        statusMessage={supportStatusMessage}
        supportEmail={supportEmail}
        activeTab={supportContextLabel}
        currentPath={location.pathname}
        onClose={() => setIsSupportModalOpen(false)}
        onSubmit={handleSupportSubmit}
      />
    </div>
  );
}

function InviteAccountSwitchPage({ signedInEmail, switchAccountHref }: { signedInEmail: string; switchAccountHref: string }) {
  return (
    <div className="nm-app min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <section className="app-card w-full rounded-3xl border p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invitation link detected</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Switch account to accept this invitation</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You are currently signed in as <span className="font-medium text-slate-900">{signedInEmail}</span>.
            To accept the invitation for another user, sign out first and continue with the invite flow.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={switchAccountHref} className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium">
              Sign out and continue invite
            </a>
            <a href="/app" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
              Stay in current account
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function SignInPage({ signedOut }: { signedOut: boolean }) {
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const inviteFromUrl = searchParams.get("invite") || "";
  const showingInviteFlow = Boolean(inviteFromUrl.trim());
  const setupMode = searchParams.get("setup") || "";
  const recoveryTokenFromUrl = String(searchParams.get("recovery") || "").trim();
  const returnTo = searchParams.get("returnTo") || (showingInviteFlow ? "/account" : "/app");
  const showingAccountSetup = setupMode === "owner" || setupMode === "account";
  const showingPasswordResetFlow = Boolean(recoveryTokenFromUrl) && !showingInviteFlow && !showingAccountSetup;
  const [inviteToken, setInviteToken] = useState(inviteFromUrl);
  const [displayName, setDisplayName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [localIdentifier, setLocalIdentifier] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [localTurnstileToken, setLocalTurnstileToken] = useState("");
  const [bootstrapOrganizationName, setBootstrapOrganizationName] = useState("");
  const [bootstrapDisplayName, setBootstrapDisplayName] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapSubmitting, setBootstrapSubmitting] = useState(false);
  const [inviteTurnstileToken, setInviteTurnstileToken] = useState("");
  const [bootstrapTurnstileToken, setBootstrapTurnstileToken] = useState("");
  const [showLocalPassword, setShowLocalPassword] = useState(false);
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [showBootstrapPassword, setShowBootstrapPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<"password" | "username" | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [recoveryTurnstileToken, setRecoveryTurnstileToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [resetTurnstileToken, setResetTurnstileToken] = useState("");

  useEffect(() => {
    setInviteToken(inviteFromUrl);
  }, [inviteFromUrl]);

  const handleLocalInviteSignIn = async () => {
    const normalizedToken = extractInviteToken(inviteToken);
    if (!normalizedToken) {
      setInviteError("Paste the invitation link or token to continue.");
      return;
    }
    if (!displayName.trim()) {
      setInviteError("Create your account username before continuing.");
      return;
    }
    setInviteSubmitting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      const response = await fetch("/auth/local-invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          inviteToken: normalizedToken,
          displayName,
          password: invitePassword,
          ...(inviteTurnstileToken ? { turnstileToken: inviteTurnstileToken } : {}),
          returnTo,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; hint?: string; redirectTo?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.hint || "The invitation could not be used.");
      }
      setInviteSuccess("Invitation accepted. Loading your workspace...");
      window.location.assign(payload.redirectTo || "/app");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "The invitation could not be used.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleLocalPasswordSignIn = async () => {
    setInviteError("");
    setInviteSuccess("");
    setLocalSubmitting(true);
    try {
      const response = await fetch("/auth/local-sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          identifier: localIdentifier,
          password: localPassword,
          ...(localTurnstileToken ? { turnstileToken: localTurnstileToken } : {}),
          returnTo,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; hint?: string; redirectTo?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.hint || "Local sign-in could not be completed.");
      }
      window.location.assign(payload.redirectTo || "/app");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Local sign-in could not be completed.");
    } finally {
      setLocalSubmitting(false);
    }
  };

  const handleCredentialRecoveryRequest = async () => {
    if (!recoveryMode) return;
    setRecoverySubmitting(true);
    setRecoveryError("");
    setRecoveryStatus("");
    try {
      const response = await fetch("/auth/local-recovery/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          mode: recoveryMode,
          email: recoveryEmail,
          ...(recoveryTurnstileToken ? { turnstileToken: recoveryTurnstileToken } : {}),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; hint?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.hint || "Recovery request could not be completed.");
      }
      setRecoveryStatus(payload.message || "If an account exists for that email, instructions have been sent.");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Recovery request could not be completed.");
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!recoveryTokenFromUrl.trim()) {
      setResetError("This recovery link is missing a token. Request a new password reset email.");
      return;
    }
    if (!resetPassword || !resetPasswordConfirm) {
      setResetError("Enter and confirm your new password.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetSubmitting(true);
    setResetError("");
    setResetStatus("");
    try {
      const response = await fetch("/auth/local-recovery/reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          token: recoveryTokenFromUrl,
          password: resetPassword,
          ...(resetTurnstileToken ? { turnstileToken: resetTurnstileToken } : {}),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; hint?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.hint || "Password reset could not be completed.");
      }
      setResetStatus(payload.message || "Password updated. You can now sign in.");
      setResetPassword("");
      setResetPasswordConfirm("");
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Password reset could not be completed.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleBootstrapAdmin = async () => {
    setInviteError("");
    setInviteSuccess("");
    setBootstrapSubmitting(true);
    try {
      const response = await fetch("/auth/bootstrap-admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          organizationName: bootstrapOrganizationName,
          displayName: bootstrapDisplayName,
          email: bootstrapEmail,
          password: bootstrapPassword,
          ...(bootstrapTurnstileToken ? { turnstileToken: bootstrapTurnstileToken } : {}),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; hint?: string; redirectTo?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.hint || "The organization account could not be created.");
      }
      window.location.assign(payload.redirectTo || "/app");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "The organization account could not be created.");
    } finally {
      setBootstrapSubmitting(false);
    }
  };

  return (
    <div className="nm-app min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6 md:p-10">
        <div className="w-full space-y-6">
          <section className="app-card rounded-3xl border px-8 py-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <img src="/sgt-logo.png" alt="SgT logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Safeguarding Together</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Network Manager</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Collaborative safeguarding workspace for professionals, families, and networks.
                </p>
              </div>
            </div>
          </section>

          <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="app-card rounded-3xl border p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Safeguarding Together</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Network Manager</h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Network Manager is a shared safeguarding workspace for professionals, families, and networks.
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              It supports case setup, network building, planning, monitoring, and continuity after closure.
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              The purpose is clear: stronger coordination, better accountability, and safer outcomes for children.
            </p>
            <details className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Read full platform overview</summary>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                <p>
                  Strong safeguarding is built through organized, sustainable networks around children and families. When families and trusted people are
                  involved in planning and action, work becomes clearer and more durable.
                </p>
                <p>
                  The platform keeps a shared record of what was agreed, who is responsible, and how plans are holding over time, improving transparency and
                  shared understanding.
                </p>
                <p>
                  It also supports continuity after closure by keeping key information and actions accessible where appropriate to family and network members.
                </p>
              </div>
            </details>
          </section>

          <section className="app-card rounded-3xl border p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Secure access</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">
              {showingInviteFlow
                ? "Accept your invitation"
                : showingAccountSetup
                  ? "Create organization account"
                  : "Sign in to your workspace"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {showingInviteFlow
                ? "Set your password and enter the workspace from the invitation link shared with you."
                : showingAccountSetup
                  ? "Create the organization and first organization-admin account, then choose a package before the live workspace is activated."
                  : "Use your username and password to enter Network Manager."}
            </p>
            <div className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">How access works</div>
              <ul className="space-y-2 text-sm leading-6 text-slate-700">
                <li>Normal sign-in uses your username and password.</li>
                <li>If you were sent an invitation link, open that link and it will take you straight to the first-time access form.</li>
                <li>If you are setting up a brand-new workspace, use the create-account button and then choose a package after the account is created.</li>
              </ul>
            </div>
            {signedOut ? (
              <div className="nm-toast-success mt-5" role="status" aria-live="polite">
                You have been signed out.
              </div>
            ) : null}
            {inviteError ? (
              <div className="nm-toast-error mt-5" role="alert">
                {inviteError}
              </div>
            ) : null}
            {inviteSuccess ? (
              <div className="nm-toast-success mt-5" role="status" aria-live="polite">
                {inviteSuccess}
              </div>
            ) : null}
            {showingPasswordResetFlow ? (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">Reset your password</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Set a new password for this account. Once saved, use your existing username with the new password.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    New password
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        type={showResetPassword ? "text" : "password"}
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((current) => !current)}
                        className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                      >
                        {showResetPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Confirm new password
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        type={showResetPasswordConfirm ? "text" : "password"}
                        value={resetPasswordConfirm}
                        onChange={(event) => setResetPasswordConfirm(event.target.value)}
                        placeholder="Re-enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPasswordConfirm((current) => !current)}
                        className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                      >
                        {showResetPasswordConfirm ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <TurnstileWidget action="local_recovery_reset" onTokenChange={setResetTurnstileToken} />
                  <div>
                    <button
                      type="button"
                      disabled={resetSubmitting || !resetPassword || !resetPasswordConfirm}
                      onClick={() => void handlePasswordReset()}
                      className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium disabled:opacity-60"
                    >
                      {resetSubmitting ? "Updating password..." : "Save new password"}
                    </button>
                  </div>
                  {resetError ? (
                    <div className="nm-toast-error" role="alert">
                      {resetError}
                    </div>
                  ) : null}
                  {resetStatus ? (
                    <div className="nm-toast-success" role="status" aria-live="polite">
                      {resetStatus}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!showingInviteFlow && !showingAccountSetup ? (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">Sign in</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use the same username and password every time you come back to the app.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Username
                    <input
                      className="input"
                      value={localIdentifier}
                      onChange={(event) => setLocalIdentifier(event.target.value)}
                      placeholder="Enter your username"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Password
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        type={showLocalPassword ? "text" : "password"}
                        value={localPassword}
                        onChange={(event) => setLocalPassword(event.target.value)}
                        placeholder="Your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLocalPassword((current) => !current)}
                        className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                      >
                        {showLocalPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <TurnstileWidget action="local_sign_in" onTokenChange={setLocalTurnstileToken} />
                  <div>
                    <button
                      type="button"
                      disabled={localSubmitting || !localIdentifier.trim() || !localPassword}
                      onClick={() => void handleLocalPasswordSignIn()}
                      className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium disabled:opacity-60"
                    >
                      {localSubmitting ? "Signing in..." : "Sign in to Network Manager"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode("password");
                        setRecoveryError("");
                        setRecoveryStatus("");
                      }}
                      className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode("username");
                        setRecoveryError("");
                        setRecoveryStatus("");
                      }}
                      className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
                    >
                      Recover username/email
                    </button>
                  </div>
                  {recoveryMode ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {recoveryMode === "password" ? "Password reset request" : "Username and email reminder"}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Enter your account email. If we find an account, we will send recovery instructions.
                      </p>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-2 text-sm font-medium text-slate-700">
                          Account email
                          <input
                            className="input"
                            type="email"
                            value={recoveryEmail}
                            onChange={(event) => setRecoveryEmail(event.target.value)}
                            placeholder="name@organization.org"
                          />
                        </label>
                        <TurnstileWidget action="local_recovery_request" onTokenChange={setRecoveryTurnstileToken} />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={recoverySubmitting || !recoveryEmail.trim()}
                            onClick={() => void handleCredentialRecoveryRequest()}
                            className="app-primary-button rounded-2xl px-4 py-2 text-sm font-medium disabled:opacity-60"
                          >
                            {recoverySubmitting ? "Sending..." : "Send recovery instructions"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRecoveryMode(null);
                              setRecoveryEmail("");
                              setRecoveryError("");
                              setRecoveryStatus("");
                            }}
                            className="app-secondary-button rounded-2xl px-4 py-2 text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                        {recoveryError ? (
                          <div className="nm-toast-error" role="alert">
                            {recoveryError}
                          </div>
                        ) : null}
                        {recoveryStatus ? (
                          <div className="nm-toast-success" role="status" aria-live="polite">
                            {recoveryStatus}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <a href="/sign-in?setup=account" className="app-secondary-button inline-flex rounded-2xl px-5 py-3 text-sm font-medium">
                      Create account
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
            {showingInviteFlow ? (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">Invitation access</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Invitation links are single-use. On first use, set a password so you can sign in normally with your
                  username and password after this.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Invitation link or token
                    <input
                      className="input"
                      value={inviteToken}
                      onChange={(event) => setInviteToken(event.target.value)}
                      placeholder="Paste the invitation link or token"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Username
                    <input
                      className="input"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Required for invited account setup"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Set or confirm password
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        type={showInvitePassword ? "text" : "password"}
                        value={invitePassword}
                        onChange={(event) => setInvitePassword(event.target.value)}
                        placeholder="Required the first time you use an invite"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInvitePassword((current) => !current)}
                        className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                      >
                        {showInvitePassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <TurnstileWidget action="invite_account_setup" onTokenChange={setInviteTurnstileToken} />
                  <div>
                    <button
                      type="button"
                      disabled={inviteSubmitting || !inviteToken.trim() || !displayName.trim()}
                      onClick={() => void handleLocalInviteSignIn()}
                      className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium disabled:opacity-60"
                    >
                      {inviteSubmitting ? "Checking invitation..." : "Continue"}
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <a href="/sign-in" className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
                    Back to standard sign-in
                  </a>
                </div>
              </div>
            ) : null}
            {showingAccountSetup ? (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">Create organization account</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Create the organization and first organization-admin account. After that, you will be taken to package selection before licensed access is activated.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Organization name
                    <input
                      className="input"
                      value={bootstrapOrganizationName}
                      onChange={(event) => setBootstrapOrganizationName(event.target.value)}
                      placeholder="Example: Toronto Family Safeguarding Service"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Full name
                    <input
                      className="input"
                      value={bootstrapDisplayName}
                      onChange={(event) => setBootstrapDisplayName(event.target.value)}
                      placeholder="Your full name"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Work email
                    <input
                      className="input"
                      type="email"
                      value={bootstrapEmail}
                      onChange={(event) => setBootstrapEmail(event.target.value)}
                      placeholder="name@organization.org"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Password
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        type={showBootstrapPassword ? "text" : "password"}
                        value={bootstrapPassword}
                        onChange={(event) => setBootstrapPassword(event.target.value)}
                        placeholder="At least 10 characters with letters and numbers"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBootstrapPassword((current) => !current)}
                        className="app-secondary-button rounded-2xl px-3 py-2 text-xs font-medium"
                      >
                        {showBootstrapPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <TurnstileWidget action="bootstrap_admin" onTokenChange={setBootstrapTurnstileToken} />
                  <div>
                    <button
                      type="button"
                      disabled={
                        bootstrapSubmitting ||
                        !bootstrapOrganizationName.trim() ||
                        !bootstrapDisplayName.trim() ||
                        !bootstrapEmail.trim() ||
                        !bootstrapPassword
                      }
                      onClick={() => void handleBootstrapAdmin()}
                      className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium disabled:opacity-60"
                    >
                      {bootstrapSubmitting ? "Creating account..." : "Create account"}
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <a href="/sign-in" className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
                    Back to standard sign-in
                  </a>
                </div>
              </div>
            ) : null}
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-semibold text-slate-900">Need access or setup help?</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Contact the administrator if you need an invitation, pricing, or help creating a new organization account.
              </p>
              <div className="mt-4">
                <a href={`mailto:${supportEmail}`} className="app-secondary-button inline-flex rounded-2xl px-5 py-3 text-sm font-medium">
                  Contact admin
                </a>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/privacy.html" target="_blank" rel="noreferrer" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Privacy
              </a>
              <a href="/terms.html" target="_blank" rel="noreferrer" className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
                Terms
              </a>
            </div>
          </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccessDeniedPage({ reason }: { reason: string }) {
  return (
    <div className="nm-app min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <section className="app-card rounded-3xl border p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Access denied</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">This workspace is not available right now</h1>
          <p className="mt-4 text-sm leading-7 text-slate-700">{reasonMessage(reason)}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/auth/sign-in?returnTo=/app" className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium">
              Try sign-in again
            </a>
            <a href={`mailto:${supportEmail}`} className="app-secondary-button rounded-2xl px-5 py-3 text-sm font-medium">
              Contact administrator
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function reasonMessage(reason: string) {
  switch (reason) {
    case "inactive_user":
      return "Your account is currently inactive. Contact your organization administrator to restore access.";
    case "auth_not_configured":
      return "Enterprise sign-in has not been configured for this deployment yet. Add the OIDC and session secrets before going live.";
    case "user_not_provisioned":
      return "Your identity is not yet provisioned for this organization. Ask the administrator to send or resend an invitation.";
    case "org_admin_required":
      return "This area requires organization-admin access.";
    case "organization_unlicensed":
      return "This workspace does not yet have an active licensed seat allocation. Contact the platform owner to activate access before using the case workspace.";
    case "organization_archived":
      return "This workspace has been archived and is no longer available for active use. Contact the platform owner if access needs to be restored.";
    default:
      return "Sign-in could not be completed with the current session. Try again or contact the administrator if the problem continues.";
  }
}
