import { useEffect, useMemo, useState } from "react";

type TabKey =
  | "case-status"
  | "timeline"
  | "network"
  | "planning"
  | "monitoring"
  | "closure";

type NetworkMember = {
  id: string;
  name: string;
  role: string;
  availability: string;
  reliability: number;
};

type TimelineEntry = {
  id: string;
  date: string;
  title: string;
  helper: string;
};

type RuleItem = {
  id: string;
  title: string;
  owner: string;
  backup: string;
  status: "On track" | "Needs review" | "At risk";
  note: string;
  checkMethod: string;
  breakdownPlan: string;
};

type MonitoringItem = {
  id: string;
  text: string;
  checked: boolean;
};

type DocumentItem = {
  id: string;
  name: string;
};

type AppData = {
  workspaceName: string;
  workspaceMode: string;
  currentPhaseLabel: string;
  postClosureContinuity: string;
  networkSelfManagementTools: string;

  caseStatus: string;
  familyName: string;
  leadPractitioner: string;
  caseStartDate: string;
  caregiverSummary: string;
  currentWatchpoint: string;
  planStability: number;
  immediateActionsText: string;

  riskStatement: string;
  safeguardingGoals: string;
  safeguardingScale: number;
  timelineEntries: TimelineEntry[];

  networkMembers: NetworkMember[];
  currentGapsText: string;
  nextNetworkStepsText: string;

  rules: RuleItem[];

  monitoringItems: MonitoringItem[];
  fireDrillScenario: string;
  fireDrillDate: string;
  fireDrillParticipants: string;
  fireDrillRecordNotes: string;

  closureStageText: string;
  sustainabilityText: string;
  ongoingPlanManagementText: string;
  whatIfScenarioText: string;
  ongoingRecordingText: string;
  recentEntry: string;
  postClosureToolsText: string;
  handoverDocs: DocumentItem[];
};

const STORAGE_KEY = "network-manager-app-data-v2";

