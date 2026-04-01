
import { useEffect, useMemo, useRef, useState } from "react";

type TabKey =
  | "case-status"
  | "timeline"
  | "network"
  | "planning"
  | "monitoring"
  | "journal"
  | "closure";

type NetworkMember = {
  id: string;
  name: string;
  relationship: string;
  role: string;
  availability: string;
  phone: string;
  email: string;
  reliability: number;
  confirmed: boolean;
};

type NextNetworkStep = {
  id: string;
  text: string;
  completed: boolean;
};

type TimelineEntry = {
  id: string;
  date: string;
  title: string;
  helper: string;
};

type RuleStatus = "On track" | "Needs review" | "At risk" | "Completed";

type RuleItem = {
  id: string;
  title: string;
  owner: string;
  backup: string;
  status: RuleStatus;
  note: string;
  checkMethod: string;
  breakdownPlan: string;
  completedAt?: string;
};

type PlanAdaptationStatus = "Suggested" | "In review" | "Agreed" | "Implemented";

type PlanAdaptationItem = {
  id: string;
  recommendation: string;
  suggestedBy: string;
  responsible: string;
  status: PlanAdaptationStatus;
  notes: string;
  createdAt: string;
  updatedAt?: string;
};

type MonitoringItem = {
  id: string;
  text: string;
  checked: boolean;
};

type FireDrillStatus = "Pending" | "In progress" | "Completed";

type FireDrillItem = {
  id: string;
  scenario: string;
  date: string;
  participants: string;
  notes: string;
  status: FireDrillStatus;
  createdAt: string;
  completedAt?: string;
};

type DocumentItem = {
  id: string;
  name: string;
};

type AppointmentStatus = "Scheduled" | "Completed";

type AppointmentItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  status: AppointmentStatus;
  createdAt: string;
  completedAt?: string;
};

type ActionItemStatus = "Planned" | "In progress" | "Completed";

type ActionItem = {
  id: string;
  title: string;
  owner: string;
  status: ActionItemStatus;
  notes: string;
  createdAt: string;
  completedAt?: string;
};

type JournalUrgency = "Routine" | "Important" | "Urgent";
type JournalNotifyTarget = "Network and caregivers" | "Worker only" | "Everyone on file";

type JournalEntry = {
  id: string;
  author: string;
  audience: string;
  message: string;
  timestamp: string;
  urgency: JournalUrgency;
  notifyTarget: JournalNotifyTarget;
  alertsSentAt?: string;
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
  nextNetworkSteps: NextNetworkStep[];

  rules: RuleItem[];
  planAdaptations: PlanAdaptationItem[];

  monitoringItems: MonitoringItem[];
  fireDrills: FireDrillItem[];

  caseClosureStatus:
    | "CPS active"
    | "Closure planned"
    | "Closed to CPS"
    | "Urgent CPS review";
  closureAlertNote: string;
  closureAppointments: AppointmentItem[];
  closureActionItems: ActionItem[];
  closureDocuments: DocumentItem[];

  journalEntryAuthor: string;
  journalEntryAudience: string;
  journalEntryText: string;
  journalEntryUrgency: JournalUrgency;
  journalNotifyTarget: JournalNotifyTarget;
  journalEntries: JournalEntry[];
};

const STORAGE_KEY = "network-manager-app-data-v5";

const tabs: { key: TabKey; label: string }[] = [
  { key: "case-status", label: "Case Status" },
  { key: "timeline", label: "Timeline" },
  { key: "network", label: "Network Building" },
  { key: "planning", label: "Safeguarding Planning" },
  { key: "monitoring", label: "Monitoring & Testing" },
  { key: "journal", label: "Shared Journal" },
  { key: "closure", label: "Closure & Ongoing Safeguarding" },
];

