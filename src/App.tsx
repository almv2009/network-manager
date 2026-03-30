import { useMemo, useState } from "react";

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

type RuleItem = {
  id: string;
  title: string;
  owner: string;
  backup: string;
  status: "On track" | "Needs review" | "At risk";
  note: string;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "case-status", label: "Case Status" },
  { key: "timeline", label: "Timeline" },
  { key: "network", label: "Network Building" },
  { key: "planning", label: "Safeguarding Planning" },
  { key: "monitoring", label: "Monitoring & Testing" },
  { key: "closure", label: "Closure & Ongoing Safeguarding" },
];

const initialNetwork: NetworkMember[] = [
  {
    id: "1",
    name: "Karen",
    role: "Primary evening support",
    availability: "Mon, Wed, Fri",
    reliability: 90,
  },
  {
    id: "2",
    name: "Mary",
    role: "Backup overnight support",
    availability: "Daily",
    reliability: 82,
  },
  {
    id: "3",
    name: "Lisa",
    role: "School and neighbourhood check-in",
    availability: "Weekdays",
    reliability: 88,
  },
  {
    id: "4",
    name: "Mrs. Patel",
    role: "School contact",
    availability: "School hours",
    reliability: 78,
  },
];

const initialRules: RuleItem[] = [
  {
    id: "Rule 1",
    title: "Children are supervised every evening",
    owner: "Karen",
    backup: "Mary",
    status: "On track",
    note: "Evening handoff confirmed by 7:30 p.m.",
  },
  {
    id: "Rule 2",
    title: "Network is notified if caregiver becomes overwhelmed",
    owner: "Anna",
    backup: "Lisa",
    status: "Needs review",
    note: "Escalation language needs to be simplified.",
  },
  {
    id: "Rule 3",
    title: "School attendance is checked daily",
    owner: "Mrs. Patel",
    backup: "Karen",
    status: "On track",
    note: "Attendance updates entered by 9:15 a.m.",
  },
];