const tabs: { key: TabKey; label: string }[] = [
  { key: "case-status", label: "Case Status" },
  { key: "timeline", label: "Timeline" },
  { key: "network", label: "Network Building" },
  { key: "planning", label: "Safeguarding Planning" },
  { key: "monitoring", label: "Monitoring & Testing" },
  { key: "closure", label: "Closure & Ongoing Safeguarding" },
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaultData: AppData = {
  workspaceName: "Miller Family Workspace",
  workspaceMode: "Shared family and network access",
  currentPhaseLabel: "CPS active",
  postClosureContinuity: "Enabled",
  networkSelfManagementTools: "Included",

  caseStatus: "Open",
  familyName: "Miller Family",
  leadPractitioner: "Practitioner Name",
  caseStartDate: "2026-03-30",
  caregiverSummary:
    "Anna, primary caregiver. Current priorities include evening structure, emotional support, and reliable backup coverage.",
  currentWatchpoint:
    "Evening routines become less reliable when caregiver stress rises.",
  planStability: 82,
  immediateActionsText:
    "Confirm backup for Thursday evening\nReview escalation wording with caregiver\nSchedule next fire drill",

  riskStatement:
    "Children may experience gaps in supervision when caregiver becomes overwhelmed in the evening.",
  safeguardingGoals:
    "Children are consistently supervised, emotionally settled, and supported by a reliable network that responds early when routines weaken.",
  safeguardingScale: 7,
  timelineEntries: [
    {
      id: makeId("timeline"),
      date: "2026-03-30",
      title: "Case opened and network companion file created",
      helper: "Risk statement and first safeguarding goals entered.",
    },
    {
      id: makeId("timeline"),
      date: "2026-04-01",
      title: "Initial network meeting",
      helper: "Roles drafted for evenings, school mornings, and backup response.",
    },
    {
      id: makeId("timeline"),
      date: "2026-04-04",
      title: "Formal review meeting",
      helper: "Assess whether escalation wording is understood by all members.",
    },
  ],

  networkMembers: [
    {
      id: makeId("member"),
      name: "Karen",
      role: "Primary evening support",
      availability: "Mon, Wed, Fri",
      reliability: 90,
    },
    {
      id: makeId("member"),
      name: "Mary",
      role: "Backup overnight support",
      availability: "Daily",
      reliability: 82,
    },
    {
      id: makeId("member"),
      name: "Lisa",
      role: "School and neighbourhood check-in",
      availability: "Weekdays",
      reliability: 88,
    },
    {
      id: makeId("member"),
      name: "Mrs. Patel",
      role: "School contact",
      availability: "School hours",
      reliability: 78,
    },
  ],
  currentGapsText:
    "Weekend backup is not strong enough yet\nEscalation language needs to be simple and consistent\nOne additional overnight support option is recommended",
  nextNetworkStepsText:
    "Confirm whether Norma can cover Saturday evenings\nAdd backup contact for school-day emergencies\nReview network confidence in escalation process",

  rules: [
    {
      id: makeId("rule"),
      title: "Children are supervised every evening",
      owner: "Karen",
      backup: "Mary",
      status: "On track",
      note: "Evening handoff confirmed by 7:30 p.m.",
      checkMethod: "Text and evening confirmation",
      breakdownPlan: "Escalate to backup chain",
    },
    {
      id: makeId("rule"),
      title: "Network is notified if caregiver becomes overwhelmed",
      owner: "Anna",
      backup: "Lisa",
      status: "Needs review",
      note: "Escalation language needs to be simplified.",
      checkMethod: "Direct call or text to primary supports",
      breakdownPlan: "Backup contact initiates rapid response",
    },
  ],

  monitoringItems: [
    { id: makeId("monitor"), text: "Roles are being carried out as agreed", checked: false },
    { id: makeId("monitor"), text: "Communication chain is working", checked: false },
    { id: makeId("monitor"), text: "Early warning signs are being noticed quickly", checked: false },
    { id: makeId("monitor"), text: "The child’s day-to-day well-being looks stable", checked: false },
    { id: makeId("monitor"), text: "Backups are clear when routines change", checked: false },
  ],
  fireDrillScenario:
    "Test late-evening loss of coverage and confirm whether the backup chain responds within 30 minutes.",
  fireDrillDate: "2026-04-10",
  fireDrillParticipants: "Anna, Karen, Mary, Lisa",
  fireDrillRecordNotes: "",

  closureStageText:
    "This stage refers only to formal closure with the CPS organization. It marks the end of statutory involvement, not the end of safeguarding work.",
  sustainabilityText:
    "After CPS closes, the network continues monthly reviews, refreshes roles, replaces lost capacity early, and keeps all core members clear about commitments.",
  ongoingPlanManagementText:
    "The app continues to support review, revision, and strengthening of the safeguarding plan after closure so the family and network can adapt the plan when circumstances change.",
  whatIfScenarioText:
    "Contact pathways, mitigation responses, and what-if scenarios remain live after closure so the network knows how to respond when routines weaken or new risks emerge.",
  ongoingRecordingText:
    "After closure, the app still allows journaling, recording of events, monitoring of commitments, and ongoing safeguarding activity so the network can maintain consistency over time.",
  recentEntry:
    "Caregiver reported a difficult evening on Friday but asked for help early, which allowed the network to stabilize routines before they broke down.",
  postClosureToolsText:
    "Ongoing journal and observation log\nShared communication and response pathways\nSustainability review prompts\nWhat-if and mitigation scenario guidance\nPlan editing and update support after closure\nOngoing monitoring of roles and commitments",
  handoverDocs: [
    { id: makeId("doc"), name: "CPS closure summary" },
    { id: makeId("doc"), name: "Final safeguarding plan at closure" },
    { id: makeId("doc"), name: "Network sustainability plan" },
    { id: makeId("doc"), name: "Communication and escalation pathway" },
  ],
};

function loadInitialData(): AppData {
  if (typeof window === "undefined") return defaultData;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...defaultData,
      ...parsed,
      timelineEntries: parsed.timelineEntries ?? defaultData.timelineEntries,
      networkMembers: parsed.networkMembers ?? defaultData.networkMembers,
      rules: parsed.rules ?? defaultData.rules,
      monitoringItems: parsed.monitoringItems ?? defaultData.monitoringItems,
      handoverDocs: parsed.handoverDocs ?? defaultData.handoverDocs,
    };
  } catch {
    return defaultData;
  }
}

function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      {(title || right) && (
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          {title ? <h2 className="text-xl font-semibold text-slate-900">{title}</h2> : <div />}
          {right}
        </div>
      )}
      <div className={title || right ? "px-6 pb-6" : "p-6"}>{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </label>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function SaveBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-xl border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function SectionActions({
  onSave,
  onReset,
}: {
  onSave: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSave}
        className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700"
      >
        Save this section
      </button>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Reset section
        </button>
      ) : null}
    </div>
  );
}