const WORST_CASE_SCENARIOS = [
  "Caregivers do not follow the agreed safeguarding rules or stop following key parts of the plan.",
  "A critical network member leaves, withdraws, or can no longer fulfill their responsibilities.",
  "A child is hurt, harmed, or neglected, or there is credible concern that harm or neglect is occurring.",
  "The network can no longer maintain reliable day-to-day supervision or coverage for the children.",
  "The safeguarding plan breaks down repeatedly and the family or network cannot restore stability quickly.",
  "Substance use, violence, mental health crisis, or other escalating conditions make the children unsafe.",
  "Key information is being hidden, the network cannot get a clear picture of what is happening, or trust has broken down to the point that the plan cannot be relied on.",
  "Emergency services, school, medical staff, or other professionals raise serious safeguarding concerns that the network cannot safely manage alone.",
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function splitLines(text: string) {
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampScale(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value > 10) return Math.max(0, Math.min(10, Number((value / 10).toFixed(1))));
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
}

function getScaleTone(value: number) {
  const normalized = clampScale(value);
  if (normalized <= 4) {
    return {
      barClass: "bg-rose-500",
      textClass: "text-rose-700",
      badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
      label: "Needs attention",
      trackClass: "range-track-red",
    };
  }
  if (normalized <= 7) {
    return {
      barClass: "bg-amber-500",
      textClass: "text-amber-700",
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
      label: "Developing",
      trackClass: "range-track-amber",
    };
  }
  return {
    barClass: "bg-emerald-500",
    textClass: "text-emerald-700",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Strong",
    trackClass: "range-track-green",
  };
}

function getClosureStatusClasses(status: AppData["caseClosureStatus"]) {
  if (status === "Closed to CPS") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Closure planned") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Urgent CPS review") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function createNextNetworkStep(text: string, completed = false, id = makeId("network-step")): NextNetworkStep {
  return { id, text, completed };
}

function normalizeNextNetworkSteps(rawSteps: unknown, fallbackText: string) {
  if (Array.isArray(rawSteps) && rawSteps.length > 0) {
    return rawSteps
      .map((item) => {
        const next = item as Partial<NextNetworkStep>;
        return createNextNetworkStep(String(next.text || "").trim(), Boolean(next.completed), next.id || makeId("network-step"));
      })
      .filter((item) => item.text);
  }
  return splitLines(fallbackText).map((item) => createNextNetworkStep(item));
}

function serializeNextNetworkSteps(steps: NextNetworkStep[]) {
  return steps
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeNetworkMember(member: Partial<NetworkMember>): NetworkMember {
  return {
    id: member.id || makeId("member"),
    name: member.name || "",
    relationship: member.relationship || "",
    role: member.role || "",
    availability: member.availability || "",
    phone: member.phone || "",
    email: member.email || "",
    reliability: clampScale(Number(member.reliability ?? 0)),
    confirmed: Boolean(member.confirmed ?? (member.name && member.role)),
  };
}

function normalizeRule(rule: Partial<RuleItem>): RuleItem {
  return {
    id: rule.id || makeId("rule"),
    title: rule.title || "",
    owner: rule.owner || "",
    backup: rule.backup || "",
    status: (rule.status as RuleStatus) || "On track",
    note: rule.note || "",
    checkMethod: rule.checkMethod || "",
    breakdownPlan: rule.breakdownPlan || "",
    completedAt: rule.completedAt,
  };
}

function normalizePlanAdaptation(item: Partial<PlanAdaptationItem>): PlanAdaptationItem {
  return {
    id: item.id || makeId("adaptation"),
    recommendation: item.recommendation || "",
    suggestedBy: item.suggestedBy || "",
    responsible: item.responsible || "",
    status: (item.status as PlanAdaptationStatus) || "Suggested",
    notes: item.notes || "",
    createdAt: item.createdAt || nowStamp(),
    updatedAt: item.updatedAt,
  };
}

function normalizeAppointment(item: Partial<AppointmentItem>): AppointmentItem {
  return {
    id: item.id || makeId("appointment"),
    title: item.title || "",
    date: item.date || "",
    time: item.time || "",
    location: item.location || "",
    notes: item.notes || "",
    status: (item.status as AppointmentStatus) || "Scheduled",
    createdAt: item.createdAt || nowStamp(),
    completedAt: item.completedAt,
  };
}

function normalizeActionItem(item: Partial<ActionItem>): ActionItem {
  return {
    id: item.id || makeId("closure-action"),
    title: item.title || "",
    owner: item.owner || "",
    status: (item.status as ActionItemStatus) || "Planned",
    notes: item.notes || "",
    createdAt: item.createdAt || nowStamp(),
    completedAt: item.completedAt,
  };
}

function normalizeFireDrill(item: Partial<FireDrillItem>): FireDrillItem {
  return {
    id: item.id || makeId("fire-drill"),
    scenario: item.scenario || "",
    date: item.date || "",
    participants: item.participants || "",
    notes: item.notes || "",
    status: (item.status as FireDrillStatus) || "Pending",
    createdAt: item.createdAt || nowStamp(),
    completedAt: item.completedAt,
  };
}

function normalizeJournalEntry(item: Partial<JournalEntry>): JournalEntry {
  return {
    id: item.id || makeId("journal"),
    author: item.author || "",
    audience: item.audience || "All network members and caregivers",
    message: item.message || "",
    timestamp: item.timestamp || nowStamp(),
    urgency: (item.urgency as JournalUrgency) || "Routine",
    notifyTarget: (item.notifyTarget as JournalNotifyTarget) || "Network and caregivers",
    alertsSentAt: item.alertsSentAt,
  };
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
  currentWatchpoint: "Evening routines become less reliable when caregiver stress rises.",
  planStability: 8.2,
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
      relationship: "Anna’s sister",
      role: "Primary evening support",
      availability: "Mon, Wed, Fri",
      phone: "",
      email: "",
      reliability: 9,
      confirmed: true,
    },
    {
      id: makeId("member"),
      name: "Mary",
      relationship: "Anna’s mother",
      role: "Backup overnight support",
      availability: "Daily",
      phone: "",
      email: "",
      reliability: 8,
      confirmed: true,
    },
    {
      id: makeId("member"),
      name: "Lisa",
      relationship: "Neighbour",
      role: "School and neighbourhood check-in",
      availability: "Weekdays",
      phone: "",
      email: "",
      reliability: 9,
      confirmed: true,
    },
    {
      id: makeId("member"),
      name: "Mrs. Patel",
      relationship: "Teacher",
      role: "School contact",
      availability: "School hours",
      phone: "",
      email: "",
      reliability: 8,
      confirmed: true,
    },
  ],
  currentGapsText:
    "Weekend backup is not strong enough yet\nEscalation language needs to be simple and consistent\nOne additional overnight support option is recommended",
  nextNetworkStepsText:
    "Confirm whether Norma can cover Saturday evenings\nAdd backup contact for school-day emergencies\nReview network confidence in escalation process",
  nextNetworkSteps: [
    createNextNetworkStep("Confirm whether Norma can cover Saturday evenings"),
    createNextNetworkStep("Add backup contact for school-day emergencies"),
    createNextNetworkStep("Review network confidence in escalation process"),
  ],

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
  planAdaptations: [
    {
      id: makeId("adaptation"),
      recommendation: "Simplify escalation wording so every network member uses the same language.",
      suggestedBy: "Practitioner Name",
      responsible: "Karen",
      status: "In review",
      notes: "Review with caregiver and network at the next meeting.",
      createdAt: "2026-04-01 09:15",
    },
  ],

  monitoringItems: [
    { id: makeId("monitor"), text: "Roles are being carried out as agreed", checked: false },
    { id: makeId("monitor"), text: "Communication chain is working", checked: false },
    { id: makeId("monitor"), text: "Early warning signs are being noticed quickly", checked: false },
    { id: makeId("monitor"), text: "The child’s day-to-day well-being looks stable", checked: false },
    { id: makeId("monitor"), text: "Backups are clear when routines change", checked: false },
  ],
  fireDrills: [
    {
      id: makeId("fire-drill"),
      scenario: "Test late-evening loss of coverage and confirm whether the backup chain responds within 30 minutes.",
      date: "2026-04-10",
      participants: "Anna, Karen, Mary, Lisa",
      notes: "",
      status: "Pending",
      createdAt: "2026-04-01 09:30",
    },
  ],

  caseClosureStatus: "Closure planned",
  closureAlertNote:
    "Formal CPS closure is approaching. The network must confirm ongoing review dates, responsibilities, and escalation expectations before closure is completed.",
  closureAppointments: [
    {
      id: makeId("appointment"),
      title: "Monthly network review",
      date: "2026-04-18",
      time: "18:00",
      location: "Family home",
      notes: "",
      status: "Scheduled",
      createdAt: "2026-04-01 09:40",
    },
    {
      id: makeId("appointment"),
      title: "Plan review and adaptation",
      date: "2026-05-02",
      time: "17:30",
      location: "Community hub",
      notes: "",
      status: "Scheduled",
      createdAt: "2026-04-01 09:41",
    },
  ],
  closureActionItems: [
    {
      id: makeId("closure-action"),
      title: "Review current network capacity and commitments",
      owner: "Karen",
      status: "In progress",
      notes: "",
      createdAt: "2026-04-01 09:42",
    },
    {
      id: makeId("closure-action"),
      title: "Update responsibilities in the safeguarding plan after closure",
      owner: "Mary",
      status: "Planned",
      notes: "",
      createdAt: "2026-04-01 09:43",
    },
  ],
  closureDocuments: [
    { id: makeId("doc"), name: "CPS closure summary" },
    { id: makeId("doc"), name: "Final safeguarding plan at closure" },
    { id: makeId("doc"), name: "Network sustainability plan" },
    { id: makeId("doc"), name: "Communication and escalation pathway" },
  ],

  journalEntryAuthor: "",
  journalEntryAudience: "All network members and caregivers",
  journalEntryText: "",
  journalEntryUrgency: "Routine",
  journalNotifyTarget: "Network and caregivers",
  journalEntries: [
    {
      id: makeId("journal"),
      author: "Practitioner Name",
      audience: "All network members and caregivers",
      message:
        "Welcome to the shared journal. Use this space to record developments, questions, updates, and communication between caregivers and network members.",
      timestamp: "2026-03-31 09:20",
      urgency: "Routine",
      notifyTarget: "Network and caregivers",
      alertsSentAt: "2026-03-31 09:20",
    },
  ],
};

