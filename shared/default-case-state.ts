import type { CaseState } from "./types";

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const defaultCaseState: CaseState = {
  workspaceName: "Family Safeguarding Workspace",
  workspaceMode: "Organization-managed access",
  currentPhaseLabel: "CPS active",
  postClosureContinuity: "Enabled",
  networkSelfManagementTools: "Included",
  caregiverSummary:
    "Primary caregiver is engaging with the plan and wants a practical network that can hold routines under pressure.",
  currentWatchpoint:
    "Evening transitions and rushed morning handovers are the weakest points when stress rises.",
  planStability: 78,
  immediateActionsText:
    "Confirm this week's backup coverage\nReview escalation wording with caregiver\nSchedule a fire-drill check",
  riskStatement:
    "Children are at greatest risk when routines break down quickly, pressure escalates, and the network does not activate early enough.",
  safeguardingGoals:
    "Children are supervised reliably, safeguarding roles are understood, and the network can respond early when routines weaken or a plan begins to drift.",
  safeguardingScale: 7,
  timelineEntries: [
    {
      id: makeId("timeline"),
      date: "2026-04-01",
      title: "Case opened",
      helper: "Initial case record created and access assigned to the core team.",
    },
    {
      id: makeId("timeline"),
      date: "2026-04-03",
      title: "Network planning meeting",
      helper: "Roles drafted for mornings, evenings, and escalation cover.",
    },
  ],
  networkMembers: [
    {
      id: makeId("network"),
      name: "Primary caregiver",
      relationship: "Caregiver",
      role: "Day-to-day care and escalation contact",
      availability: "Daily",
      phone: "",
      email: "",
      reliability: 8,
      confirmed: true,
    },
  ],
  currentGapsText:
    "Weekend backup still needs confirmation\nEscalation wording must remain simple and consistent",
  nextNetworkStepsText:
    "Confirm one additional backup contact\nReview same-day escalation plan with all active members",
  rules: [
    {
      id: makeId("rule"),
      title: "Children are supervised at all key routine points",
      owner: "Caregiver",
      backup: "Network backup",
      status: "Needs review",
      note: "Morning handovers still need explicit ownership.",
      checkMethod: "Text confirmation and weekly review",
      breakdownPlan: "Escalate to backup contact and record the same-day change.",
    },
  ],
  monitoringItems: [
    { id: makeId("monitor"), text: "Roles are being carried out as agreed", checked: false },
    { id: makeId("monitor"), text: "Escalation language is understood by everyone", checked: false },
    { id: makeId("monitor"), text: "Backups stay clear during routine changes", checked: false },
  ],
  fireDrillScenario:
    "Test what happens if the planned support drops out on a pressured evening and the network must activate the backup chain.",
  fireDrillDate: "",
  fireDrillParticipants: "",
  fireDrillRecordNotes: "",
  closureAlertNote:
    "When CPS closes the case, workers will lose case access automatically. Caregivers and active network members retain ongoing safeguarding access.",
  closureAppointments: [],
  closureActionItems: [
    {
      id: makeId("closure-action"),
      title: "Confirm post-closure review rhythm",
      owner: "Supervisor",
      status: "Planned",
    },
  ],
  planAdaptationText:
    "Review whether the safeguarding plan still fits daily life, whether named roles remain realistic, and whether any part of the plan has become symbolic rather than dependable.",
  communicationMitigationText:
    "Primary route is direct contact between caregiver and named supports. If the plan weakens, activate the backup chain immediately and record the decision in the journal.",
  urgentCpsContactText:
    "Contact CPS urgently if supervision cannot be maintained, if a child is harmed or newly at risk of harm, or if the network cannot restore safety quickly.",
  closureJournalText:
    "The shared journal remains available after closure to support ongoing safeguarding, record changes, and track how the network is holding the plan over time.",
  changeLog: [],
};

export function cloneDefaultCaseState(): CaseState {
  return JSON.parse(JSON.stringify(defaultCaseState)) as CaseState;
}