function splitLines(text: string) {
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("case-status");
  const [data, setData] = useState<AppData>(loadInitialData);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const continuityReadiness = useMemo(() => {
    const avg = Math.round(
      data.networkMembers.reduce((sum, n) => sum + Number(n.reliability || 0), 0) /
        Math.max(1, data.networkMembers.length)
    );
    return Math.max(0, Math.min(100, avg - 6));
  }, [data.networkMembers]);

  const saveSection = (sectionName: string) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setBanner(`${sectionName} saved on this device.`);
  };

  const updateField = <K extends keyof AppData>(key: K, value: AppData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  };

  const updateNetworkMember = (id: string, field: keyof NetworkMember, value: string | number) => {
    setData((current) => ({
      ...current,
      networkMembers: current.networkMembers.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addNetworkMember = () => {
    setData((current) => ({
      ...current,
      networkMembers: [
        ...current.networkMembers,
        {
          id: makeId("member"),
          name: "",
          role: "",
          availability: "",
          reliability: 75,
        },
      ],
    }));
  };

  const removeNetworkMember = (id: string) => {
    setData((current) => ({
      ...current,
      networkMembers: current.networkMembers.filter((item) => item.id !== id),
    }));
  };

  const updateTimelineEntry = (id: string, field: keyof TimelineEntry, value: string) => {
    setData((current) => ({
      ...current,
      timelineEntries: current.timelineEntries.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addTimelineEntry = () => {
    setData((current) => ({
      ...current,
      timelineEntries: [
        ...current.timelineEntries,
        { id: makeId("timeline"), date: "", title: "", helper: "" },
      ],
    }));
  };

  const removeTimelineEntry = (id: string) => {
    setData((current) => ({
      ...current,
      timelineEntries: current.timelineEntries.filter((item) => item.id !== id),
    }));
  };

  const updateRule = (id: string, field: keyof RuleItem, value: string) => {
    setData((current) => ({
      ...current,
      rules: current.rules.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const addRule = () => {
    setData((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          id: makeId("rule"),
          title: "",
          owner: "",
          backup: "",
          status: "On track",
          note: "",
          checkMethod: "",
          breakdownPlan: "",
        },
      ],
    }));
  };

  const removeRule = (id: string) => {
    setData((current) => ({
      ...current,
      rules: current.rules.filter((item) => item.id !== id),
    }));
  };

  const updateMonitoringItem = (id: string, field: keyof MonitoringItem, value: string | boolean) => {
    setData((current) => ({
      ...current,
      monitoringItems: current.monitoringItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addMonitoringItem = () => {
    setData((current) => ({
      ...current,
      monitoringItems: [...current.monitoringItems, { id: makeId("monitor"), text: "", checked: false }],
    }));
  };

  const removeMonitoringItem = (id: string) => {
    setData((current) => ({
      ...current,
      monitoringItems: current.monitoringItems.filter((item) => item.id !== id),
    }));
  };

  const updateDoc = (id: string, name: string) => {
    setData((current) => ({
      ...current,
      handoverDocs: current.handoverDocs.map((item) => (item.id === id ? { ...item, name } : item)),
    }));
  };

  const addDoc = () => {
    setData((current) => ({
      ...current,
      handoverDocs: [...current.handoverDocs, { id: makeId("doc"), name: "" }],
    }));
  };

  const removeDoc = (id: string) => {
    setData((current) => ({
      ...current,
      handoverDocs: current.handoverDocs.filter((item) => item.id !== id),
    }));
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-200 bg-teal-50">
                  <div className="text-2xl">🛡️</div>
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                    Network Manager
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    A working safeguarding, continuity, and self-management tool for one family,
                    their network, and supporting professionals.
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                Practitioner View
              </div>
            </div>
          </section>

          {banner ? <SaveBanner message={banner} onDismiss={() => setBanner("")} /> : null}

          <Card title="Family Safeguarding Workspace">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <SectionActions onSave={() => saveSection("Workspace")} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Current workspace">
                    <input
                      value={data.workspaceName}
                      onChange={(e) => updateField("workspaceName", e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Workspace mode">
                    <input
                      value={data.workspaceMode}
                      onChange={(e) => updateField("workspaceMode", e.target.value)}
                      className="input"
                    />
                  </Field>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">
                    This workspace is built for one family and its safeguarding network.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    It supports active CPS involvement, transition planning, and long-term family
                    and network use after formal closure.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Continuity status</p>
                <div className="mt-3 space-y-3">
                  <Field label="Current phase">
                    <input
                      value={data.currentPhaseLabel}
                      onChange={(e) => updateField("currentPhaseLabel", e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Post-closure continuity">
                    <input
                      value={data.postClosureContinuity}
                      onChange={(e) => updateField("postClosureContinuity", e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Network self-management tools">
                    <input
                      value={data.networkSelfManagementTools}
                      onChange={(e) => updateField("networkSelfManagementTools", e.target.value)}
                      className="input"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Card>

          <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="scrollbar-hide flex min-w-max gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab.key
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "case-status" && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Current Phase"
                  value={data.currentPhaseLabel}
                  helper="Built to continue after formal closure"
                />
                <Metric
                  label="Network Members"
                  value={String(data.networkMembers.length)}
                  helper="Shared access for caregivers and network members"
                />
                <Metric
                  label="Plan Reliability"
                  value={`${data.planStability}%`}
                  helper="Based on saved monitoring and continuity entries"
                />
                <Metric
                  label="Continuity Readiness"
                  value={`${continuityReadiness}%`}
                  helper="Measures readiness for long-term family ownership"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <Card title="Case Dashboard">
                  <div className="space-y-6">
                    <SectionActions onSave={() => saveSection("Case status")} />
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Case Information</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Basic case setup used across all safeguarding modules.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Case Name / Family Name">
                          <input
                            value={data.familyName}
                            onChange={(e) => updateField("familyName", e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Lead Practitioner">
                          <input
                            value={data.leadPractitioner}
                            onChange={(e) => updateField("leadPractitioner", e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Case Start Date">
                          <input
                            value={data.caseStartDate}
                            onChange={(e) => updateField("caseStartDate", e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Case Status">
                          <select
                            value={data.caseStatus}
                            onChange={(e) => updateField("caseStatus", e.target.value)}
                            className="input"
                          >
                            <option>Open</option>
                            <option>Preparing Handover</option>
                            <option>Closed to CPS, network active</option>
                          </select>
                        </Field>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            Caregivers Information
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Primary caregiver details and key support needs.
                          </p>
                        </div>
                        <Field label="Caregiver summary">
                          <textarea
                            value={data.caregiverSummary}
                            onChange={(e) => updateField("caregiverSummary", e.target.value)}
                            className="textarea"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Priority Snapshot">
                  <div className="space-y-5">
                    <Field label="Current watchpoint">
                      <textarea
                        value={data.currentWatchpoint}
                        onChange={(e) => updateField("currentWatchpoint", e.target.value)}
                        className="textarea"
                      />
                    </Field>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">Plan Stability</span>
                        <span className="font-semibold text-slate-900">{data.planStability}%</span>
                      </div>
                      <div className="mt-3 space-y-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={data.planStability}
                          onChange={(e) => updateField("planStability", Number(e.target.value))}
                          className="w-full"
                        />
                        <ProgressBar value={data.planStability} />
                      </div>
                    </div>

                    <Field label="Immediate actions" helper="Enter one action per line.">
                      <textarea
                        value={data.immediateActionsText}
                        onChange={(e) => updateField("immediateActionsText", e.target.value)}
                        className="textarea"
                      />
                    </Field>

                    <div className="space-y-3">
                      {splitLines(data.immediateActionsText).map((item) => (
                        <div
                          key={item}
                          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-6">
              <Card title="Timeline">
                <div className="space-y-6">
                  <SectionActions onSave={() => saveSection("Timeline")} />
                  <div className="grid gap-4">
                    <Field label="Risk Statement">
                      <textarea
                        value={data.riskStatement}
                        onChange={(e) => updateField("riskStatement", e.target.value)}
                        className="textarea"
                      />
                    </Field>

                    <Field label="Safeguarding Goals">
                      <textarea
                        value={data.safeguardingGoals}
                        onChange={(e) => updateField("safeguardingGoals", e.target.value)}
                        className="textarea"
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">Safeguarding Scale</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Current shared judgement of safeguarding strength and reliability.
                        </p>
                      </div>
                      <div className="text-2xl font-semibold text-slate-900">
                        {data.safeguardingScale}/10
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={data.safeguardingScale}
                        onChange={(e) => updateField("safeguardingScale", Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>0, Unsafe and unstable</span>
                        <span>10, Strong and sustainable safeguarding</span>
                      </div>
                      <ProgressBar value={data.safeguardingScale * 10} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                title="Timeline Pathway"
                right={
                  <button
                    type="button"
                    onClick={addTimelineEntry}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add timeline entry
                  </button>
                }
              >
                <div className="space-y-4">
                  {data.timelineEntries.map((item, index) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                          {index + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTimelineEntry(item.id)}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Date">
                          <input
                            value={item.date}
                            onChange={(e) => updateTimelineEntry(item.id, "date", e.target.value)}
                            className="input"
                          />
                        </Field>
                        <Field label="Entry title">
                          <input
                            value={item.title}
                            onChange={(e) => updateTimelineEntry(item.id, "title", e.target.value)}
                            className="input"
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Field label="Details">
                          <textarea
                            value={item.helper}
                            onChange={(e) => updateTimelineEntry(item.id, "helper", e.target.value)}
                            className="textarea"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "network" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card
                title="Network Members & Roles"
                right={
                  <button
                    type="button"
                    onClick={addNetworkMember}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add network member
                  </button>
                }
              >
                <div className="space-y-4">
                  <SectionActions onSave={() => saveSection("Network building")} />
                  {data.networkMembers.map((person) => (
                    <div key={person.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="font-medium text-slate-900">{person.name || "New network member"}</p>
                        <button
                          type="button"
                          onClick={() => removeNetworkMember(person.id)}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Name">
                          <input
                            value={person.name}
                            onChange={(e) => updateNetworkMember(person.id, "name", e.target.value)}
                            className="input"
                          />
                        </Field>
                        <Field label="Role">
                          <input
                            value={person.role}
                            onChange={(e) => updateNetworkMember(person.id, "role", e.target.value)}
                            className="input"
                          />
                        </Field>
                        <Field label="Availability">
                          <input
                            value={person.availability}
                            onChange={(e) =>
                              updateNetworkMember(person.id, "availability", e.target.value)
                            }
                            className="input"
                          />
                        </Field>
                        <Field label="Reliability">
                          <div className="space-y-3">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={person.reliability}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "reliability",
                                  Number(e.target.value)
                                )
                              }
                              className="w-full"
                            />
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">Score</span>
                              <span className="font-medium text-slate-900">
                                {person.reliability}%
                              </span>
                            </div>
                            <ProgressBar value={person.reliability} />
                          </div>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Network Gaps & Development">
                <div className="space-y-4">
                  <Field label="Current gaps" helper="Enter one gap per line.">
                    <textarea
                      value={data.currentGapsText}
                      onChange={(e) => updateField("currentGapsText", e.target.value)}
                      className="textarea"
                    />
                  </Field>

                  <Field label="Next network-building steps" helper="Enter one step per line.">
                    <textarea
                      value={data.nextNetworkStepsText}
                      onChange={(e) => updateField("nextNetworkStepsText", e.target.value)}
                      className="textarea"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">Current gaps preview</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {splitLines(data.currentGapsText).map((item) => (
                          <div key={item}>• {item}</div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">Next steps preview</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {splitLines(data.nextNetworkStepsText).map((item) => (
                          <div key={item}>• {item}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "planning" && (
            <Card
              title="Safeguarding Rules and Commitments"
              right={
                <button
                  type="button"
                  onClick={addRule}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add safeguarding rule
                </button>
              }
            >
              <div className="space-y-4">
                <SectionActions onSave={() => saveSection("Safeguarding planning")} />
                {data.rules.map((rule, index) => (
                  <div key={rule.id} className="rounded-2xl border border-slate-200 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                        Rule {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRule(rule.id)}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Rule title">
                        <input
                          value={rule.title}
                          onChange={(e) => updateRule(rule.id, "title", e.target.value)}
                          className="input"
                        />
                      </Field>
                      <Field label="Status">
                        <select
                          value={rule.status}
                          onChange={(e) => updateRule(rule.id, "status", e.target.value)}
                          className="input"
                        >
                          <option>On track</option>
                          <option>Needs review</option>
                          <option>At risk</option>
                        </select>
                      </Field>
                      <Field label="Primary owner">
                        <input
                          value={rule.owner}
                          onChange={(e) => updateRule(rule.id, "owner", e.target.value)}
                          className="input"
                        />
                      </Field>
                      <Field label="Backup">
                        <input
                          value={rule.backup}
                          onChange={(e) => updateRule(rule.id, "backup", e.target.value)}
                          className="input"
                        />
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <Field label="Notes">
                        <textarea
                          value={rule.note}
                          onChange={(e) => updateRule(rule.id, "note", e.target.value)}
                          className="textarea"
                        />
                      </Field>
                      <Field label="Check method">
                        <input
                          value={rule.checkMethod}
                          onChange={(e) => updateRule(rule.id, "checkMethod", e.target.value)}
                          className="input"
                        />
                      </Field>
                      <Field label="If it breaks down">
                        <input
                          value={rule.breakdownPlan}
                          onChange={(e) => updateRule(rule.id, "breakdownPlan", e.target.value)}
                          className="input"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "monitoring" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card
                title="Monitoring Checklist"
                right={
                  <button
                    type="button"
                    onClick={addMonitoringItem}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add checklist item
                  </button>
                }
              >
                <div className="space-y-3">
                  <SectionActions onSave={() => saveSection("Monitoring and testing")} />
                  {data.monitoringItems.map((item, index) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) =>
                            updateMonitoringItem(item.id, "checked", e.target.checked)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="text-xs font-medium text-slate-500">
                            Item {index + 1}
                          </div>
                          <input
                            value={item.text}
                            onChange={(e) =>
                              updateMonitoringItem(item.id, "text", e.target.value)
                            }
                            className="input"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMonitoringItem(item.id)}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Fire Drill & Testing">
                <div className="space-y-4">
                  <Field label="Next scenario">
                    <textarea
                      value={data.fireDrillScenario}
                      onChange={(e) => updateField("fireDrillScenario", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Scheduled date">
                      <input
                        value={data.fireDrillDate}
                        onChange={(e) => updateField("fireDrillDate", e.target.value)}
                        className="input"
                      />
                    </Field>
                    <Field label="Participants">
                      <input
                        value={data.fireDrillParticipants}
                        onChange={(e) => updateField("fireDrillParticipants", e.target.value)}
                        className="input"
                      />
                    </Field>
                  </div>
                  <Field label="Fire drill record notes">
                    <textarea
                      value={data.fireDrillRecordNotes}
                      onChange={(e) => updateField("fireDrillRecordNotes", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "closure" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card title="Closure Stage and Ongoing Safeguarding">
                <div className="space-y-4">
                  <SectionActions onSave={() => saveSection("Closure and ongoing safeguarding")} />
                  <Field label="CPS closure stage">
                    <textarea
                      value={data.closureStageText}
                      onChange={(e) => updateField("closureStageText", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                  <Field label="Network sustainability after closure">
                    <textarea
                      value={data.sustainabilityText}
                      onChange={(e) => updateField("sustainabilityText", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                  <Field label="Ongoing safeguarding plan management">
                    <textarea
                      value={data.ongoingPlanManagementText}
                      onChange={(e) =>
                        updateField("ongoingPlanManagementText", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>
                  <Field label="Communication, mitigation, and what-if scenarios">
                    <textarea
                      value={data.whatIfScenarioText}
                      onChange={(e) => updateField("whatIfScenarioText", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                  <Field label="Recording and ongoing safeguarding activity">
                    <textarea
                      value={data.ongoingRecordingText}
                      onChange={(e) => updateField("ongoingRecordingText", e.target.value)}
                      className="textarea"
                    />
                  </Field>
                </div>
              </Card>

              <Card
                title="Post-Closure Support Tools and Handover Pack"
                right={
                  <button
                    type="button"
                    onClick={addDoc}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add handover document
                  </button>
                }
              >
                <div className="space-y-4">
                  <Field label="Recent entry">
                    <textarea
                      value={data.recentEntry}
                      onChange={(e) => updateField("recentEntry", e.target.value)}
                      className="textarea"
                    />
                  </Field>

                  <Field label="Post-closure safeguarding tools" helper="Enter one item per line.">
                    <textarea
                      value={data.postClosureToolsText}
                      onChange={(e) => updateField("postClosureToolsText", e.target.value)}
                      className="textarea"
                    />
                  </Field>

                  <div className="grid gap-3">
                    {data.handoverDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <input
                          value={doc.name}
                          onChange={(e) => updateDoc(doc.id, e.target.value)}
                          className="input"
                        />
                        <button
                          type="button"
                          onClick={() => removeDoc(doc.id)}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