function loadInitialData(): AppData {
  if (typeof window === "undefined") return defaultData;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData> & Record<string, unknown>;
    const nextNetworkSteps = normalizeNextNetworkSteps(
      parsed.nextNetworkSteps,
      String(parsed.nextNetworkStepsText ?? defaultData.nextNetworkStepsText),
    );
    const legacyFireDrills = parsed.fireDrills as Partial<FireDrillItem>[] | undefined;
    const fallbackFireDrills =
      legacyFireDrills && legacyFireDrills.length
        ? legacyFireDrills.map((item) => normalizeFireDrill(item))
        : [
            normalizeFireDrill({
              scenario: String(parsed.fireDrillScenario ?? defaultData.fireDrills[0].scenario),
              date: String(parsed.fireDrillDate ?? defaultData.fireDrills[0].date),
              participants: String(parsed.fireDrillParticipants ?? defaultData.fireDrills[0].participants),
              notes: String(parsed.fireDrillRecordNotes ?? ""),
              status: "Pending",
            }),
          ];

    return {
      ...defaultData,
      ...parsed,
      planStability: clampScale(Number(parsed.planStability ?? defaultData.planStability)),
      safeguardingScale: clampScale(Number(parsed.safeguardingScale ?? defaultData.safeguardingScale)),
      timelineEntries: (parsed.timelineEntries as TimelineEntry[]) ?? defaultData.timelineEntries,
      networkMembers: ((parsed.networkMembers as Partial<NetworkMember>[]) ?? defaultData.networkMembers).map(normalizeNetworkMember),
      nextNetworkStepsText:
        parsed.nextNetworkStepsText && String(parsed.nextNetworkStepsText).trim()
          ? String(parsed.nextNetworkStepsText)
          : serializeNextNetworkSteps(nextNetworkSteps),
      nextNetworkSteps,
      rules: ((parsed.rules as Partial<RuleItem>[]) ?? defaultData.rules).map(normalizeRule),
      planAdaptations: ((parsed.planAdaptations as Partial<PlanAdaptationItem>[]) ?? defaultData.planAdaptations).map(normalizePlanAdaptation),
      monitoringItems: (parsed.monitoringItems as MonitoringItem[]) ?? defaultData.monitoringItems,
      fireDrills: fallbackFireDrills,
      closureAppointments: ((parsed.closureAppointments as Partial<AppointmentItem>[]) ?? defaultData.closureAppointments).map(normalizeAppointment),
      closureActionItems: ((parsed.closureActionItems as Partial<ActionItem>[]) ?? defaultData.closureActionItems).map(normalizeActionItem),
      closureDocuments:
        ((parsed.closureDocuments as DocumentItem[]) ??
          ((parsed.handoverDocs as DocumentItem[]) || defaultData.closureDocuments)),
      journalEntries: ((parsed.journalEntries as Partial<JournalEntry>[]) ?? defaultData.journalEntries).map(normalizeJournalEntry),
      journalEntryUrgency: (parsed.journalEntryUrgency as JournalUrgency) || defaultData.journalEntryUrgency,
      journalNotifyTarget: (parsed.journalNotifyTarget as JournalNotifyTarget) || defaultData.journalNotifyTarget,
    };
  } catch {
    return defaultData;
  }
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
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </label>
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

function SaveBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
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
  saveLabel = "Save this section",
}: {
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSave}
        className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700"
      >
        {saveLabel}
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

function ProgressBar({ value }: { value: number }) {
  const clamped = clampScale(value);
  const tone = getScaleTone(clamped);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm font-semibold ${tone.textClass}`}>{clamped}/10</span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.badgeClass}`}>{tone.label}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${tone.barClass}`} style={{ width: `${clamped * 10}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

