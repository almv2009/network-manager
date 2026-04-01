import { useEffect, useMemo, useState } from "react";

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

type AppointmentItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
};

type ActionItem = {
  id: string;
  title: string;
  owner: string;
  status: "Planned" | "In progress" | "Completed";
};

type ChangeLogItem = {
  id: string;
  message: string;
  author: string;
  audience: string;
  timestamp: string;
};

type JournalEntry = {
  id: string;
  author: string;
  audience: string;
  message: string;
  timestamp: string;
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

  caseClosureStatus:
    | "CPS active"
    | "Closure planned"
    | "Closed to CPS"
    | "Urgent CPS review";
  closureAlertNote: string;
  closureAppointments: AppointmentItem[];
  closureActionItems: ActionItem[];
  planAdaptationText: string;
  communicationMitigationText: string;
  urgentCpsContactText: string;
  closureJournalText: string;
  closureDocuments: DocumentItem[];
  changeAuthor: string;
  changeAudience: string;
  changeUpdateText: string;
  changeLog: ChangeLogItem[];

  journalEntryAuthor: string;
  journalEntryAudience: string;
  journalEntryText: string;
  journalEntries: JournalEntry[];
};

const STORAGE_KEY = "network-manager-app-data-v4";

const tabs: { key: TabKey; label: string }[] = [
  { key: "case-status", label: "Case Status" },
  { key: "timeline", label: "Timeline" },
  { key: "network", label: "Network Building" },
  { key: "planning", label: "Safeguarding Planning" },
  { key: "monitoring", label: "Monitoring & Testing" },
  { key: "journal", label: "Shared Journal" },
  { key: "closure", label: "Closure & Ongoing Safeguarding" },
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNetworkMember(member: Partial<NetworkMember>): NetworkMember {
  const rawScore = Number(member.reliability ?? 0);
  const normalizedScore =
    rawScore > 10 ? Math.max(0, Math.min(10, Math.round(rawScore / 10))) : rawScore;

  return {
    id: member.id || makeId("member"),
    name: member.name || "",
    relationship: member.relationship || "",
    role: member.role || "",
    availability: member.availability || "",
    phone: member.phone || "",
    email: member.email || "",
    reliability: Math.max(0, Math.min(10, normalizedScore)),
    confirmed: Boolean(member.confirmed ?? (member.name && member.role)),
  };
}

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
      helper:
        "Roles drafted for evenings, school mornings, and backup response.",
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
    {
      id: makeId("monitor"),
      text: "Roles are being carried out as agreed",
      checked: false,
    },
    {
      id: makeId("monitor"),
      text: "Communication chain is working",
      checked: false,
    },
    {
      id: makeId("monitor"),
      text: "Early warning signs are being noticed quickly",
      checked: false,
    },
    {
      id: makeId("monitor"),
      text: "The child’s day-to-day well-being looks stable",
      checked: false,
    },
    {
      id: makeId("monitor"),
      text: "Backups are clear when routines change",
      checked: false,
    },
  ],
  fireDrillScenario:
    "Test late-evening loss of coverage and confirm whether the backup chain responds within 30 minutes.",
  fireDrillDate: "2026-04-10",
  fireDrillParticipants: "Anna, Karen, Mary, Lisa",
  fireDrillRecordNotes: "",

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
    },
    {
      id: makeId("appointment"),
      title: "Plan review and adaptation",
      date: "2026-05-02",
      time: "17:30",
      location: "Community hub",
    },
  ],
  closureActionItems: [
    {
      id: makeId("closure-action"),
      title: "Review current network capacity and commitments",
      owner: "Karen",
      status: "In progress",
    },
    {
      id: makeId("closure-action"),
      title: "Update responsibilities in the safeguarding plan after closure",
      owner: "Mary",
      status: "Planned",
    },
    {
      id: makeId("closure-action"),
      title: "Confirm who leads communication and mitigation responses",
      owner: "Lisa",
      status: "Planned",
    },
  ],
  planAdaptationText:
    "Use each booked meeting to test whether the safeguarding plan still fits current needs, whether responsibilities remain realistic, and whether revisions are required to stay aligned with safeguarding goals.",
  communicationMitigationText:
    "Primary contact route: caregiver group text and phone call to key network members. Mitigation route: if routines weaken, activate backup support, confirm child coverage, and record what changed for the next review.",
  urgentCpsContactText:
    "Contact CPS immediately if the network cannot maintain child supervision, if agreed safeguarding actions fail repeatedly, if there is new harm or credible risk of harm, or if the network loses essential capacity and cannot restore it quickly.",
  closureJournalText:
    "Use this shared journal to record post-closure developments, decisions, observations, changes to commitments, and any learning from network meetings or real-life safeguarding events.",
  closureDocuments: [
    { id: makeId("doc"), name: "CPS closure summary" },
    { id: makeId("doc"), name: "Final safeguarding plan at closure" },
    { id: makeId("doc"), name: "Network sustainability plan" },
    { id: makeId("doc"), name: "Communication and escalation pathway" },
  ],
  changeAuthor: "",
  changeAudience: "All network members and caregivers",
  changeUpdateText: "",
  changeLog: [
    {
      id: makeId("change-log"),
      message:
        "Closure planning meeting scheduled and shared with the network.",
      author: "Practitioner Name",
      audience: "All network members and caregivers",
      timestamp: "2026-03-31 09:15",
    },
  ],

  journalEntryAuthor: "",
  journalEntryAudience: "All network members and caregivers",
  journalEntryText: "",
  journalEntries: [
    {
      id: makeId("journal"),
      author: "Practitioner Name",
      audience: "All network members and caregivers",
      message:
        "Welcome to the shared journal. Use this space to record developments, questions, updates, and communication between caregivers and network members.",
      timestamp: "2026-03-31 09:20",
    },
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
      networkMembers: (parsed.networkMembers ?? defaultData.networkMembers).map(
        (member) => normalizeNetworkMember(member),
      ),
      rules: parsed.rules ?? defaultData.rules,
      monitoringItems: parsed.monitoringItems ?? defaultData.monitoringItems,
      closureAppointments:
        parsed.closureAppointments ?? defaultData.closureAppointments,
      closureActionItems:
        parsed.closureActionItems ?? defaultData.closureActionItems,
      closureDocuments:
        parsed.closureDocuments ??
        (parsed as Partial<{ handoverDocs: DocumentItem[] }>).handoverDocs ??
        defaultData.closureDocuments,
      changeLog: parsed.changeLog ?? defaultData.changeLog,
      journalEntries: parsed.journalEntries ?? defaultData.journalEntries,
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
          {title ? (
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          ) : (
            <div />
          )}
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

function ProgressBar({
  value,
  barClass = "bg-blue-600",
}: {
  value: number;
  barClass?: string;
}) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${barClass}`}
        style={{ width: `${value}%` }}
      />
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

function getScaleTone(value: number, max: number) {
  const normalized = max === 10 ? value : (value / max) * 10;
  if (normalized <= 4) {
    return {
      barClass: "bg-rose-500",
      textClass: "text-rose-700",
      badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
      label: "Needs attention",
    };
  }
  if (normalized <= 7) {
    return {
      barClass: "bg-amber-500",
      textClass: "text-amber-700",
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
      label: "Developing",
    };
  }
  return {
    barClass: "bg-emerald-500",
    textClass: "text-emerald-700",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Strong",
  };
}

function getScaleTrackClass(value: number, max: number) {
  const normalized = max === 10 ? value : (value / max) * 10;
  if (normalized <= 4) return "range-track-red";
  if (normalized <= 7) return "range-track-amber";
  return "range-track-green";
}

function getClosureStatusClasses(status: AppData["caseClosureStatus"]) {
  if (status === "Closed to CPS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "Closure planned") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "Urgent CPS review") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("case-status");
  const [data, setData] = useState<AppData>(loadInitialData);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const confirmedNetworkMembers = useMemo(
    () =>
      data.networkMembers.filter(
        (member) => member.confirmed && member.name.trim(),
      ),
    [data.networkMembers],
  );

  const continuityReadiness = useMemo(() => {
    const source = confirmedNetworkMembers.length
      ? confirmedNetworkMembers
      : data.networkMembers;

    const avg =
      source.reduce((sum, member) => sum + Number(member.reliability || 0), 0) /
      Math.max(1, source.length);

    return Math.max(0, Math.min(10, Number(avg.toFixed(1))));
  }, [confirmedNetworkMembers, data.networkMembers]);

  const saveSection = (sectionName: string) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setBanner(`${sectionName} saved on this device.`);
  };

  const updateField = <K extends keyof AppData>(key: K, value: AppData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  };

  const updateNetworkMember = (
    id: string,
    field: keyof NetworkMember,
    value: string | number | boolean,
  ) => {
    setData((current) => ({
      ...current,
      networkMembers: current.networkMembers.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addNetworkMember = () => {
    setData((current) => ({
      ...current,
      networkMembers: [
        ...current.networkMembers,
        normalizeNetworkMember({
          id: makeId("member"),
          name: "",
          relationship: "",
          role: "",
          availability: "",
          phone: "",
          email: "",
          reliability: 5,
          confirmed: false,
        }),
      ],
    }));
  };

  const removeNetworkMember = (id: string) => {
    setData((current) => ({
      ...current,
      networkMembers: current.networkMembers.filter((item) => item.id !== id),
    }));
  };

  const updateTimelineEntry = (
    id: string,
    field: keyof TimelineEntry,
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      timelineEntries: current.timelineEntries.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
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
      rules: current.rules.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
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

  const updateMonitoringItem = (
    id: string,
    field: keyof MonitoringItem,
    value: string | boolean,
  ) => {
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
      monitoringItems: [
        ...current.monitoringItems,
        { id: makeId("monitor"), text: "", checked: false },
      ],
    }));
  };

  const removeMonitoringItem = (id: string) => {
    setData((current) => ({
      ...current,
      monitoringItems: current.monitoringItems.filter((item) => item.id !== id),
    }));
  };

  const updateClosureDocument = (id: string, name: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    }));
  };

  const addClosureDocument = () => {
    setData((current) => ({
      ...current,
      closureDocuments: [
        ...current.closureDocuments,
        { id: makeId("doc"), name: "" },
      ],
    }));
  };

  const removeClosureDocument = (id: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.filter(
        (item) => item.id !== id,
      ),
    }));
  };

  const updateClosureAppointment = (
    id: string,
    field: keyof AppointmentItem,
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      closureAppointments: current.closureAppointments.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addClosureAppointment = () => {
    setData((current) => ({
      ...current,
      closureAppointments: [
        ...current.closureAppointments,
        {
          id: makeId("appointment"),
          title: "",
          date: "",
          time: "",
          location: "",
        },
      ],
    }));
  };

  const removeClosureAppointment = (id: string) => {
    setData((current) => ({
      ...current,
      closureAppointments: current.closureAppointments.filter(
        (item) => item.id !== id,
      ),
    }));
  };

  const updateClosureActionItem = (
    id: string,
    field: keyof ActionItem,
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      closureActionItems: current.closureActionItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addClosureActionItem = () => {
    setData((current) => ({
      ...current,
      closureActionItems: [
        ...current.closureActionItems,
        {
          id: makeId("closure-action"),
          title: "",
          owner: "",
          status: "Planned",
        },
      ],
    }));
  };

  const removeClosureActionItem = (id: string) => {
    setData((current) => ({
      ...current,
      closureActionItems: current.closureActionItems.filter(
        (item) => item.id !== id,
      ),
    }));
  };

  const addClosureUpdate = () => {
    const author = data.changeAuthor.trim() || "Unknown author";
    const message = data.changeUpdateText.trim();
    const audience =
      data.changeAudience.trim() || "All network members and caregivers";

    if (!message) {
      setBanner("Enter an update before sending it to the network.");
      return;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;

    setData((current) => ({
      ...current,
      changeUpdateText: "",
      changeLog: [
        {
          id: makeId("change-log"),
          message,
          author,
          audience,
          timestamp,
        },
        ...current.changeLog,
      ],
    }));
    setBanner(
      "Network update logged and ready to share with members and caregivers.",
    );
  };

  const removeClosureUpdate = (id: string) => {
    setData((current) => ({
      ...current,
      changeLog: current.changeLog.filter((item) => item.id !== id),
    }));
  };

  const addJournalEntry = () => {
    const author = data.journalEntryAuthor.trim() || "Unknown author";
    const message = data.journalEntryText.trim();
    const audience =
      data.journalEntryAudience.trim() || "All network members and caregivers";

    if (!message) {
      setBanner("Enter a journal note before posting it.");
      return;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;

    setData((current) => ({
      ...current,
      journalEntryText: "",
      journalEntries: [
        {
          id: makeId("journal"),
          author,
          audience,
          message,
          timestamp,
        },
        ...current.journalEntries,
      ],
    }));
    setBanner("Journal entry posted for the family and network.");
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
      journalEntryAuthor: defaultData.journalEntryAuthor,
      journalEntryAudience: defaultData.journalEntryAudience,
      journalEntryText: defaultData.journalEntryText,
      journalEntries: defaultData.journalEntries,
    }));
    setBanner("Shared journal reset.");
  };


  const deleteClosureSection = () => {
    setData((current) => ({
      ...current,
      caseClosureStatus: defaultData.caseClosureStatus,
      closureAlertNote: defaultData.closureAlertNote,
      closureAppointments: defaultData.closureAppointments,
      closureActionItems: defaultData.closureActionItems,
      planAdaptationText: defaultData.planAdaptationText,
      communicationMitigationText: defaultData.communicationMitigationText,
      urgentCpsContactText: defaultData.urgentCpsContactText,
      closureJournalText: defaultData.closureJournalText,
      closureDocuments: defaultData.closureDocuments,
      changeAuthor: defaultData.changeAuthor,
      changeAudience: defaultData.changeAudience,
      changeUpdateText: defaultData.changeUpdateText,
      changeLog: defaultData.changeLog,
    }));
    setBanner("Closure and ongoing safeguarding section reset.");
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-200 bg-teal-50 p-2">
                  <img
                    src="/sgt-logo.png"
                    alt="SgT logo"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                    Network Manager
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    A working safeguarding, continuity, and self-management tool
                    for one family, their network, and supporting professionals.
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                Practitioner View
              </div>
            </div>
          </section>

          {banner ? (
            <SaveBanner message={banner} onDismiss={() => setBanner("")} />
          ) : null}

          <Card title="Family Safeguarding Workspace">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <SectionActions onSave={() => saveSection("Workspace")} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Current workspace">
                    <input
                      value={data.workspaceName}
                      onChange={(e) =>
                        updateField("workspaceName", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Workspace mode">
                    <input
                      value={data.workspaceMode}
                      onChange={(e) =>
                        updateField("workspaceMode", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                </div>

              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">
                  Continuity status
                </p>
                <div className="mt-3 space-y-3">
                  <Field label="Current phase">
                    <input
                      value={data.currentPhaseLabel}
                      onChange={(e) =>
                        updateField("currentPhaseLabel", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Post-closure continuity">
                    <input
                      value={data.postClosureContinuity}
                      onChange={(e) =>
                        updateField("postClosureContinuity", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Network self-management tools">
                    <input
                      value={data.networkSelfManagementTools}
                      onChange={(e) =>
                        updateField(
                          "networkSelfManagementTools",
                          e.target.value,
                        )
                      }
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
                  label="Confirmed Network Members"
                  value={String(confirmedNetworkMembers.length)}
                  helper="Auto-populated from the Network Building tab"
                />
                <Metric
                  label="Plan Reliability"
                  value={`${data.planStability}%`}
                  helper="Based on saved monitoring and continuity entries"
                />
                <Metric
                  label="Continuity Readiness"
                  value={`${continuityReadiness}/10`}
                  helper="Average willingness, ability, and confidence across confirmed members"
                />
              </div>

              <Card title="Confirmed Network Members">
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    This section updates automatically from confirmed entries in the Network Building tab.
                  </p>
                  {confirmedNetworkMembers.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {confirmedNetworkMembers.map((member) => (
                        <div
                          key={member.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-900">
                                {member.name}
                              </p>
                              <p className="text-sm text-slate-600">
                                {member.relationship || "Relationship not entered"}
                              </p>
                            </div>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                              Confirmed
                            </span>
                          </div>
                          <div className="mt-4 space-y-2 text-sm text-slate-700">
                            <div>
                              <span className="font-medium text-slate-900">Role:</span>{" "}
                              {member.role || "Not entered"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Availability:</span>{" "}
                              {member.availability || "Not entered"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Phone:</span>{" "}
                              {member.phone || "Not entered"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Email:</span>{" "}
                              {member.email || "Not entered"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">
                                Willingness / Ability / Confidence:
                              </span>{" "}
                              {member.reliability}/10
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      No confirmed network members yet. Confirm them in the Network Building tab and they will appear here automatically.
                    </div>
                  )}
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <Card title="Case Dashboard">
                  <div className="space-y-6">
                    <SectionActions onSave={() => saveSection("Case status")} />
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Case Information
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Basic case setup used across all safeguarding modules.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Case Name / Family Name">
                          <input
                            value={data.familyName}
                            onChange={(e) =>
                              updateField("familyName", e.target.value)
                            }
                            className="input"
                          />
                        </Field>

                        <Field label="Lead Practitioner">
                          <input
                            value={data.leadPractitioner}
                            onChange={(e) =>
                              updateField("leadPractitioner", e.target.value)
                            }
                            className="input"
                          />
                        </Field>

                        <Field label="Case Start Date">
                          <input
                            value={data.caseStartDate}
                            onChange={(e) =>
                              updateField("caseStartDate", e.target.value)
                            }
                            className="input"
                          />
                        </Field>

                        <Field label="Case Status">
                          <select
                            value={data.caseStatus}
                            onChange={(e) =>
                              updateField("caseStatus", e.target.value)
                            }
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
                            onChange={(e) =>
                              updateField("caregiverSummary", e.target.value)
                            }
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
                        onChange={(e) =>
                          updateField("currentWatchpoint", e.target.value)
                        }
                        className="textarea"
                      />
                    </Field>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">
                          Plan Stability
                        </span>
                        <span className="font-semibold text-slate-900">
                          {data.planStability}%
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={data.planStability}
                          onChange={(e) =>
                            updateField("planStability", Number(e.target.value))
                          }
                          className="w-full"
                        />
                        <ProgressBar value={data.planStability} />
                      </div>
                    </div>

                    <Field
                      label="Immediate actions"
                      helper="Enter one action per line."
                    >
                      <textarea
                        value={data.immediateActionsText}
                        onChange={(e) =>
                          updateField("immediateActionsText", e.target.value)
                        }
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
                        onChange={(e) =>
                          updateField("riskStatement", e.target.value)
                        }
                        className="textarea"
                      />
                    </Field>

                    <Field label="Safeguarding Goals">
                      <textarea
                        value={data.safeguardingGoals}
                        onChange={(e) =>
                          updateField("safeguardingGoals", e.target.value)
                        }
                        className="textarea"
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          Safeguarding Scale
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Current shared judgement of safeguarding strength and
                          reliability.
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
                        onChange={(e) =>
                          updateField(
                            "safeguardingScale",
                            Number(e.target.value),
                          )
                        }
                        className="w-full"
                      />
                      <div className="range-scale-labels">
                        <span className="range-scale-label">
                          0, Unsafe and unstable
                        </span>
                        <span className="range-scale-label">
                          10, Strong and sustainable safeguarding
                        </span>
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
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
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
                            onChange={(e) =>
                              updateTimelineEntry(
                                item.id,
                                "date",
                                e.target.value,
                              )
                            }
                            className="input"
                          />
                        </Field>
                        <Field label="Entry title">
                          <input
                            value={item.title}
                            onChange={(e) =>
                              updateTimelineEntry(
                                item.id,
                                "title",
                                e.target.value,
                              )
                            }
                            className="input"
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Field label="Details">
                          <textarea
                            value={item.helper}
                            onChange={(e) =>
                              updateTimelineEntry(
                                item.id,
                                "helper",
                                e.target.value,
                              )
                            }
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
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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
                  <SectionActions
                    onSave={() => saveSection("Network building")}
                  />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Confirmed network members automatically appear on the main Case Status page with their contact details.
                  </div>
                  {data.networkMembers.map((person) => {
                    const personTone = getScaleTone(person.reliability, 10);

                    return (
                      <div
                        key={person.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">
                              {person.name || "New network member"}
                            </p>
                            <p className="text-sm text-slate-500">
                              {person.role || "Role not entered yet"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={person.confirmed}
                                onChange={(e) =>
                                  updateNetworkMember(
                                    person.id,
                                    "confirmed",
                                    e.target.checked,
                                  )
                                }
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
                            <input
                              value={person.name}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "name",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Relationship to child or family">
                            <input
                              value={person.relationship}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "relationship",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Role">
                            <input
                              value={person.role}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "role",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Availability">
                            <input
                              value={person.availability}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "availability",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Phone">
                            <input
                              value={person.phone}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "phone",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Email">
                            <input
                              value={person.email}
                              onChange={(e) =>
                                updateNetworkMember(
                                  person.id,
                                  "email",
                                  e.target.value,
                                )
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="Willingness / Ability / Confidence">
                            <div className="space-y-3">
                              <input
                                type="range"
                                min="0"
                                max="10"
                                value={person.reliability}
                                onChange={(e) =>
                                  updateNetworkMember(
                                    person.id,
                                    "reliability",
                                    Number(e.target.value),
                                  )
                                }
                                className={`range-input w-full ${getScaleTrackClass(
                                  person.reliability,
                                  10,
                                )}`}
                              />
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">Score</span>
                                <span className={`font-medium ${personTone.textClass}`}>
                                  {person.reliability}/10
                                </span>
                              </div>
                              <ProgressBar
                                value={person.reliability * 10}
                                barClass={personTone.barClass}
                              />
                            </div>
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Network Gaps & Development">
                <div className="space-y-4">
                  <Field label="Current gaps" helper="Enter one gap per line.">
                    <textarea
                      value={data.currentGapsText}
                      onChange={(e) =>
                        updateField("currentGapsText", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>

                  <Field
                    label="Next network-building steps"
                    helper="Enter one step per line."
                  >
                    <textarea
                      value={data.nextNetworkStepsText}
                      onChange={(e) =>
                        updateField("nextNetworkStepsText", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">
                        Current gaps preview
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {splitLines(data.currentGapsText).map((item) => (
                          <div key={item}>• {item}</div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">
                        Next steps preview
                      </p>
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
                <SectionActions
                  onSave={() => saveSection("Safeguarding planning")}
                />
                {data.rules.map((rule, index) => (
                  <div
                    key={rule.id}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
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
                          onChange={(e) =>
                            updateRule(rule.id, "title", e.target.value)
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="Status">
                        <select
                          value={rule.status}
                          onChange={(e) =>
                            updateRule(rule.id, "status", e.target.value)
                          }
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
                          onChange={(e) =>
                            updateRule(rule.id, "owner", e.target.value)
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="Backup">
                        <input
                          value={rule.backup}
                          onChange={(e) =>
                            updateRule(rule.id, "backup", e.target.value)
                          }
                          className="input"
                        />
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <Field label="Notes">
                        <textarea
                          value={rule.note}
                          onChange={(e) =>
                            updateRule(rule.id, "note", e.target.value)
                          }
                          className="textarea"
                        />
                      </Field>
                      <Field label="Check method">
                        <input
                          value={rule.checkMethod}
                          onChange={(e) =>
                            updateRule(rule.id, "checkMethod", e.target.value)
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="If it breaks down">
                        <input
                          value={rule.breakdownPlan}
                          onChange={(e) =>
                            updateRule(rule.id, "breakdownPlan", e.target.value)
                          }
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
                  <SectionActions
                    onSave={() => saveSection("Monitoring and testing")}
                  />
                  {data.monitoringItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) =>
                            updateMonitoringItem(
                              item.id,
                              "checked",
                              e.target.checked,
                            )
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
                              updateMonitoringItem(
                                item.id,
                                "text",
                                e.target.value,
                              )
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
                      onChange={(e) =>
                        updateField("fireDrillScenario", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Scheduled date">
                      <input
                        value={data.fireDrillDate}
                        onChange={(e) =>
                          updateField("fireDrillDate", e.target.value)
                        }
                        className="input"
                      />
                    </Field>
                    <Field label="Participants">
                      <input
                        value={data.fireDrillParticipants}
                        onChange={(e) =>
                          updateField("fireDrillParticipants", e.target.value)
                        }
                        className="input"
                      />
                    </Field>
                  </div>
                  <Field label="Fire drill record notes">
                    <textarea
                      value={data.fireDrillRecordNotes}
                      onChange={(e) =>
                        updateField("fireDrillRecordNotes", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>
                </div>
              </Card>
            </div>
          )}


          {activeTab === "journal" && (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card title="Add Journal Entry">
                <div className="space-y-4">
                  <SectionActions
                    onSave={addJournalEntry}
                    onReset={resetJournalSection}
                  />
                  <p className="text-sm text-slate-600">
                    Use the journal to record notes, questions, and communication between caregivers and network members.
                  </p>
                  <Field label="Author">
                    <input
                      value={data.journalEntryAuthor}
                      onChange={(e) =>
                        updateField("journalEntryAuthor", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Audience">
                    <input
                      value={data.journalEntryAudience}
                      onChange={(e) =>
                        updateField("journalEntryAudience", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Journal note">
                    <textarea
                      value={data.journalEntryText}
                      onChange={(e) =>
                        updateField("journalEntryText", e.target.value)
                      }
                      className="textarea"
                    />
                  </Field>
                </div>
              </Card>

              <Card title="Shared Journal Feed">
                <div className="space-y-4">
                  {data.journalEntries.length ? (
                    data.journalEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {entry.author}
                            </p>
                            <p className="text-sm text-slate-500">
                              {entry.audience}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {entry.timestamp}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeJournalEntry(entry.id)}
                              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {entry.message}
                        </p>
                      </div>
                    ))
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
                      onClick={addClosureDocument}
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
                <details
                  open
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                    Closure Documents
                  </summary>
                  <p className="mt-3 text-sm text-slate-600">
                    Upload or list all relevant closure documents so the family
                    and network can access them for reference after CPS closure.
                  </p>
                  <div className="mt-4 grid gap-3">
                    {data.closureDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center"
                      >
                        <input
                          value={doc.name}
                          onChange={(e) =>
                            updateClosureDocument(doc.id, e.target.value)
                          }
                          className="input"
                          placeholder="Enter closure document name or reference"
                        />
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
                </details>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                <Card title="Worst Case Scenario">
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                      The family and network must call child welfare for help immediately if any of the following situations or conditions occur.
                    </p>
                    <div className="space-y-3">
                      {WORST_CASE_SCENARIOS.map((item) => (
                        <div
                          key={item}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                        >
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
                        onClick={() =>
                          saveSection("Closure and ongoing safeguarding")
                        }
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

                    <div
                      className={`rounded-2xl border px-4 py-4 ${getClosureStatusClasses(data.caseClosureStatus)}`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                            Case status alert
                          </div>
                          <div className="text-lg font-semibold">
                            {data.caseClosureStatus}
                          </div>
                          <p className="text-sm leading-6">
                            {data.closureAlertNote}
                          </p>
                        </div>
                        <div className="w-full max-w-sm">
                          <Field label="Update closure alert status">
                            <select
                              value={data.caseClosureStatus}
                              onChange={(e) =>
                                updateField(
                                  "caseClosureStatus",
                                  e.target
                                    .value as AppData["caseClosureStatus"],
                                )
                              }
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
                          <button
                            type="button"
                            onClick={addClosureAppointment}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Add appointment
                          </button>
                          <button
                            type="button"
                            onClick={addClosureActionItem}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Add action item
                          </button>
                        </div>
                      }
                    >
                      <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold text-slate-900">
                                Network appointments calendar
                              </h3>
                              <p className="mt-1 text-sm text-slate-600">
                                Book review appointments for the network and
                                family. Once booked, the appointment shows when
                                and where it will happen.
                              </p>
                            </div>
                          </div>
                          <div className="grid gap-4">
                            {data.closureAppointments.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                  <Field label="Meeting title">
                                    <input
                                      value={item.title}
                                      onChange={(e) =>
                                        updateClosureAppointment(
                                          item.id,
                                          "title",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                  <Field label="Date">
                                    <input
                                      type="date"
                                      value={item.date}
                                      onChange={(e) =>
                                        updateClosureAppointment(
                                          item.id,
                                          "date",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                  <Field label="Time">
                                    <input
                                      type="time"
                                      value={item.time}
                                      onChange={(e) =>
                                        updateClosureAppointment(
                                          item.id,
                                          "time",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                  <Field label="Location">
                                    <input
                                      value={item.location}
                                      onChange={(e) =>
                                        updateClosureAppointment(
                                          item.id,
                                          "location",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                </div>
                                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                  <div className="text-sm text-slate-700">
                                    <span className="font-medium text-slate-900">
                                      Booked:
                                    </span>{" "}
                                    {item.date || "Date pending"} at{" "}
                                    {item.time || "Time pending"}{" "}
                                    {item.location ? `, ${item.location}` : ""}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeClosureAppointment(item.id)
                                    }
                                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <h3 className="text-base font-semibold text-slate-900">
                            Meeting action items
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Use this list to manage capacity reviews,
                            commitments, necessary revisions, safeguarding plan
                            changes, and responsibility tracking.
                          </p>
                          <div className="mt-4 grid gap-3">
                            {data.closureActionItems.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="grid gap-4 md:grid-cols-[1.35fr_0.8fr_0.7fr_auto] md:items-end">
                                  <Field label="Action item">
                                    <input
                                      value={item.title}
                                      onChange={(e) =>
                                        updateClosureActionItem(
                                          item.id,
                                          "title",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                  <Field label="Responsible person">
                                    <input
                                      value={item.owner}
                                      onChange={(e) =>
                                        updateClosureActionItem(
                                          item.id,
                                          "owner",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    />
                                  </Field>
                                  <Field label="Status">
                                    <select
                                      value={item.status}
                                      onChange={(e) =>
                                        updateClosureActionItem(
                                          item.id,
                                          "status",
                                          e.target.value,
                                        )
                                      }
                                      className="input"
                                    >
                                      <option>Planned</option>
                                      <option>In progress</option>
                                      <option>Completed</option>
                                    </select>
                                  </Field>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeClosureActionItem(item.id)
                                    }
                                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 md:mb-[2px]"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Field label="Plan adaptation">
                          <textarea
                            value={data.planAdaptationText}
                            onChange={(e) =>
                              updateField("planAdaptationText", e.target.value)
                            }
                            className="textarea"
                          />
                        </Field>

                        <Field label="Communication and mitigation plan">
                          <textarea
                            value={data.communicationMitigationText}
                            onChange={(e) =>
                              updateField(
                                "communicationMitigationText",
                                e.target.value,
                              )
                            }
                            className="textarea"
                          />
                        </Field>


                      </div>
                    </Card>
                  </div>
                </Card>

                <Card title="Shared Updates and Alerts">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-4">
                        <Field label="Who made the addition or change">
                          <input
                            value={data.changeAuthor}
                            onChange={(e) =>
                              updateField("changeAuthor", e.target.value)
                            }
                            className="input"
                          />
                        </Field>
                        <Field label="Alert audience">
                          <input
                            value={data.changeAudience}
                            onChange={(e) =>
                              updateField("changeAudience", e.target.value)
                            }
                            className="input"
                          />
                        </Field>
                        <Field label="Update or alert message">
                          <textarea
                            value={data.changeUpdateText}
                            onChange={(e) =>
                              updateField("changeUpdateText", e.target.value)
                            }
                            className="textarea"
                          />
                        </Field>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={addClosureUpdate}
                            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
                          >
                            Add update for network
                          </button>
                          <button
                            type="button"
                            onClick={() => saveSection("Closure updates")}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Save updates
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {data.changeLog.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              <span>{item.timestamp}</span>
                              <span>•</span>
                              <span>{item.audience}</span>
                            </div>
                            <p className="text-sm leading-6 text-slate-700">
                              {item.message}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-slate-900">
                                Added by {item.author}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeClosureUpdate(item.id)}
                                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