const initialChecklist = [
  "Roles are being carried out as agreed",
  "Communication chain is working",
  "Early warning signs are being noticed quickly",
  "The child’s day-to-day well-being looks stable",
  "Backups are clear when routines change",
];

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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("case-status");
  const [caseStatus, setCaseStatus] = useState("Open");
  const [workspaceName, setWorkspaceName] = useState("Miller Family Workspace");
  const [familyName, setFamilyName] = useState("Miller Family");
  const [leadPractitioner, setLeadPractitioner] = useState("Practitioner Name");
  const [caseStartDate, setCaseStartDate] = useState("2026-03-30");
  const [riskStatement, setRiskStatement] = useState(
    "Children may experience gaps in supervision when caregiver becomes overwhelmed in the evening."
  );
  const [goal, setGoal] = useState(
    "Children are consistently supervised, emotionally settled, and supported by a reliable network that responds early when routines weaken."
  );
  const [safeguardingScale, setSafeguardingScale] = useState(7);
  const [journalEntry, setJournalEntry] = useState(
    "Caregiver reported a difficult evening on Friday but asked for help early, which allowed the network to stabilize routines before they broke down."
  );

  const [network] = useState<NetworkMember[]>(initialNetwork);
  const [rules] = useState<RuleItem[]>(initialRules);
  const [checklist] = useState(initialChecklist);

  const continuityReadiness = useMemo(() => {
    const avg = Math.round(network.reduce((sum, n) => sum + n.reliability, 0) / network.length);
    return Math.max(60, Math.min(96, avg - 7));
  }, [network]);

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
                    A shared safeguarding, continuity, and self-management tool for one family,
                    their network, and supporting professionals.
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                Practitioner View
              </div>
            </div>
          </section>

          <Card title="Family Safeguarding Workspace">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <button className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700">
                    Save Family Workspace
                  </button>
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Workspace mode: Shared family and network access
                  </div>
                </div>

                <Field label="Current workspace">
                  <input
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="input"
                  />
                </Field>

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
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Current phase</span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                      {caseStatus === "Open" ? "CPS active" : caseStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Post-closure continuity</span>
                    <span className="text-sm font-medium text-slate-900">Enabled</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Network self-management tools</span>
                    <span className="text-sm font-medium text-slate-900">Included</span>
                  </div>
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
                  value={caseStatus === "Open" ? "CPS Active" : caseStatus}
                  helper="Built to continue after formal closure"
                />
                <Metric
                  label="Network Members"
                  value={String(network.length)}
                  helper="Shared access for caregivers and network members"
                />
                <Metric
                  label="Plan Reliability"
                  value="82%"
                  helper="Based on recent monitoring and continuity entries"
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
                    <div>
                      <button className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700">
                        Save Case
                      </button>
                    </div>

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
                            value={familyName}
                            onChange={(e) => setFamilyName(e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Lead Practitioner">
                          <input
                            value={leadPractitioner}
                            onChange={(e) => setLeadPractitioner(e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Case Start Date">
                          <input
                            value={caseStartDate}
                            onChange={(e) => setCaseStartDate(e.target.value)}
                            className="input"
                          />
                        </Field>

                        <Field label="Case Status">
                          <select
                            value={caseStatus}
                            onChange={(e) => setCaseStatus(e.target.value)}
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

                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm text-slate-600">
                            Anna, primary caregiver. Current priorities include evening structure,
                            emotional support, and reliable backup coverage.
                          </p>
                          <div>
                            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50">
                              Add Caregiver
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Priority Snapshot">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="font-medium text-amber-900">Current Watchpoint</p>
                      <p className="mt-1 text-sm text-amber-800">
                        Evening routines become less reliable when caregiver stress rises.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-700">Plan Stability</p>
                      <div className="mt-3 space-y-2">
                        <ProgressBar value={82} />
                        <p className="text-sm text-slate-500">
                          Stable overall, but communication clarity needs improvement.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-700">Immediate actions</p>
                      {[
                        "Confirm backup for Thursday evening",
                        "Review escalation wording with caregiver",
                        "Schedule next fire drill",
                      ].map((item) => (
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
                  <div className="grid gap-4">
                    <Field label="Risk Statement">
                      <textarea
                        value={riskStatement}
                        onChange={(e) => setRiskStatement(e.target.value)}
                        className="textarea"
                      />
                    </Field>

                    <Field label="Safeguarding Goals">
                      <textarea
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
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
                        {safeguardingScale}/10
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={safeguardingScale}
                        onChange={(e) => setSafeguardingScale(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>0, Unsafe and unstable</span>
                        <span>10, Strong and sustainable safeguarding</span>
                      </div>
                      <ProgressBar value={safeguardingScale * 10} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Timeline Pathway">
                <div className="space-y-4">
                  {[
                    {
                      date: "Mar 30",
                      title: "Case opened and network companion file created",
                      helper: "Risk statement and first safeguarding goals entered.",
                    },
                    {
                      date: "Apr 01",
                      title: "Initial network meeting",
                      helper: "Roles drafted for evenings, school mornings, and backup response.",
                    },
                    {
                      date: "Apr 04",
                      title: "Formal review meeting",
                      helper: "Assess whether escalation wording is understood by all members.",
                    },
                    {
                      date: "Apr 10",
                      title: "Fire drill practice",
                      helper: "Test late-evening breakdown scenario and network response speed.",
                    },
                  ].map((item, index) => (
                    <div key={item.title} className="flex gap-4 rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                          {index + 1}
                        </div>
                        {index < 3 && <div className="mt-2 h-full w-px bg-slate-200" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">{item.date}</p>
                        <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.helper}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "network" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card title="Network Members & Roles">
                <div className="space-y-4">
                  {network.map((person) => (
                    <div key={person.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{person.name}</p>
                          <p className="text-sm text-slate-600">{person.role}</p>
                        </div>
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                          {person.availability}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Reliability</span>
                          <span className="font-medium text-slate-900">{person.reliability}%</span>
                        </div>
                        <ProgressBar value={person.reliability} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Network Gaps & Development">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Current gaps</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>• Weekend backup is not strong enough yet</li>
                      <li>• Escalation language needs to be simple and consistent</li>
                      <li>• One additional overnight support option is recommended</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Next network-building steps</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div>Confirm whether Norma can cover Saturday evenings</div>
                      <div>Add backup contact for school-day emergencies</div>
                      <div>Review network confidence in escalation process</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "planning" && (
            <Card title="Safeguarding Rules and Commitments">
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div key={rule.id} className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                            {rule.id}
                          </span>
                          <p className="font-medium text-slate-900">{rule.title}</p>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{rule.note}</p>
                      </div>
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                        {rule.status}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Primary owner</p>
                        <p className="mt-1 font-medium text-slate-900">{rule.owner}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Backup</p>
                        <p className="mt-1 font-medium text-slate-900">{rule.backup}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Check method</p>
                        <p className="mt-1 font-medium text-slate-900">
                          Text and evening confirmation
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          If it breaks down
                        </p>
                        <p className="mt-1 font-medium text-slate-900">Escalate to backup chain</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "monitoring" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card title="Monitoring Checklist">
                <div className="space-y-3">
                  {checklist.map((item, index) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-sm font-medium text-emerald-700">
                        {index + 1}
                      </div>
                      <span className="text-sm text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Fire Drill & Testing">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Next scenario</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Test late-evening loss of coverage and confirm whether the backup chain
                      responds within 30 minutes.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Scheduled date</p>
                      <p className="mt-1 font-medium text-slate-900">Apr 10, 2026</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Participants</p>
                      <p className="mt-1 font-medium text-slate-900">Anna, Karen, Mary, Lisa</p>
                    </div>
                  </div>

                  <button className="rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700">
                    Open fire drill record
                  </button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "closure" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card title="Closure Stage and Ongoing Safeguarding">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">CPS closure stage</p>
                    <p className="mt-2 text-sm text-slate-600">
                      This stage refers only to formal closure with the CPS organization. It marks
                      the end of statutory involvement, not the end of safeguarding work.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Network sustainability after closure</p>
                    <p className="mt-2 text-sm text-slate-600">
                      After CPS closes, the network continues monthly reviews, refreshes roles,
                      replaces lost capacity early, and keeps all core members clear about
                      commitments.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Ongoing safeguarding plan management</p>
                    <p className="mt-2 text-sm text-slate-600">
                      The app continues to support review, revision, and strengthening of the
                      safeguarding plan after closure so the family and network can adapt the plan
                      when circumstances change.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">
                      Communication, mitigation, and what-if scenarios
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Contact pathways, mitigation responses, and what-if scenarios remain live
                      after closure so the network knows how to respond when routines weaken or new
                      risks emerge.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">
                      Recording and ongoing safeguarding activity
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      After closure, the app still allows journaling, recording of events,
                      monitoring of commitments, and ongoing safeguarding activity so the network
                      can maintain consistency over time.
                    </p>
                  </div>
                </div>
              </Card>

              <Card title="Post-Closure Support Tools and Handover Pack">
                <div className="space-y-4">
                  <Field label="Recent entry">
                    <textarea
                      value={journalEntry}
                      onChange={(e) => setJournalEntry(e.target.value)}
                      className="textarea"
                    />
                  </Field>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Post-closure safeguarding tools</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <p>• Ongoing journal and observation log</p>
                      <p>• Shared communication and response pathways</p>
                      <p>• Sustainability review prompts</p>
                      <p>• What-if and mitigation scenario guidance</p>
                      <p>• Plan editing and update support after closure</p>
                      <p>• Ongoing monitoring of roles and commitments</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {[
                      "CPS closure summary",
                      "Final safeguarding plan at closure",
                      "Network sustainability plan",
                      "Communication and escalation pathway",
                      "Mitigation and what-if scenario library",
                      "Monitoring summary and continuity review dates",
                    ].map((doc) => (
                      <div
                        key={doc}
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                      >
                        {doc}
                      </div>
                    ))}
                  </div>

                  <button className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700">
                    Generate closure and ongoing safeguarding pack
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