export default function StandaloneApp() {
  const [activeTab, setActiveTab] = useState<TabKey>("case-status");
  const [data, setData] = useState<AppData>(loadInitialData);
  const [banner, setBanner] = useState("");
  const closureDocumentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const confirmedNetworkMembers = useMemo(
    () => data.networkMembers.filter((member) => member.confirmed && member.name.trim()),
    [data.networkMembers],
  );

  const continuityReadiness = useMemo(() => {
    const source = confirmedNetworkMembers.length ? confirmedNetworkMembers : data.networkMembers;
    const avg = source.reduce((sum, member) => sum + Number(member.reliability || 0), 0) / Math.max(1, source.length);
    return clampScale(avg);
  }, [confirmedNetworkMembers, data.networkMembers]);

  const activeRules = useMemo(() => data.rules.filter((rule) => rule.status !== "Completed"), [data.rules]);
  const finalizedRules = useMemo(() => data.rules.filter((rule) => rule.status === "Completed"), [data.rules]);
  const openAppointments = useMemo(
    () => data.closureAppointments.filter((item) => item.status !== "Completed"),
    [data.closureAppointments],
  );
  const archivedAppointments = useMemo(
    () => data.closureAppointments.filter((item) => item.status === "Completed"),
    [data.closureAppointments],
  );
  const activeActionItems = useMemo(
    () => data.closureActionItems.filter((item) => item.status !== "Completed"),
    [data.closureActionItems],
  );
  const archivedActionItems = useMemo(
    () => data.closureActionItems.filter((item) => item.status === "Completed"),
    [data.closureActionItems],
  );
  const activeFireDrills = useMemo(
    () => data.fireDrills.filter((item) => item.status !== "Completed"),
    [data.fireDrills],
  );
  const archivedFireDrills = useMemo(
    () => data.fireDrills.filter((item) => item.status === "Completed"),
    [data.fireDrills],
  );

  const saveSection = (name: string) => setBanner(`${name} saved on this device.`);

  const updateField = <K extends keyof AppData>(key: K, value: AppData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  };

  const updateNetworkMember = (id: string, field: keyof NetworkMember, value: string | number | boolean) => {
    setData((current) => ({
      ...current,
      networkMembers: current.networkMembers.map((item) =>
        item.id === id ? { ...item, [field]: field === "reliability" ? clampScale(Number(value)) : value } : item,
      ),
    }));
  };

  const addNetworkMember = () => {
    setData((current) => ({
      ...current,
      networkMembers: [...current.networkMembers, normalizeNetworkMember({ reliability: 5 })],
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
      timelineEntries: current.timelineEntries.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const addTimelineEntry = () => {
    setData((current) => ({
      ...current,
      timelineEntries: [...current.timelineEntries, { id: makeId("timeline"), date: "", title: "", helper: "" }],
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
      rules: current.rules.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              completedAt:
                field === "status" && value === "Completed"
                  ? item.completedAt || nowStamp()
                  : field === "status" && value !== "Completed"
                    ? undefined
                    : item.completedAt,
            }
          : item,
      ),
    }));
  };

  const addRule = () => {
    setData((current) => ({
      ...current,
      rules: [...current.rules, normalizeRule({ status: "On track" })],
    }));
  };

  const removeRule = (id: string) => {
    setData((current) => ({ ...current, rules: current.rules.filter((item) => item.id !== id) }));
  };

  const updatePlanAdaptation = (id: string, field: keyof PlanAdaptationItem, value: string) => {
    setData((current) => ({
      ...current,
      planAdaptations: current.planAdaptations.map((item) =>
        item.id === id ? { ...item, [field]: value, updatedAt: nowStamp() } : item,
      ),
    }));
  };

  const addPlanAdaptation = () => {
    setData((current) => ({
      ...current,
      planAdaptations: [...current.planAdaptations, normalizePlanAdaptation({ status: "Suggested" })],
    }));
  };

  const removePlanAdaptation = (id: string) => {
    setData((current) => ({
      ...current,
      planAdaptations: current.planAdaptations.filter((item) => item.id !== id),
    }));
  };

  const updateMonitoringItem = (id: string, field: keyof MonitoringItem, value: string | boolean) => {
    setData((current) => ({
      ...current,
      monitoringItems: current.monitoringItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
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

  const updateFireDrill = (id: string, field: keyof FireDrillItem, value: string) => {
    setData((current) => ({
      ...current,
      fireDrills: current.fireDrills.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              completedAt:
                field === "status" && value === "Completed"
                  ? item.completedAt || nowStamp()
                  : field === "status" && value !== "Completed"
                    ? undefined
                    : item.completedAt,
            }
          : item,
      ),
    }));
  };

  const addFireDrill = () => {
    setData((current) => ({
      ...current,
      fireDrills: [...current.fireDrills, normalizeFireDrill({ status: "Pending" })],
    }));
  };

  const removeFireDrill = (id: string) => {
    setData((current) => ({
      ...current,
      fireDrills: current.fireDrills.filter((item) => item.id !== id),
    }));
  };

  const updateClosureDocument = (id: string, name: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.map((item) => (item.id === id ? { ...item, name } : item)),
    }));
  };

  const addClosureDocument = () => {
    setData((current) => ({
      ...current,
      closureDocuments: [...current.closureDocuments, { id: makeId("doc"), name: "" }],
    }));
  };

  const addClosureDocumentsFromFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setData((current) => ({
      ...current,
      closureDocuments: [
        ...current.closureDocuments,
        ...Array.from(files).map((file) => ({ id: makeId("doc"), name: file.name })),
      ],
    }));
  };

  const removeClosureDocument = (id: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.filter((item) => item.id !== id),
    }));
  };

  const updateClosureAppointment = (id: string, field: keyof AppointmentItem, value: string) => {
    setData((current) => ({
      ...current,
      closureAppointments: current.closureAppointments.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              completedAt:
                field === "status" && value === "Completed"
                  ? item.completedAt || nowStamp()
                  : field === "status" && value !== "Completed"
                    ? undefined
                    : item.completedAt,
            }
          : item,
      ),
    }));
  };

  const addClosureAppointment = () => {
    setData((current) => ({
      ...current,
      closureAppointments: [...current.closureAppointments, normalizeAppointment({ status: "Scheduled" })],
    }));
  };

  const removeClosureAppointment = (id: string) => {
    setData((current) => ({
      ...current,
      closureAppointments: current.closureAppointments.filter((item) => item.id !== id),
    }));
  };

  const updateClosureActionItem = (id: string, field: keyof ActionItem, value: string) => {
    setData((current) => ({
      ...current,
      closureActionItems: current.closureActionItems.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              completedAt:
                field === "status" && value === "Completed"
                  ? item.completedAt || nowStamp()
                  : field === "status" && value !== "Completed"
                    ? undefined
                    : item.completedAt,
            }
          : item,
      ),
    }));
  };

  const addClosureActionItem = () => {
    setData((current) => ({
      ...current,
      closureActionItems: [...current.closureActionItems, normalizeActionItem({ status: "Planned" })],
    }));
  };

  const removeClosureActionItem = (id: string) => {
    setData((current) => ({
      ...current,
      closureActionItems: current.closureActionItems.filter((item) => item.id !== id),
    }));
  };

  const addJournalEntry = () => {
    const author = data.journalEntryAuthor.trim() || "Unknown author";
    const message = data.journalEntryText.trim();
    const audience = data.journalEntryAudience.trim() || "All network members and caregivers";
    if (!message) {
      setBanner("Enter a journal note before posting it.");
      return;
    }
    const timestamp = nowStamp();
    const notifyTarget =
      data.caseClosureStatus === "Closed to CPS" && data.journalNotifyTarget === "Worker only"
        ? "Network and caregivers"
        : data.journalNotifyTarget;
    const alertRecipientLabel =
      notifyTarget === "Worker only"
        ? "the worker while the case remains open"
        : notifyTarget === "Everyone on file"
          ? "all registered network members, caregivers, and the worker if the case is still open"
          : "all registered network members and caregivers";
    setData((current) => ({
      ...current,
      journalEntryText: "",
      journalEntries: [
        normalizeJournalEntry({
          author,
          audience,
          message,
          timestamp,
          urgency: data.journalEntryUrgency,
          notifyTarget,
          alertsSentAt: timestamp,
        }),
        ...current.journalEntries,
      ],
    }));
    setBanner(`Journal entry posted. Alert notice recorded for ${alertRecipientLabel}.`);
  };

  const removeJournalEntry = (id: string) => {
    setData((current) => ({
      ...current,
      journalEntries: current.journalEntries.filter((item) => item.id !== id),
    }));
  };

  const resetJournalSection = () => {
    setData((current) => ({
      ...current,
      journalEntryAuthor: "",
      journalEntryAudience: defaultData.journalEntryAudience,
      journalEntryText: "",
      journalEntryUrgency: "Routine",
      journalNotifyTarget: defaultData.journalNotifyTarget,
    }));
    setBanner("Journal entry form reset.");
  };

  const deleteClosureSection = () => {
    setData((current) => ({
      ...current,
      caseClosureStatus: defaultData.caseClosureStatus,
      closureAlertNote: defaultData.closureAlertNote,
      closureAppointments: defaultData.closureAppointments,
      closureActionItems: defaultData.closureActionItems,
      closureDocuments: defaultData.closureDocuments,
      planAdaptations: defaultData.planAdaptations,
    }));
    setBanner("Closure and ongoing safeguarding section reset.");
  };

  const planStabilityTone = getScaleTone(data.planStability);
  const safeguardingTone = getScaleTone(data.safeguardingScale);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-200 bg-teal-50 p-2">
                  <img src="/sgt-logo.png" alt="SgT logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Network Manager</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    A working safeguarding, continuity, and self-management tool for one family, their network, and supporting professionals.
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                Practitioner View
              </div>
            </div>
          </section>

          {banner ? <SaveBanner message={banner} onDismiss={() => setBanner("")} /> : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="scrollbar-hide flex min-w-max gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "case-status" && (
            <div className="space-y-6">
              <Card title="Family Safeguarding Workspace">
                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <SectionActions onSave={() => saveSection("Workspace")} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Current workspace">
                        <input value={data.workspaceName} onChange={(e) => updateField("workspaceName", e.target.value)} className="input" />
                      </Field>
                      <Field label="Workspace mode">
                        <input value={data.workspaceMode} onChange={(e) => updateField("workspaceMode", e.target.value)} className="input" />
                      </Field>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">Continuity status</p>
                    <div className="mt-3 space-y-3">
                      <Field label="Current phase">
                        <input value={data.currentPhaseLabel} onChange={(e) => updateField("currentPhaseLabel", e.target.value)} className="input" />
                      </Field>
                      <Field label="Post-closure continuity">
                        <input value={data.postClosureContinuity} onChange={(e) => updateField("postClosureContinuity", e.target.value)} className="input" />
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

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Current Phase" value={data.currentPhaseLabel} helper="Built to continue after formal closure" />
                <Metric label="Confirmed Network Members" value={String(confirmedNetworkMembers.length)} helper="Auto-populated from the Network Building tab" />
                <Metric label="Plan Stability" value={`${data.planStability}/10`} helper={planStabilityTone.label} />
                <Metric label="Continuity Readiness" value={`${continuityReadiness}/10`} helper="Average willingness, ability, and confidence across confirmed members" />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card title="Case Overview">
                  <div className="space-y-4">
                    <SectionActions onSave={() => saveSection("Case status")} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Case status">
                        <input value={data.caseStatus} onChange={(e) => updateField("caseStatus", e.target.value)} className="input" />
                      </Field>
                      <Field label="Family name">
                        <input value={data.familyName} onChange={(e) => updateField("familyName", e.target.value)} className="input" />
                      </Field>
                      <Field label="Lead practitioner">
                        <input value={data.leadPractitioner} onChange={(e) => updateField("leadPractitioner", e.target.value)} className="input" />
                      </Field>
                      <Field label="Case start date">
                        <input value={data.caseStartDate} onChange={(e) => updateField("caseStartDate", e.target.value)} className="input" />
                      </Field>
                    </div>
                    <Field label="Caregiver summary">
                      <textarea value={data.caregiverSummary} onChange={(e) => updateField("caregiverSummary", e.target.value)} className="textarea" />
                    </Field>
                    <Field label="Current watchpoint">
                      <textarea value={data.currentWatchpoint} onChange={(e) => updateField("currentWatchpoint", e.target.value)} className="textarea" />
                    </Field>
                    <Field label="Immediate actions">
                      <textarea value={data.immediateActionsText} onChange={(e) => updateField("immediateActionsText", e.target.value)} className="textarea" />
                    </Field>
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card title="Plan Stability">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-600">Current judgement of how stable and dependable the plan is right now.</p>
                        </div>
                        <StatusBadge className={planStabilityTone.badgeClass}>{planStabilityTone.label}</StatusBadge>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={data.planStability}
                        onChange={(e) => updateField("planStability", clampScale(Number(e.target.value)))}
                        className={`range-input w-full ${planStabilityTone.trackClass}`}
                      />
                      <div className="range-scale-labels">
                        <span className="range-scale-label">0, Unstable</span>
                        <span className="range-scale-label">10, Strong and dependable</span>
                      </div>
                      <ProgressBar value={data.planStability} />
                    </div>
                  </Card>

                  <Card title="Confirmed Network Members">
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600">
                        This section updates automatically from confirmed entries in the Network Building tab.
                      </p>
                      {confirmedNetworkMembers.length ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {confirmedNetworkMembers.map((member) => (
                            <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div>
                                <p className="text-base font-semibold text-slate-900">{member.name}</p>
                                <p className="text-sm text-slate-600">{member.relationship || "Relationship not entered"}</p>
                              </div>
                              <div className="mt-3 space-y-1 text-sm text-slate-700">
                                <p><span className="font-medium text-slate-900">Role:</span> {member.role || "Not entered"}</p>
                                <p><span className="font-medium text-slate-900">Availability:</span> {member.availability || "Not entered"}</p>
                                <p><span className="font-medium text-slate-900">Phone:</span> {member.phone || "Not entered"}</p>
                                <p><span className="font-medium text-slate-900">Email:</span> {member.email || "Not entered"}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          No confirmed network members yet.
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
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
                      <textarea value={data.riskStatement} onChange={(e) => updateField("riskStatement", e.target.value)} className="textarea" />
                    </Field>
                    <Field label="Safeguarding Goals">
                      <textarea value={data.safeguardingGoals} onChange={(e) => updateField("safeguardingGoals", e.target.value)} className="textarea" />
                    </Field>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">Safeguarding Scale</p>
                        <p className="mt-1 text-sm text-slate-500">Current shared judgement of safeguarding strength and reliability.</p>
                      </div>
                      <StatusBadge className={safeguardingTone.badgeClass}>{data.safeguardingScale}/10</StatusBadge>
                    </div>
                    <div className="mt-4 space-y-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={data.safeguardingScale}
                        onChange={(e) => updateField("safeguardingScale", clampScale(Number(e.target.value)))}
                        className={`range-input w-full ${safeguardingTone.trackClass}`}
                      />
                      <div className="range-scale-labels">
                        <span className="range-scale-label">0, Unsafe and unstable</span>
                        <span className="range-scale-label">10, Strong and sustainable safeguarding</span>
                      </div>
                      <ProgressBar value={data.safeguardingScale} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                title="Timeline Pathway"
                right={
                  <button type="button" onClick={addTimelineEntry} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
                          <input value={item.date} onChange={(e) => updateTimelineEntry(item.id, "date", e.target.value)} className="input" />
                        </Field>
                        <Field label="Entry title">
                          <input value={item.title} onChange={(e) => updateTimelineEntry(item.id, "title", e.target.value)} className="input" />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Field label="Details">
                          <textarea value={item.helper} onChange={(e) => updateTimelineEntry(item.id, "helper", e.target.value)} className="textarea" />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "network" && (
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card
                title="Network Members & Roles"
                right={
                  <button type="button" onClick={addNetworkMember} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Add network member
                  </button>
                }
              >
                <div className="space-y-4">
                  <SectionActions onSave={() => saveSection("Network building")} />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Confirmed network members automatically appear on the main Case Status page with their contact details.
                  </div>
                  {data.networkMembers.map((person) => {
                    const personTone = getScaleTone(person.reliability);
                    return (
                      <div key={person.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{person.name || "New network member"}</p>
                            <p className="text-sm text-slate-500">{person.role || "Role not entered yet"}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={person.confirmed}
                                onChange={(e) => updateNetworkMember(person.id, "confirmed", e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Confirmed member
                            </label>
                            <button
                              type="button"
                              onClick={() => removeNetworkMember(person.id)}
                              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Name">
                            <input value={person.name} onChange={(e) => updateNetworkMember(person.id, "name", e.target.value)} className="input" />
                          </Field>
                          <Field label="Relationship">
                            <input value={person.relationship} onChange={(e) => updateNetworkMember(person.id, "relationship", e.target.value)} className="input" />
                          </Field>
                          <Field label="Role">
                            <input value={person.role} onChange={(e) => updateNetworkMember(person.id, "role", e.target.value)} className="input" />
                          </Field>
                          <Field label="Availability">
                            <input value={person.availability} onChange={(e) => updateNetworkMember(person.id, "availability", e.target.value)} className="input" />
                          </Field>
                          <Field label="Phone">
                            <input value={person.phone} onChange={(e) => updateNetworkMember(person.id, "phone", e.target.value)} className="input" />
                          </Field>
                          <Field label="Email">
                            <input value={person.email} onChange={(e) => updateNetworkMember(person.id, "email", e.target.value)} className="input" />
                          </Field>
                        </div>
                        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">Willingness / Ability / Confidence</p>
                              <p className="text-sm text-slate-500">Rate each confirmed member from 0 to 10.</p>
                            </div>
                            <StatusBadge className={personTone.badgeClass}>{person.reliability}/10</StatusBadge>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.1"
                            value={person.reliability}
                            onChange={(e) => updateNetworkMember(person.id, "reliability", Number(e.target.value))}
                            className={`range-input w-full ${personTone.trackClass}`}
                          />
                          <div className="range-scale-labels">
                            <span className="range-scale-label">0, Not ready or able</span>
                            <span className="range-scale-label">10, Highly ready and dependable</span>
                          </div>
                          <ProgressBar value={person.reliability} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Current Gaps & Next Network Steps">
                <div className="space-y-6">
                  <Field label="Current gaps">
                    <textarea value={data.currentGapsText} onChange={(e) => updateField("currentGapsText", e.target.value)} className="textarea" />
                  </Field>
                  <Field label="Next network steps">
                    <textarea
                      value={data.nextNetworkStepsText}
                      onChange={(e) => {
                        const nextText = e.target.value;
                        updateField("nextNetworkStepsText", nextText);
                        updateField("nextNetworkSteps", normalizeNextNetworkSteps(undefined, nextText));
                      }}
                      className="textarea"
                    />
                  </Field>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-900">Track progress on next steps</p>
                    <div className="mt-3 space-y-3">
                      {data.nextNetworkSteps.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                          Add next steps above to track them here.
                        </div>
                      ) : (
                        data.nextNetworkSteps.map((item) => (
                          <label key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() =>
                                updateField(
                                  "nextNetworkSteps",
                                  data.nextNetworkSteps.map((step) =>
                                    step.id === item.id ? { ...step, completed: !step.completed } : step,
                                  ),
                                )
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className={item.completed ? "line-through opacity-80" : ""}>{item.text}</div>
                              <div className={`mt-1 text-xs font-medium uppercase tracking-[0.12em] ${item.completed ? "text-emerald-700" : "text-rose-700"}`}>
                                {item.completed ? "Completed" : "Pending"}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "planning" && (
            <div className="space-y-6">
              <Card
                title="Safeguarding Rules and Commitments"
                right={
                  <button type="button" onClick={addRule} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Add safeguarding rule
                  </button>
                }
              >
                <div className="space-y-4">
                  <SectionActions onSave={() => saveSection("Safeguarding planning")} />
                  {activeRules.map((rule, index) => (
                    <div key={rule.id} className="rounded-2xl border border-slate-200 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Rule {index + 1}</span>
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
                          <input value={rule.title} onChange={(e) => updateRule(rule.id, "title", e.target.value)} className="input" />
                        </Field>
                        <Field label="Status">
                          <select value={rule.status} onChange={(e) => updateRule(rule.id, "status", e.target.value)} className="input">
                            <option>On track</option>
                            <option>Needs review</option>
                            <option>At risk</option>
                            <option>Completed</option>
                          </select>
                        </Field>
                        <Field label="Primary owner">
                          <input value={rule.owner} onChange={(e) => updateRule(rule.id, "owner", e.target.value)} className="input" />
                        </Field>
                        <Field label="Backup">
                          <input value={rule.backup} onChange={(e) => updateRule(rule.id, "backup", e.target.value)} className="input" />
                        </Field>
                      </div>
                      <div className="mt-4 grid gap-4">
                        <Field label="Notes">
                          <textarea value={rule.note} onChange={(e) => updateRule(rule.id, "note", e.target.value)} className="textarea" />
                        </Field>
                        <Field label="Check method">
                          <input value={rule.checkMethod} onChange={(e) => updateRule(rule.id, "checkMethod", e.target.value)} className="input" />
                        </Field>
                        <Field label="If it breaks down">
                          <input value={rule.breakdownPlan} onChange={(e) => updateRule(rule.id, "breakdownPlan", e.target.value)} className="input" />
                        </Field>
                      </div>
                    </div>
                  ))}
                  {!activeRules.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      No active safeguarding rules. Add a new rule above or review finalized rules below.
                    </div>
                  ) : null}
                </div>
              </Card>

              <Card title="Safeguarding Plan Finalized Rules">
                <div className="space-y-4">
                  {finalizedRules.length ? (
                    finalizedRules.map((rule) => (
                      <div key={rule.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-semibold text-emerald-900">{rule.title || "Completed safeguarding rule"}</p>
                            <p className="text-sm text-emerald-800">Owner: {rule.owner || "Not entered"}{rule.backup ? `, backup: ${rule.backup}` : ""}</p>
                          </div>
                          <StatusBadge className="border border-emerald-200 bg-white text-emerald-700">
                            Completed{rule.completedAt ? ` • ${rule.completedAt}` : ""}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-emerald-900">
                          {rule.note ? <p><span className="font-medium">Notes:</span> {rule.note}</p> : null}
                          {rule.checkMethod ? <p><span className="font-medium">Check method:</span> {rule.checkMethod}</p> : null}
                          {rule.breakdownPlan ? <p><span className="font-medium">Breakdown plan:</span> {rule.breakdownPlan}</p> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Completed safeguarding rules will move here automatically.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "monitoring" && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card
                  title="Monitoring Checklist"
                  right={
                    <button type="button" onClick={addMonitoringItem} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
                            onChange={(e) => updateMonitoringItem(item.id, "checked", e.target.checked)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="text-xs font-medium text-slate-500">Item {index + 1}</div>
                            <input value={item.text} onChange={(e) => updateMonitoringItem(item.id, "text", e.target.value)} className="input" />
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

                <Card
                  title="Fire Drill & Testing"
                  right={
                    <button type="button" onClick={addFireDrill} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Add fire drill
                    </button>
                  }
                >
                  <div className="space-y-4">
                    {activeFireDrills.map((item, index) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Fire drill {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeFireDrill(item.id)}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Scenario">
                            <textarea value={item.scenario} onChange={(e) => updateFireDrill(item.id, "scenario", e.target.value)} className="textarea" />
                          </Field>
                          <Field label="Participants">
                            <textarea value={item.participants} onChange={(e) => updateFireDrill(item.id, "participants", e.target.value)} className="textarea" />
                          </Field>
                          <Field label="Scheduled date">
                            <input value={item.date} onChange={(e) => updateFireDrill(item.id, "date", e.target.value)} className="input" />
                          </Field>
                          <Field label="Progress">
                            <select value={item.status} onChange={(e) => updateFireDrill(item.id, "status", e.target.value)} className="input">
                              <option>Pending</option>
                              <option>In progress</option>
                              <option>Completed</option>
                            </select>
                          </Field>
                        </div>
                        <div className="mt-4">
                          <Field label="Testing notes">
                            <textarea value={item.notes} onChange={(e) => updateFireDrill(item.id, "notes", e.target.value)} className="textarea" />
                          </Field>
                        </div>
                      </div>
                    ))}
                    {!activeFireDrills.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                        No active fire drills in the main list.
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card title="Completed Fire Drills">
                <div className="space-y-4">
                  {archivedFireDrills.length ? (
                    archivedFireDrills.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-semibold text-emerald-900">{item.scenario || "Completed fire drill"}</p>
                            <p className="text-sm text-emerald-800">
                              {item.date || "Date not entered"} • {item.participants || "Participants not entered"}
                            </p>
                          </div>
                          <StatusBadge className="border border-emerald-200 bg-white text-emerald-700">
                            Completed{item.completedAt ? ` • ${item.completedAt}` : ""}
                          </StatusBadge>
                        </div>
                        {item.notes ? <p className="mt-3 text-sm text-emerald-900 whitespace-pre-wrap">{item.notes}</p> : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Completed fire drills will move here automatically.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "journal" && (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card title="Add Journal Entry">
                <div className="space-y-4">
                  <SectionActions onSave={addJournalEntry} onReset={resetJournalSection} saveLabel="Post journal entry" />
                  <p className="text-sm text-slate-600">
                    Use the journal to record notes, questions, communication, and urgent alerts between caregivers and network members.
                  </p>
                  <Field label="Author">
                    <input value={data.journalEntryAuthor} onChange={(e) => updateField("journalEntryAuthor", e.target.value)} className="input" />
                  </Field>
                  <Field label="Audience">
                    <input value={data.journalEntryAudience} onChange={(e) => updateField("journalEntryAudience", e.target.value)} className="input" />
                  </Field>
                  <Field label="Urgency or alert level">
                    <select value={data.journalEntryUrgency} onChange={(e) => updateField("journalEntryUrgency", e.target.value as JournalUrgency)} className="input">
                      <option>Routine</option>
                      <option>Important</option>
                      <option>Urgent</option>
                    </select>
                  </Field>
                  <Field
                    label="Who should be alerted immediately"
                    helper={data.caseClosureStatus === "Closed to CPS" ? "Worker-only alerts automatically route back to network and caregivers after closure." : "Worker notifications are only intended while the case remains open."}
                  >
                    <select value={data.journalNotifyTarget} onChange={(e) => updateField("journalNotifyTarget", e.target.value as JournalNotifyTarget)} className="input">
                      <option>Network and caregivers</option>
                      <option>Worker only</option>
                      <option>Everyone on file</option>
                    </select>
                  </Field>
                  <Field label="Journal note">
                    <textarea value={data.journalEntryText} onChange={(e) => updateField("journalEntryText", e.target.value)} className="textarea" />
                  </Field>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    In this local version, posting a journal entry records the alert target and timestamp. Live email or text delivery requires backend messaging integration.
                  </div>
                </div>
              </Card>

              <Card title="Shared Journal Feed">
                <div className="space-y-4">
                  {data.journalEntries.length ? (
                    data.journalEntries.map((entry) => {
                      const urgencyTone =
                        entry.urgency === "Urgent"
                          ? "border border-rose-200 bg-rose-50 text-rose-700"
                          : entry.urgency === "Important"
                            ? "border border-amber-200 bg-amber-50 text-amber-700"
                            : "border border-slate-200 bg-slate-100 text-slate-700";
                      return (
                        <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-semibold text-slate-900">{entry.author}</p>
                                <StatusBadge className={urgencyTone}>{entry.urgency}</StatusBadge>
                              </div>
                              <p className="text-sm text-slate-500">{entry.audience}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{entry.timestamp}</span>
                              <button
                                type="button"
                                onClick={() => removeJournalEntry(entry.id)}
                                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.message}</p>
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                            Alert target: <span className="font-medium text-slate-900">{entry.notifyTarget}</span>
                            {entry.alertsSentAt ? (
                              <span> • Alert recorded at <span className="font-medium text-slate-900">{entry.alertsSentAt}</span></span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      No journal entries yet. Add the first shared note for the family and network.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "closure" && (
            <div className="space-y-6">
              <Card
                title="Post-Closure Support Tools"
                right={
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => closureDocumentInputRef.current?.click()}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add closure document
                    </button>
                    <button
                      type="button"
                      onClick={() => saveSection("Closure documents")}
                      className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      Save documents
                    </button>
                  </div>
                }
              >
                <details open className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">Closure Documents</summary>
                  <p className="mt-3 text-sm text-slate-600">
                    Upload or list all relevant closure documents so the family and network can access them for reference after CPS closure.
                  </p>
                  <input
                    ref={closureDocumentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      addClosureDocumentsFromFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <div className="mt-4 grid gap-3">
                    {data.closureDocuments.map((doc) => (
                      <div key={doc.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center">
                        <input value={doc.name} onChange={(e) => updateClosureDocument(doc.id, e.target.value)} className="input" placeholder="Enter closure document name or reference" />
                        <button
                          type="button"
                          onClick={() => removeClosureDocument(doc.id)}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <button type="button" onClick={addClosureDocument} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Add blank document row
                    </button>
                  </div>
                </details>
              </Card>

              <Card title="Worst Case Scenario">
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    The family and network must call child welfare for help immediately if any of the following situations or conditions occur.
                  </p>
                  <div className="space-y-3">
                    {WORST_CASE_SCENARIOS.map((item) => (
                      <div key={item} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card title="Closure Stage and Ongoing Safeguarding Actions">
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => saveSection("Closure and ongoing safeguarding")}
                      className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      Save this section
                    </button>
                    <button
                      type="button"
                      onClick={deleteClosureSection}
                      className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Delete section content
                    </button>
                  </div>

                  <div className={`rounded-2xl border px-4 py-4 ${getClosureStatusClasses(data.caseClosureStatus)}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em]">Case status alert</div>
                        <div className="text-lg font-semibold">{data.caseClosureStatus}</div>
                        <p className="text-sm leading-6">{data.closureAlertNote}</p>
                      </div>
                      <div className="w-full max-w-sm">
                        <Field label="Update closure alert status">
                          <select
                            value={data.caseClosureStatus}
                            onChange={(e) => updateField("caseClosureStatus", e.target.value as AppData["caseClosureStatus"])}
                            className="input"
                          >
                            <option>CPS active</option>
                            <option>Closure planned</option>
                            <option>Closed to CPS</option>
                            <option>Urgent CPS review</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  </div>

                  <Card
                    title="Network Appointments and Action Management"
                    right={
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={addClosureAppointment} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Add appointment
                        </button>
                        <button type="button" onClick={addClosureActionItem} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Add action item
                        </button>
                      </div>
                    }
                  >
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-base font-semibold text-slate-900">Upcoming and active meetings</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Once a meeting has happened, mark it completed. It will move out of the main list and remain stored below with notes and a timestamp.
                        </p>
                        <div className="mt-4 grid gap-3">
                          {openAppointments.length ? (
                            openAppointments.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <Field label="Meeting title">
                                    <input value={item.title} onChange={(e) => updateClosureAppointment(item.id, "title", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Status">
                                    <select value={item.status} onChange={(e) => updateClosureAppointment(item.id, "status", e.target.value)} className="input">
                                      <option>Scheduled</option>
                                      <option>Completed</option>
                                    </select>
                                  </Field>
                                  <Field label="Date">
                                    <input type="date" value={item.date} onChange={(e) => updateClosureAppointment(item.id, "date", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Time">
                                    <input type="time" value={item.time} onChange={(e) => updateClosureAppointment(item.id, "time", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Location">
                                    <input value={item.location} onChange={(e) => updateClosureAppointment(item.id, "location", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Meeting notes">
                                    <textarea value={item.notes} onChange={(e) => updateClosureAppointment(item.id, "notes", e.target.value)} className="textarea" />
                                  </Field>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                  <div>
                                    <span className="font-medium text-slate-900">Booked:</span> {item.date || "Date pending"} at {item.time || "Time pending"}{item.location ? `, ${item.location}` : ""}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeClosureAppointment(item.id)}
                                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                              No active meetings in the main list.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-base font-semibold text-slate-900">Archived meetings</h3>
                        <div className="mt-4 grid gap-3">
                          {archivedAppointments.length ? (
                            archivedAppointments.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold text-emerald-900">{item.title || "Completed meeting"}</p>
                                    <p className="text-sm text-emerald-800">
                                      {item.date || "Date pending"} {item.time ? `at ${item.time}` : ""}{item.location ? ` • ${item.location}` : ""}
                                    </p>
                                  </div>
                                  <StatusBadge className="border border-emerald-200 bg-white text-emerald-700">
                                    Completed{item.completedAt ? ` • ${item.completedAt}` : ""}
                                  </StatusBadge>
                                </div>
                                {item.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-emerald-900">{item.notes}</p> : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                              Completed meetings will move here automatically.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-base font-semibold text-slate-900">Meeting action items</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Completed items move out of the main list and remain available below with notes and a completion timestamp.
                        </p>
                        <div className="mt-4 grid gap-3">
                          {activeActionItems.length ? (
                            activeActionItems.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <Field label="Action item">
                                    <input value={item.title} onChange={(e) => updateClosureActionItem(item.id, "title", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Responsible person">
                                    <input value={item.owner} onChange={(e) => updateClosureActionItem(item.id, "owner", e.target.value)} className="input" />
                                  </Field>
                                  <Field label="Status">
                                    <select value={item.status} onChange={(e) => updateClosureActionItem(item.id, "status", e.target.value)} className="input">
                                      <option>Planned</option>
                                      <option>In progress</option>
                                      <option>Completed</option>
                                    </select>
                                  </Field>
                                  <Field label="Notes or outcome">
                                    <textarea value={item.notes} onChange={(e) => updateClosureActionItem(item.id, "notes", e.target.value)} className="textarea" />
                                  </Field>
                                </div>
                                <div className="mt-4 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeClosureActionItem(item.id)}
                                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                              No active action items in the main list.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-base font-semibold text-slate-900">Completed action items</h3>
                        <div className="mt-4 grid gap-3">
                          {archivedActionItems.length ? (
                            archivedActionItems.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold text-emerald-900">{item.title || "Completed action item"}</p>
                                    <p className="text-sm text-emerald-800">Responsible person: {item.owner || "Not entered"}</p>
                                  </div>
                                  <StatusBadge className="border border-emerald-200 bg-white text-emerald-700">
                                    Completed{item.completedAt ? ` • ${item.completedAt}` : ""}
                                  </StatusBadge>
                                </div>
                                {item.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-emerald-900">{item.notes}</p> : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                              Completed action items will move here automatically.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">Plan Adaptation Recommendations</h3>
                            <p className="mt-1 text-sm text-slate-600">
                              Use this section to number, track, and manage new rule suggestions or adaptations to the safeguarding plan.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={addPlanAdaptation}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Add recommendation
                          </button>
                        </div>
                        <div className="space-y-4">
                          {data.planAdaptations.map((item, index) => (
                            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <StatusBadge className="border border-blue-200 bg-blue-50 text-blue-700">
                                  Recommendation {index + 1}
                                </StatusBadge>
                                <button
                                  type="button"
                                  onClick={() => removePlanAdaptation(item.id)}
                                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Suggested change or addition">
                                  <textarea value={item.recommendation} onChange={(e) => updatePlanAdaptation(item.id, "recommendation", e.target.value)} className="textarea" />
                                </Field>
                                <Field label="Progress">
                                  <select value={item.status} onChange={(e) => updatePlanAdaptation(item.id, "status", e.target.value)} className="input">
                                    <option>Suggested</option>
                                    <option>In review</option>
                                    <option>Agreed</option>
                                    <option>Implemented</option>
                                  </select>
                                </Field>
                                <Field label="Suggested by">
                                  <input value={item.suggestedBy} onChange={(e) => updatePlanAdaptation(item.id, "suggestedBy", e.target.value)} className="input" />
                                </Field>
                                <Field label="Responsible person">
                                  <input value={item.responsible} onChange={(e) => updatePlanAdaptation(item.id, "responsible", e.target.value)} className="input" />
                                </Field>
                              </div>
                              <div className="mt-4 grid gap-4">
                                <Field label="Notes or rationale">
                                  <textarea value={item.notes} onChange={(e) => updatePlanAdaptation(item.id, "notes", e.target.value)} className="textarea" />
                                </Field>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                                  Added {item.createdAt}{item.updatedAt ? ` • Updated ${item.updatedAt}` : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
