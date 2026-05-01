import { useEffect, useMemo, useState } from "react";

import type { CaseResponse, CaseState, CaseSummary, JournalAudience, SessionPayload } from "../shared/types";
import {
  createJournal,
  deleteCaseDocument,
  fetchCase,
  fetchJournal,
  fetchOrganizationCases,
  getCaseDocumentUrl,
  patchCase,
  uploadCaseDocument,
} from "./api";
import StandaloneApp, {
  type AppData,
  type EnterpriseWorkspaceDocument,
  type EnterpriseWorkspaceJournalEntry,
  type TabKey,
} from "./StandaloneApp";

type Props = {
  session: SessionPayload & { ok?: true };
  initialTab?: TabKey;
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function mapJournalAudience(audienceLabel: string): JournalAudience {
  const normalized = audienceLabel.trim().toLowerCase();
  if (normalized.includes("worker only") || normalized.includes("staff")) return "staff_only";
  if (normalized.includes("caregiver")) return "caregiver_network";
  return "all_members";
}

function appendChangeLog(state: AppData, message: string, author: string): AppData {
  const currentLog = Array.isArray((state as { changeLog?: unknown }).changeLog)
    ? ((state as { changeLog?: Array<Record<string, unknown>> }).changeLog || [])
    : [];

  return {
    ...state,
    changeLog: [
      {
        id: makeId("change"),
        message,
        author,
        audience: "staff_only",
        timestamp: nowStamp(),
      },
      ...currentLog,
    ].slice(0, 40),
  } as AppData;
}

export default function EnterpriseWorkspace({ session, initialTab = "case-status" }: Props) {
  const isPractitionerWorkspace = session.user.userType === "worker" || session.user.userType === "supervisor";
  const dashboardPath = session.permissions.isPlatformOwner ? "/owner" : session.permissions.isOrgAdmin ? "/admin" : "/account";
  const dashboardLabel = session.permissions.isPlatformOwner ? "owner dashboard" : "admin dashboard";
  const caseSelectionStorageKey = `nm:active_case:${session.organization.id}:${session.user.id}`;
  const [cases, setCases] = useState<CaseSummary[]>(session.accessibleCases);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(isPractitionerWorkspace ? "" : session.accessibleCases[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [caseResponse, setCaseResponse] = useState<CaseResponse | null>(null);
  const [journalEntries, setJournalEntries] = useState<EnterpriseWorkspaceJournalEntry[]>([]);
  const [savingCase, setSavingCase] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState("");

  useEffect(() => {
    void refreshCases();
  }, [session.organization.id]);

  useEffect(() => {
    if (!isPractitionerWorkspace || typeof window === "undefined") return;
    const storedCaseId = String(window.localStorage.getItem(caseSelectionStorageKey) || "").trim();
    if (!storedCaseId) return;
    setSelectedCaseId((current) => current || storedCaseId);
  }, [caseSelectionStorageKey, isPractitionerWorkspace]);

  useEffect(() => {
    if (!isPractitionerWorkspace || !selectedCaseId || typeof window === "undefined") return;
    window.localStorage.setItem(caseSelectionStorageKey, selectedCaseId);
  }, [caseSelectionStorageKey, isPractitionerWorkspace, selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId) {
      setCaseResponse(null);
      setJournalEntries([]);
      return;
    }
    void loadCase(selectedCaseId);
  }, [selectedCaseId]);

  const caseData = useMemo(
    () =>
      caseResponse
        ? ({
            ...(caseResponse.state as unknown as Partial<AppData> & Record<string, unknown>),
            familyName: caseResponse.caseRecord.familyName,
          } as Partial<AppData>)
        : null,
    [caseResponse?.caseRecord.familyName, caseResponse?.state],
  );

  const externalDocuments = useMemo<EnterpriseWorkspaceDocument[]>(
    () =>
      caseResponse
        ? caseResponse.documents.map((document) => ({
            id: document.id,
            fileName: document.fileName,
            url: getCaseDocumentUrl(caseResponse.caseRecord.id, document.id),
            uploadedBy: document.uploadedBy,
            createdAt: document.createdAt,
          }))
        : [],
    [caseResponse],
  );

  async function refreshCases(preferredCaseId?: string) {
    try {
      const response = await fetchOrganizationCases(session.organization.id);
      setCases(response.cases);
      setSelectedCaseId((current) => {
        const requested = preferredCaseId || current;
        if (requested && response.cases.some((caseRecord) => caseRecord.id === requested)) {
          return requested;
        }
        if (isPractitionerWorkspace && typeof window !== "undefined") {
          const storedCaseId = String(window.localStorage.getItem(caseSelectionStorageKey) || "").trim();
          if (storedCaseId && response.cases.some((caseRecord) => caseRecord.id === storedCaseId)) {
            return storedCaseId;
          }
          return "";
        }
        return response.cases[0]?.id || "";
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The case roster could not be refreshed.");
    }
  }

  async function loadCase(caseId: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [loadedCase, loadedJournal] = await Promise.all([fetchCase(caseId), fetchJournal(caseId)]);
      setCaseResponse(loadedCase);
      setJournalEntries(
        loadedJournal.entries.map((entry) => ({
          id: entry.id,
          author: entry.author,
          audience: entry.audience,
          message: entry.message,
          timestamp: entry.timestamp,
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The case could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSection(sectionName: string, nextData: AppData) {
    if (!selectedCaseId) {
      throw new Error("Choose a case before saving.");
    }

    setSavingCase(true);
    setError("");
    setNotice("");
    try {
      const nextState = appendChangeLog(nextData, `${sectionName} saved.`, session.user.displayName);
      const response = await patchCase(selectedCaseId, {
        familyName: nextData.familyName,
        state: nextState as unknown as Partial<CaseState>,
      });

      setCaseResponse((current) =>
        current
          ? {
              ...current,
              caseRecord: response.caseRecord,
              state: response.state as unknown as CaseState,
            }
          : current,
      );
      setCases((current) =>
        current.map((caseRecord) => (caseRecord.id === response.caseRecord.id ? response.caseRecord : caseRecord)),
      );
      setNotice(`${sectionName} saved to the live case record.`);
      return `${sectionName} saved to the live case record.`;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : `${sectionName} could not be saved.`;
      setError(message);
      throw new Error(message);
    } finally {
      setSavingCase(false);
    }
  }

  async function handlePostJournalEntry(payload: {
    author: string;
    audience: string;
    message: string;
    urgency: AppData["journalEntryUrgency"];
    notifyTarget: AppData["journalNotifyTarget"];
  }) {
    if (!selectedCaseId) {
      throw new Error("Choose a case before posting to the journal.");
    }

    try {
      const response = await createJournal(selectedCaseId, {
        audience: mapJournalAudience(payload.audience),
        message: payload.message,
      });
      setJournalEntries((current) => [
        {
          id: response.entry.id,
          author: response.entry.author,
          audience: response.entry.audience,
          message: response.entry.message,
          timestamp: response.entry.timestamp,
        },
        ...current,
      ]);
      setNotice("Journal entry posted to the live case record.");
      return "Journal entry posted to the live case record.";
    } catch (postError) {
      const message = postError instanceof Error ? postError.message : "The journal entry could not be posted.";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleUploadDocuments(files: File[]) {
    if (!selectedCaseId) {
      throw new Error("Choose a case before uploading documents.");
    }

    try {
      const uploaded = await Promise.all(files.map((file) => uploadCaseDocument(selectedCaseId, file)));
      setCaseResponse((current) =>
        current
          ? {
              ...current,
              documents: [...uploaded.map((item) => item.document), ...current.documents],
            }
          : current,
      );
      setNotice(`${uploaded.length} case document${uploaded.length === 1 ? "" : "s"} uploaded.`);
      return `${uploaded.length} case document${uploaded.length === 1 ? "" : "s"} uploaded.`;
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "The case documents could not be uploaded.";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleDeleteExternalDocument(documentId: string, fileName: string) {
    if (!selectedCaseId) {
      throw new Error("Choose a case before deleting documents.");
    }
    if (!window.confirm(`Delete "${fileName}" from this case record?`)) {
      return;
    }
    setDeletingDocumentId(documentId);
    setError("");
    setNotice("");
    try {
      await deleteCaseDocument(selectedCaseId, documentId);
      setCaseResponse((current) =>
        current
          ? {
              ...current,
              documents: current.documents.filter((document) => document.id !== documentId),
            }
          : current,
      );
      setNotice(`Deleted ${fileName} from the case record.`);
      return `Deleted ${fileName} from the case record.`;
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "The case document could not be deleted.";
      setError(message);
      throw new Error(message);
    } finally {
      setDeletingDocumentId("");
    }
  }

  if (!cases.length) {
    return (
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">
          {session.license.isLicensed ? "No case access yet" : "Case workspace unavailable"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {!session.license.isLicensed
            ? session.license.licenseGateMessage
            : session.permissions.isOrgAdmin
              ? "No accessible cases are available yet. Invite or activate a practitioner so they can create the first case, then add users to the case roster."
              : session.user.userType === "worker" || session.user.userType === "supervisor"
                ? "You do not currently have any visible cases. Use My account to create a private case or ask the organization admin to add you to an existing case roster."
                : "This organization does not currently have any accessible cases for your account. An organization admin needs to create a case and add you to the case roster before the live workspace can be used."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {session.permissions.isPlatformOwner || session.permissions.isOrgAdmin ? (
            <a href={dashboardPath} className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium">
              {session.license.isLicensed ? `Go to ${dashboardLabel}` : `Open ${dashboardLabel}`}
            </a>
          ) : session.user.userType === "worker" || session.user.userType === "supervisor" ? (
            <a href="/account" className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium">
              Open My account
            </a>
          ) : null}
          <a href="/privacy.html" target="_blank" rel="noreferrer" className="app-secondary-button rounded-2xl px-5 py-3 text-sm font-medium">
            Privacy
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-card rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Case workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Live safeguarding workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Choose the active case before working. All section saves are written directly to the selected case record.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_auto_auto]">
            <select
              className="input"
              value={selectedCaseId}
              onChange={(event) => setSelectedCaseId(event.target.value)}
              disabled={loading || savingCase}
            >
              {isPractitionerWorkspace ? (
                <option value="">Choose the case you are working on</option>
              ) : null}
              {cases.map((caseRecord) => (
                <option key={caseRecord.id} value={caseRecord.id}>
                  {caseRecord.familyName} • {caseRecord.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refreshCases(selectedCaseId)}
              className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
            >
              Refresh cases
            </button>
            <a
              href={dashboardPath}
              className="app-secondary-button rounded-2xl px-4 py-3 text-center text-sm font-medium"
            >
              Return to dashboard
            </a>
          </div>
        </div>
        {notice ? <div className="nm-inline-success mt-4">{notice}</div> : null}
        {error ? <div className="nm-inline-error mt-4">{error}</div> : null}
      </section>

      {!selectedCaseId ? (
        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Choose a case to enter the workspace</h3>
          <p className="mt-2 text-sm text-slate-600">
            Pick the family case you are currently working on. The workspace and all saves are tied to that case.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cases.map((caseRecord) => (
              <button
                type="button"
                key={caseRecord.id}
                onClick={() => setSelectedCaseId(caseRecord.id)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
              >
                <div className="text-base font-semibold text-slate-900">{caseRecord.familyName}</div>
                <div className="mt-1 text-sm text-slate-600">{caseRecord.status} • {new Date(caseRecord.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </section>
      ) : loading || !caseResponse || !caseData ? (
        <section className="app-card rounded-3xl border p-6 shadow-sm">
          <p className="text-sm text-slate-600">Loading case…</p>
        </section>
      ) : (
        <StandaloneApp
          mode="enterprise"
          initialData={caseData}
          initialTab={initialTab}
          canEdit={caseResponse.permissions.canEditCaseState}
          canPostJournal={caseResponse.permissions.canPostJournal}
          canUploadDocuments={caseResponse.permissions.canUploadDocuments}
          showSupportAndBilling={false}
          externalDocuments={externalDocuments}
          externalJournalEntries={journalEntries}
          onSaveSection={handleSaveSection}
          onPostJournalEntry={handlePostJournalEntry}
          onUploadDocuments={handleUploadDocuments}
          onDeleteExternalDocument={handleDeleteExternalDocument}
          deletingExternalDocumentId={deletingDocumentId}
        />
      )}
    </div>
  );
}
