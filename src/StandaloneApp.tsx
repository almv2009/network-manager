import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBillingPlans, startBillingCheckout, submitAlternativePaymentRequest, submitSupportTicket } from "./api";
import { BillingModal } from "./components/BillingModal";
import { SupportModal } from "./components/SupportModal";
import type {
  AlternativePaymentMethod,
  AlternativePaymentRequestPayload,
  BillingCheckoutPayload,
  NetworkBillingPlanOption,
  SupportTicketPayload,
} from "../shared/types";
import { getBillingPlanCatalog } from "../shared/billing-plans";

export type TabKey =
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

type PlanningPhaseKey = "immediate" | "intermediate" | "longTerm";
type PlanningPhaseStatus = "Active" | "Completed";
type RegionalVariant = "northAmerica" | "uk";
type DocumentAccessMode = "allConfirmed" | "selectedMembers";

type PlanningSnapshot = {
  id: string;
  savedAt: string;
  summary: string;
  actions: string;
  members: string;
  reviewDate: string;
};

type PlanningLayer = {
  heading: string;
  purpose: string;
  status: PlanningPhaseStatus;
  actions: string;
  members: string;
  reviewDate: string;
  promotedAt?: string;
  snapshots: PlanningSnapshot[];
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
  generatedFromLabel?: string;
  generatedFromPhase?: PlanningPhaseKey;
  accessMode: DocumentAccessMode;
  allowedMemberIds: string[];
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

export type AppData = {
  workspaceName: string;
  workspaceMode: string;
  currentPhaseLabel: string;
  postClosureContinuity: string;
  networkSelfManagementTools: string;
  familyManagedHandoverStatus: "not_started" | "planned" | "active";
  familyManagedHandoverLeadMembershipId: string;
  familyManagedHandoverLeadName: string;
  familyManagedHandoverLeadRole: "" | "caregiver" | "network_member";
  familyManagedHandoverActivatedAt: string;
  familyManagedHandoverNotes: string;
  regionalVariant: RegionalVariant;

  caseStatus: string;
  familyName: string;
  motherName: string;
  fatherName: string;
  childrenNames: string;
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
  currentPlanningPhase: PlanningPhaseKey;
  immediatePlan: PlanningLayer;
  intermediatePlan: PlanningLayer;
  longTermPlan: PlanningLayer;

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

export type EnterpriseWorkspaceDocument = {
  id: string;
  fileName: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
};

export type EnterpriseWorkspaceJournalEntry = {
  id: string;
  author: string;
  audience: string;
  message: string;
  timestamp: string;
};

export type StandaloneAppProps = {
  mode?: "standalone" | "enterprise";
  initialData?: Partial<AppData> | null;
  initialTab?: TabKey;
  canEdit?: boolean;
  canPostJournal?: boolean;
  canUploadDocuments?: boolean;
  supportEmail?: string;
  showSupportAndBilling?: boolean;
  externalDocuments?: EnterpriseWorkspaceDocument[];
  externalJournalEntries?: EnterpriseWorkspaceJournalEntry[];
  deletingExternalDocumentId?: string;
  onSaveSection?: (sectionName: string, nextData: AppData) => Promise<string | void> | string | void;
  onPostJournalEntry?: (payload: {
    author: string;
    audience: string;
    message: string;
    urgency: JournalUrgency;
    notifyTarget: JournalNotifyTarget;
  }) => Promise<string | void> | string | void;
  onUploadDocuments?: (files: File[]) => Promise<string | void> | string | void;
  onDeleteExternalDocument?: (documentId: string, fileName: string) => Promise<string | void> | string | void;
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

const CAREGIVER_ROLE_ASSIGNMENT_OPTIONS = [
  "Long Term Safeguarding",
  "Short Term Safeguarding",
  "Long Term Support",
  "Short Term Support",
] as const;

type RegionalCopy = {
  label: string;
  subtitle: string;
  viewBadge: string;
  leadPractitionerLabel: string;
  caregiverSummaryLabel: string;
  closureDocumentsLabel: string;
  serviceShortLabel: string;
  serviceLongLabel: string;
  currentCasePhaseMetricLabel: string;
  currentCasePhaseMetricHelper: string;
  confirmedNetworkMembersMetricLabel: string;
  confirmedNetworkMembersMetricHelper: string;
  activePlanMetricLabel: string;
  planEffectivenessMetricLabel: string;
  networkReadinessMetricLabel: string;
  networkReadinessMetricHelper: string;
  caseOverviewTitle: string;
  caseStatusFieldLabel: string;
  familyNameFieldLabel: string;
  caseStartDateFieldLabel: string;
  currentPlanEffectivenessMetricHelper: string;
  currentPlanEffectivenessTitle: string;
  currentPlanEffectivenessDescription: string;
  currentPlanEffectivenessTrackingPrefix: string;
  currentPlanEffectivenessMin: string;
  currentPlanEffectivenessMax: string;
  confirmedNetworkMembersTitle: string;
  confirmedNetworkMembersDescription: string;
  confirmedNetworkMembersEmpty: string;
  priorityAlertsTitle: string;
  priorityAlertsDescription: string;
  priorityAlertsSecondaryDescription?: string;
  noOpenAlertsText: string;
  watchpointLabel: string;
  timelineTitle: string;
  timelinePathwayTitle: string;
  addTimelineEntryLabel: string;
  safeguardingScaleTitle: string;
  safeguardingScaleDescription: string;
  safeguardingScaleMin: string;
  safeguardingScaleMax: string;
  networkSectionDescription: string;
  networkPersonDefaultName: string;
  networkPersonDefaultRole: string;
  networkReliabilityTitle: string;
  networkReliabilityInstruction: string;
  networkReliabilityDescription: string;
  networkReliabilityMin: string;
  networkReliabilityMax: string;
  networkGapStepsTitle: string;
  closureDocumentsDescription: string;
  closureStatusLabels: Record<AppData["caseClosureStatus"], string>;
  urgentReviewDefaultText: string;
};

const REGIONAL_COPY: Record<RegionalVariant, RegionalCopy> = {
  northAmerica: {
    label: "North America",
    subtitle:
      "A working safeguarding, continuity, and self-management tool for one family, their network, and supporting professionals.",
    viewBadge: "North America language",
    leadPractitionerLabel: "Lead worker",
    caregiverSummaryLabel: "Caregiver summary",
    closureDocumentsLabel: "Closure Documents",
    serviceShortLabel: "CPS",
    serviceLongLabel: "Child Protective Services",
    currentCasePhaseMetricLabel: "Current Case Phase",
    currentCasePhaseMetricHelper: "Built to continue after formal closure",
    confirmedNetworkMembersMetricLabel: "Confirmed Network Members",
    confirmedNetworkMembersMetricHelper: "Auto-populated from the Network Building tab",
    activePlanMetricLabel: "Active Safeguarding Plan",
    planEffectivenessMetricLabel: "Plan Stability",
    networkReadinessMetricLabel: "Continuity Readiness",
    networkReadinessMetricHelper: "Average willingness, ability, and confidence across confirmed members",
    caseOverviewTitle: "Case Overview",
    caseStatusFieldLabel: "Case status",
    familyNameFieldLabel: "Family name",
    caseStartDateFieldLabel: "Case start date",
    currentPlanEffectivenessMetricHelper:
      "Current judgement of how stable and dependable the active plan is right now.",
    currentPlanEffectivenessTitle: "Current Plan Stability",
    currentPlanEffectivenessDescription:
      "Current judgement of how stable and dependable the active plan is right now.",
    currentPlanEffectivenessTrackingPrefix: "Tracking:",
    currentPlanEffectivenessMin: "0, Unstable",
    currentPlanEffectivenessMax: "10, Strong and dependable",
    confirmedNetworkMembersTitle: "Confirmed Network Members",
    confirmedNetworkMembersDescription:
      "This section updates automatically from confirmed entries in the Network Building tab.",
    confirmedNetworkMembersEmpty: "No confirmed network members yet.",
    priorityAlertsTitle: "Priority Alerts and Outstanding Actions",
    priorityAlertsDescription:
      "This box pulls together unresolved work from across the app. It is now kept at the bottom of the main tab and shown in a compact scroll area so it stays available without overwhelming the page.",
    noOpenAlertsText: "No open alerts are being pulled from the rest of the app right now.",
    watchpointLabel: "Watchpoint",
    timelineTitle: "Timeline",
    timelinePathwayTitle: "Timeline Pathway",
    addTimelineEntryLabel: "Add timeline entry",
    safeguardingScaleTitle: "Safeguarding Scale",
    safeguardingScaleDescription: "Current shared judgement of safeguarding strength and reliability.",
    safeguardingScaleMin: "0, Unsafe and unstable",
    safeguardingScaleMax: "10, Strong and sustainable safeguarding",
    networkSectionDescription:
      "Confirmed network members automatically appear on the main Case Status page with their contact details.",
    networkPersonDefaultName: "New network member",
    networkPersonDefaultRole: "Role not entered yet",
    networkReliabilityTitle: "Willingness / Ability / Confidence",
    networkReliabilityInstruction: "Rate each confirmed member from 0 to 10.",
    networkReliabilityDescription:
      "How willing, able, and confident is this person to take on and carry out a clear role within the network?",
    networkReliabilityMin: "0, Not ready or able",
    networkReliabilityMax: "10, Highly ready and dependable",
    networkGapStepsTitle: "Current Gaps & Next Network Steps",
    closureDocumentsDescription:
      "Upload or list all relevant closure documents and decide which confirmed network members should be able to access each one after formal service closure.",
    closureStatusLabels: {
      "CPS active": "Safeguarding active",
      "Closure planned": "Closure planned",
      "Closed to CPS": "Closed to service",
      "Urgent CPS review": "Urgent safeguarding review",
    },
    urgentReviewDefaultText: "The case has been flagged for urgent safeguarding review.",
  },
  uk: {
    label: "United Kingdom",
    subtitle:
      "A working safeguarding, continuity, and self-management tool for one family, their network, and supporting practitioners.",
    viewBadge: "UK language",
    leadPractitionerLabel: "Family Group Decision Making Co-ordinator",
    caregiverSummaryLabel: "Summary of why this family are open right now",
    closureDocumentsLabel: "Closure Documents",
    serviceShortLabel: "CSC",
    serviceLongLabel: "Children’s Social Care",
    currentCasePhaseMetricLabel: "Current Case Phase",
    currentCasePhaseMetricHelper: "Built to continue after formal closure",
    confirmedNetworkMembersMetricLabel: "Confirmed Network Members",
    confirmedNetworkMembersMetricHelper: "Auto-populated from the Network Building tab",
    activePlanMetricLabel: "Immediate safety plan",
    planEffectivenessMetricLabel: "Plan Effectiveness",
    networkReadinessMetricLabel: "Network Readiness",
    networkReadinessMetricHelper:
      "Current shared judgement of how ready, reliable, and workable the network is in supporting the child’s safeguarding.",
    caseOverviewTitle: "Case overview",
    caseStatusFieldLabel: "Case status",
    familyNameFieldLabel: "Family name",
    caseStartDateFieldLabel: "Case start date",
    currentPlanEffectivenessMetricHelper:
      "Current judgement of how well the plan is achieving safety and well-being for the child at this time.",
    currentPlanEffectivenessTitle: "Plan Effectiveness",
    currentPlanEffectivenessDescription:
      "Current judgement of how well the plan is achieving safety and well-being for the child at this time.",
    currentPlanEffectivenessTrackingPrefix: "Tracking:",
    currentPlanEffectivenessMin: "0, Not effective",
    currentPlanEffectivenessMax: "10, Very effective",
    confirmedNetworkMembersTitle: "Confirmed Network Members",
    confirmedNetworkMembersDescription:
      "This section updates automatically from confirmed entries in the Network Building tab.",
    confirmedNetworkMembersEmpty: "No confirmed network members yet.",
    priorityAlertsTitle: "Priority Alerts and Outstanding Actions",
    priorityAlertsDescription: "This section supports oversight by highlighting key alerts and outstanding actions.",
    priorityAlertsSecondaryDescription:
      "Includes watchpoints, unresolved actions, and other items needing attention.",
    noOpenAlertsText: "No open alerts are being pulled from the rest of the app right now.",
    watchpointLabel: "When things become more difficult",
    timelineTitle: "Timeline",
    timelinePathwayTitle: "Timeline & steps",
    addTimelineEntryLabel: "Add timeline entry",
    safeguardingScaleTitle: "Safeguarding Scale",
    safeguardingScaleDescription:
      "Current shared judgement of the strength and reliability of the safeguarding plan and network.",
    safeguardingScaleMin: "0, A weak or unreliable safeguarding plan and network that are not yet keeping the child safe",
    safeguardingScaleMax: "10, A strong, reliable network and safeguarding plan that work together and adapt to challenges",
    networkSectionDescription:
      "Confirmed network members automatically appear on the main Case Status page with their contact details.",
    networkPersonDefaultName: "Potential network member",
    networkPersonDefaultRole: "Role not entered yet",
    networkReliabilityTitle: "Willingness, ability, and confidence",
    networkReliabilityInstruction: "Rate each person who may be part of the network from 0 to 10.",
    networkReliabilityDescription:
      "How willing, able, and confident is this person to take on and carry out a clear role within the network?",
    networkReliabilityMin: "0, Not willing, able, or confident to take on a network role",
    networkReliabilityMax: "10, Fully willing, able, and confident to take on a clear network role",
    networkGapStepsTitle: "Current Gaps & Next Network Steps",
    closureDocumentsDescription:
      "Upload or list all relevant closure documents and decide which confirmed network members should be able to access each one after Children’s Social Care closure.",
    closureStatusLabels: {
      "CPS active": "CSC active",
      "Closure planned": "Closure planned",
      "Closed to CPS": "Closed to CSC",
      "Urgent CPS review": "Urgent CSC review",
    },
    urgentReviewDefaultText: "The case has been flagged for urgent CSC review.",
  },
};

const PLANNING_PHASE_LABELS: Record<RegionalVariant, Record<PlanningPhaseKey, string>> = {
  northAmerica: {
    immediate: "Immediate safeguarding plan",
    intermediate: "Intermediate Safeguarding Plan",
    longTerm: "Final Safeguarding Plan",
  },
  uk: {
    immediate: "Immediate safety plan",
    intermediate: "Intermediate safeguarding plan",
    longTerm: "Final safeguarding plan",
  },
};

const PLANNING_LAYER_HEADINGS: Record<RegionalVariant, Record<PlanningPhaseKey, string>> = {
  northAmerica: {
    immediate: "Immediate safeguarding plan",
    intermediate: "Intermediate Safeguarding Plan",
    longTerm: "Final Safeguarding Plan",
  },
  uk: {
    immediate: "Safeguarding planning stage",
    intermediate: "Intermediate safeguarding plan",
    longTerm: "Final safeguarding plan",
  },
};

function getPlanningPhaseLabel(phase: PlanningPhaseKey, regionalVariant: RegionalVariant = "northAmerica") {
  return PLANNING_PHASE_LABELS[regionalVariant][phase];
}

function getLocalizedPlanningHeading(heading: string, phase: PlanningPhaseKey, regionalVariant: RegionalVariant) {
  const trimmedHeading = heading.trim();
  const knownHeadings = new Set<string>([
    ...Object.values(PLANNING_PHASE_LABELS.northAmerica),
    ...Object.values(PLANNING_PHASE_LABELS.uk),
    ...Object.values(PLANNING_LAYER_HEADINGS.northAmerica),
    ...Object.values(PLANNING_LAYER_HEADINGS.uk),
  ]);
  if (knownHeadings.has(trimmedHeading)) {
    return PLANNING_LAYER_HEADINGS[regionalVariant][phase];
  }
  return heading;
}

function getLocalizedClosureStatusLabel(status: AppData["caseClosureStatus"], regionalCopy: RegionalCopy) {
  return regionalCopy.closureStatusLabels[status];
}

function getLocalizedCurrentPhaseLabel(label: string, regionalCopy: RegionalCopy) {
  const statusEntries = Object.entries(regionalCopy.closureStatusLabels);
  const matchedStatus = statusEntries.find(([status]) => status === label)?.[1];
  if (matchedStatus) return matchedStatus;
  if (regionalCopy.serviceShortLabel === "CSC") {
    return label.replace(/\bCPS\b/g, regionalCopy.serviceShortLabel);
  }
  return label;
}

function localizeServiceReferences(text: string, regionalCopy: RegionalCopy) {
  if (!text) return text;
  if (regionalCopy.serviceShortLabel !== "CSC") return text;

  return text
    .replace(/\bChild Protective Services\b/g, regionalCopy.serviceLongLabel)
    .replace(/\bFormal CPS closure\b/g, `Formal ${regionalCopy.serviceLongLabel} closure`)
    .replace(/\bCPS\b/g, regionalCopy.serviceShortLabel);
}

const PLANNING_GUIDANCE: Record<
  PlanningPhaseKey | "history",
  { title: string; points: string[] }
> = {
  immediate: {
    title: "How to use immediate safety",
    points: [
      "Use this phase for what must happen today or tonight so the child is safe right now.",
      "Record specific actions, who is doing them, and what should happen if the first arrangement breaks down.",
      "Use the save option to capture time-stamped day-to-day changes or short-term updates."
    ],
  },
  intermediate: {
    title: "How to use the intermediate plan",
    points: [
      "Use this phase to bridge from the urgent response into a more stable safeguarding arrangement.",
      "Record the routines, roles, and safeguards that need to hold over the next days and weeks.",
      "Keep the focus on tested arrangements, not just hopeful support or general intention."
    ],
  },
  longTerm: {
    title: "How to use the final safeguarding plan",
    points: [
      "Use this phase for the enduring safeguarding arrangements that should still hold after closure.",
      "Record what will be monitored, who carries each role, and what the escalation route is if the plan weakens.",
      "Only treat this as complete when the safeguarding arrangements are stable, realistic, and resilient."
    ],
  },
  history: {
    title: "How to use retained history",
    points: [
      "Retained history keeps an auditable record of earlier plans and immediate-safety snapshots.",
      "Use it to show how the planning changed over time and what was in place on specific dates.",
      "This section is for review and record-keeping, not for reopening work through a separate history control."
    ],
  },
};

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

function normalizePlanningLayer(item: Partial<PlanningLayer> | undefined, fallback: PlanningLayer): PlanningLayer {
  const status = item?.status === "Completed" ? "Completed" : "Active";
  return {
    heading: item?.heading || fallback.heading,
    purpose: item?.purpose || fallback.purpose,
    status,
    actions: item?.actions || fallback.actions,
    members: item?.members || fallback.members,
    reviewDate: item?.reviewDate || fallback.reviewDate,
    promotedAt: item?.promotedAt,
    snapshots: Array.isArray(item?.snapshots)
      ? item.snapshots.map((snapshot) => normalizePlanningSnapshot(snapshot))
      : fallback.snapshots,
  };
}

function normalizePlanningSnapshot(item: Partial<PlanningSnapshot>): PlanningSnapshot {
  return {
    id: item.id || makeId("planning-snapshot"),
    savedAt: item.savedAt || nowStamp(),
    summary: item.summary || "Saved update",
    actions: item.actions || "",
    members: item.members || "",
    reviewDate: item.reviewDate || "",
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

function normalizeClosureDocument(item: Partial<DocumentItem>): DocumentItem {
  return {
    id: item.id || makeId("doc"),
    name: item.name || "",
    generatedFromLabel: item.generatedFromLabel,
    generatedFromPhase: item.generatedFromPhase,
    accessMode: item.accessMode === "selectedMembers" ? "selectedMembers" : "allConfirmed",
    allowedMemberIds: Array.isArray(item.allowedMemberIds)
      ? item.allowedMemberIds.map((memberId) => String(memberId)).filter(Boolean)
      : [],
  };
}

function mergeDistinctSegments(first: string, second: string, splitPattern: RegExp) {
  return Array.from(
    new Set(
      [first, second]
        .flatMap((value) => String(value || "").split(splitPattern))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).join(splitPattern.source.includes(",") ? ", " : "\n");
}

function summarizePlanningActions(actions: string) {
  return splitLines(actions).slice(0, 4);
}

function buildPlanningSnapshotDocumentName(
  layer: PlanningLayer,
  phase: PlanningPhaseKey,
  regionalVariant: RegionalVariant = "northAmerica",
) {
  const phaseLabel = getPlanningPhaseLabel(phase, regionalVariant);
  const dateLabel = layer.promotedAt || layer.reviewDate || nowStamp();
  return `${phaseLabel} snapshot - ${dateLabel}`;
}

function getPlanningField(phase: PlanningPhaseKey) {
  return { immediate: "immediatePlan", intermediate: "intermediatePlan", longTerm: "longTermPlan" }[phase] as
    | "immediatePlan"
    | "intermediatePlan"
    | "longTermPlan";
}

function getNextPlanningPhase(phase: PlanningPhaseKey) {
  if (phase === "immediate") return "intermediate";
  if (phase === "intermediate") return "longTerm";
  return null;
}

function getPreviousPlanningPhase(phase: PlanningPhaseKey) {
  if (phase === "longTerm") return "intermediate";
  if (phase === "intermediate") return "immediate";
  return null;
}

const defaultData: AppData = {
  workspaceName: "Miller Family Workspace",
  workspaceMode: "Shared family and network access",
  currentPhaseLabel: "Safeguarding active",
  postClosureContinuity: "Enabled",
  networkSelfManagementTools: "Included",
  familyManagedHandoverStatus: "not_started",
  familyManagedHandoverLeadMembershipId: "",
  familyManagedHandoverLeadName: "",
  familyManagedHandoverLeadRole: "",
  familyManagedHandoverActivatedAt: "",
  familyManagedHandoverNotes: "",
  regionalVariant: "northAmerica",

  caseStatus: "Open",
  familyName: "Miller Family",
  motherName: "Anna Miller",
  fatherName: "Michael Miller",
  childrenNames: "Liam Miller\nMia Miller",
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

  currentPlanningPhase: "immediate",
  immediatePlan: {
    heading: "Immediate safeguarding plan",
    purpose: "What must happen right now so the children are safe today or tonight.",
    status: "Active",
    actions: `Karen confirms this evening coverage
Mary remains available as overnight backup
Anna sends an early warning text if routines begin to weaken`,
    members: "Karen, Mary, Anna",
    reviewDate: "2026-04-02",
    snapshots: [],
  },
  intermediatePlan: {
    heading: "Intermediate Safeguarding Plan",
    purpose: "The bridge between the immediate response and the long-term safeguarding plan.",
    status: "Active",
    actions: `Add weekend backup cover
Clarify the escalation wording for all network members
Confirm short-term routines for school mornings and evenings`,
    members: "Karen, Mary, Lisa, Anna",
    reviewDate: "2026-04-10",
    snapshots: [],
  },
  longTermPlan: {
    heading: "Final Safeguarding Plan",
    purpose: "The enduring safeguarding arrangements that remain in place after closure.",
    status: "Active",
    actions: `Agree durable safeguarding rules
Confirm long-term network roles
Build review and contingency arrangements for post-closure safeguarding`,
    members: "Anna, Karen, Mary, Lisa, wider network",
    reviewDate: "2026-05-02",
    snapshots: [],
  },

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
    "Formal service closure is approaching. The network must confirm ongoing review dates, responsibilities, and escalation expectations before closure is completed.",
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
    { id: makeId("doc"), name: "Closure summary", accessMode: "allConfirmed", allowedMemberIds: [] },
    { id: makeId("doc"), name: "Final safeguarding plan at closure", accessMode: "allConfirmed", allowedMemberIds: [] },
    { id: makeId("doc"), name: "Network sustainability plan", accessMode: "allConfirmed", allowedMemberIds: [] },
    { id: makeId("doc"), name: "Communication and escalation pathway", accessMode: "allConfirmed", allowedMemberIds: [] },
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

const enterpriseBlankData: AppData = {
  ...defaultData,
  workspaceName: "",
  workspaceMode: "",
  currentPhaseLabel: "",
  postClosureContinuity: "",
  networkSelfManagementTools: "",
  caseStatus: "Open",
  familyName: "",
  motherName: "",
  fatherName: "",
  childrenNames: "",
  leadPractitioner: "",
  caseStartDate: "",
  caregiverSummary: "",
  currentWatchpoint: "",
  planStability: 0,
  immediateActionsText: "",
  riskStatement: "",
  safeguardingGoals: "",
  safeguardingScale: 0,
  timelineEntries: [],
  networkMembers: [],
  currentGapsText: "",
  nextNetworkStepsText: "",
  nextNetworkSteps: [],
  currentPlanningPhase: "immediate",
  immediatePlan: {
    heading: "",
    purpose: "",
    status: "Active",
    actions: "",
    members: "",
    reviewDate: "",
    snapshots: [],
  },
  intermediatePlan: {
    heading: "",
    purpose: "",
    status: "Active",
    actions: "",
    members: "",
    reviewDate: "",
    snapshots: [],
  },
  longTermPlan: {
    heading: "",
    purpose: "",
    status: "Active",
    actions: "",
    members: "",
    reviewDate: "",
    snapshots: [],
  },
  rules: [],
  planAdaptations: [],
  monitoringItems: [],
  fireDrills: [],
  caseClosureStatus: "CPS active",
  closureAlertNote: "",
  closureAppointments: [],
  closureActionItems: [],
  closureDocuments: [],
  journalEntryAuthor: "",
  journalEntryAudience: "All network members and caregivers",
  journalEntryText: "",
  journalEntryUrgency: "Routine",
  journalNotifyTarget: "Network and caregivers",
  journalEntries: [],
};

export function normalizeAppData(
  parsed: (Partial<AppData> & Record<string, unknown>) | null | undefined,
  defaults: AppData = defaultData,
): AppData {
  const source = parsed || {};
  const nextNetworkSteps = normalizeNextNetworkSteps(
    source.nextNetworkSteps,
    String(source.nextNetworkStepsText ?? defaults.nextNetworkStepsText),
  );
  const legacyFireDrills = source.fireDrills as Partial<FireDrillItem>[] | undefined;
  const fallbackFireDrills =
    legacyFireDrills && legacyFireDrills.length
      ? legacyFireDrills.map((item) => normalizeFireDrill(item))
      : defaults.fireDrills.length
        ? [
            normalizeFireDrill({
              scenario: String(source.fireDrillScenario ?? defaults.fireDrills[0]?.scenario ?? ""),
              date: String(source.fireDrillDate ?? defaults.fireDrills[0]?.date ?? ""),
              participants: String(source.fireDrillParticipants ?? defaults.fireDrills[0]?.participants ?? ""),
              notes: String(source.fireDrillRecordNotes ?? ""),
              status: "Pending",
            }),
          ]
        : [];

  return {
    ...defaults,
    ...source,
    familyManagedHandoverStatus:
      source.familyManagedHandoverStatus === "planned" || source.familyManagedHandoverStatus === "active"
        ? source.familyManagedHandoverStatus
        : defaults.familyManagedHandoverStatus,
    familyManagedHandoverLeadMembershipId: String(
      source.familyManagedHandoverLeadMembershipId ?? defaults.familyManagedHandoverLeadMembershipId,
    ),
    familyManagedHandoverLeadName: String(source.familyManagedHandoverLeadName ?? defaults.familyManagedHandoverLeadName),
    familyManagedHandoverLeadRole:
      source.familyManagedHandoverLeadRole === "caregiver" || source.familyManagedHandoverLeadRole === "network_member"
        ? source.familyManagedHandoverLeadRole
        : defaults.familyManagedHandoverLeadRole,
    familyManagedHandoverActivatedAt: String(
      source.familyManagedHandoverActivatedAt ?? defaults.familyManagedHandoverActivatedAt,
    ),
    familyManagedHandoverNotes: String(source.familyManagedHandoverNotes ?? defaults.familyManagedHandoverNotes),
    motherName: String(source.motherName ?? defaults.motherName),
    fatherName: String(source.fatherName ?? defaults.fatherName),
    childrenNames: String(source.childrenNames ?? defaults.childrenNames),
    planStability: clampScale(Number(source.planStability ?? defaults.planStability)),
    safeguardingScale: clampScale(Number(source.safeguardingScale ?? defaults.safeguardingScale)),
    timelineEntries: (source.timelineEntries as TimelineEntry[]) ?? defaults.timelineEntries,
    networkMembers: ((source.networkMembers as Partial<NetworkMember>[]) ?? defaults.networkMembers).map(normalizeNetworkMember),
    nextNetworkStepsText:
      source.nextNetworkStepsText && String(source.nextNetworkStepsText).trim()
        ? String(source.nextNetworkStepsText)
        : serializeNextNetworkSteps(nextNetworkSteps),
    nextNetworkSteps,
    currentPlanningPhase:
      (source.currentPlanningPhase as PlanningPhaseKey) ||
      (source.caseClosureStatus === "Closed to CPS" ? "longTerm" : defaults.currentPlanningPhase),
    immediatePlan: normalizePlanningLayer(source.immediatePlan as Partial<PlanningLayer> | undefined, {
      ...defaults.immediatePlan,
      actions: String(source.immediateActionsText ?? defaults.immediatePlan.actions),
    }),
    intermediatePlan: normalizePlanningLayer(source.intermediatePlan as Partial<PlanningLayer> | undefined, defaults.intermediatePlan),
    longTermPlan: normalizePlanningLayer(source.longTermPlan as Partial<PlanningLayer> | undefined, defaults.longTermPlan),
    rules: ((source.rules as Partial<RuleItem>[]) ?? defaults.rules).map(normalizeRule),
    planAdaptations: ((source.planAdaptations as Partial<PlanAdaptationItem>[]) ?? defaults.planAdaptations).map(normalizePlanAdaptation),
    monitoringItems: (source.monitoringItems as MonitoringItem[]) ?? defaults.monitoringItems,
    fireDrills: fallbackFireDrills,
    closureAppointments: ((source.closureAppointments as Partial<AppointmentItem>[]) ?? defaults.closureAppointments).map(normalizeAppointment),
    closureActionItems: ((source.closureActionItems as Partial<ActionItem>[]) ?? defaults.closureActionItems).map(normalizeActionItem),
    closureDocuments: (
      ((source.closureDocuments as Partial<DocumentItem>[]) ??
        ((source.handoverDocs as Partial<DocumentItem>[]) || defaults.closureDocuments)) as Partial<DocumentItem>[]
    ).map(normalizeClosureDocument),
    journalEntries: ((source.journalEntries as Partial<JournalEntry>[]) ?? defaults.journalEntries).map(normalizeJournalEntry),
    journalEntryUrgency: (source.journalEntryUrgency as JournalUrgency) || defaults.journalEntryUrgency,
    journalNotifyTarget: (source.journalNotifyTarget as JournalNotifyTarget) || defaults.journalNotifyTarget,
  };
}

function loadInitialData(): AppData {
  if (typeof window === "undefined") return normalizeAppData(undefined);
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeAppData(undefined);
  try {
    return normalizeAppData(JSON.parse(raw) as Partial<AppData> & Record<string, unknown>);
  } catch {
    return normalizeAppData(undefined);
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
    <section className="app-card rounded-3xl border shadow-sm">
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
    <div className="app-metric rounded-3xl border p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function SaveBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="app-banner rounded-2xl border px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="app-secondary-button rounded-xl border bg-white px-3 py-1 text-xs font-medium"
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
  disabled = false,
}: {
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="app-primary-button rounded-2xl px-4 py-3 font-medium transition"
      >
        {saveLabel}
      </button>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="app-secondary-button rounded-2xl border bg-white px-4 py-3 font-medium transition"
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

function GuidanceNote({ title, points }: { title: string; points: string[] }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
        {title}
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
        <div className="space-y-2">
          {points.map((point) => (
            <p key={point}>{point}</p>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function StandaloneApp({
  mode = "standalone",
  initialData = null,
  initialTab = "case-status",
  canEdit = true,
  canPostJournal = true,
  canUploadDocuments = true,
  supportEmail,
  showSupportAndBilling,
  externalDocuments = [],
  externalJournalEntries = [],
  deletingExternalDocumentId = "",
  onSaveSection,
  onPostJournalEntry,
  onUploadDocuments,
  onDeleteExternalDocument,
}: StandaloneAppProps = {}) {
  const enterpriseMode = mode === "enterprise";
  const canEditState = enterpriseMode ? canEdit !== false : true;
  const canPostSharedJournal = enterpriseMode ? canPostJournal !== false : true;
  const canUploadCaseDocuments = enterpriseMode ? canUploadDocuments !== false : true;
  const showCommercialTools = showSupportAndBilling ?? !enterpriseMode;
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [data, setData] = useState<AppData>(() =>
    enterpriseMode
      ? normalizeAppData((initialData || undefined) as Partial<AppData> & Record<string, unknown>, enterpriseBlankData)
      : loadInitialData(),
  );
  const [banner, setBanner] = useState("");
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportErrorMessage, setSupportErrorMessage] = useState("");
  const [supportStatusMessage, setSupportStatusMessage] = useState("");
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingPlans, setBillingPlans] = useState<NetworkBillingPlanOption[]>(
    getBillingPlanCatalog().map((plan) => ({ ...plan, availableForCheckout: false }))
  );
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [alternativePaymentsEnabled, setAlternativePaymentsEnabled] = useState(true);
  const [allowedAlternativePaymentMethods, setAllowedAlternativePaymentMethods] = useState<AlternativePaymentMethod[]>([
    "wise",
    "e_transfer",
    "cheque",
    "eft",
  ]);
  const [billingCheckoutSubmitting, setBillingCheckoutSubmitting] = useState(false);
  const [billingAlternativeSubmitting, setBillingAlternativeSubmitting] = useState(false);
  const [billingCheckoutErrorMessage, setBillingCheckoutErrorMessage] = useState("");
  const [billingCheckoutStatusMessage, setBillingCheckoutStatusMessage] = useState("");
  const [billingAlternativeErrorMessage, setBillingAlternativeErrorMessage] = useState("");
  const [billingAlternativeStatusMessage, setBillingAlternativeStatusMessage] = useState("");
  const [sectionSavePending, setSectionSavePending] = useState("");
  const [documentUploadPending, setDocumentUploadPending] = useState(false);
  const [planningDetailPhase, setPlanningDetailPhase] = useState<PlanningPhaseKey>(
    data.caseClosureStatus === "Closed to CPS" ? "longTerm" : data.currentPlanningPhase,
  );
  const [planningSnapshotDrafts, setPlanningSnapshotDrafts] = useState<Record<PlanningPhaseKey, string>>({
    immediate: "",
    intermediate: "",
    longTerm: "",
  });
  const closureDocumentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!enterpriseMode) return;
    setData(normalizeAppData((initialData || undefined) as Partial<AppData> & Record<string, unknown>, enterpriseBlankData));
  }, [enterpriseMode, initialData]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (enterpriseMode) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, enterpriseMode]);

  useEffect(() => {
    if (enterpriseMode || !showCommercialTools) return;
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
  }, [enterpriseMode, showCommercialTools]);

  useEffect(() => {
    if (enterpriseMode) return;
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const billingState = url.searchParams.get("billing");
    if (!billingState) {
      return;
    }

    if (billingState === "success") {
      setBanner("Stripe checkout completed. The billing event has been recorded for follow-up.");
    }
    if (billingState === "cancelled") {
      setBanner("Stripe checkout was cancelled before payment was completed.");
    }

    url.searchParams.delete("billing");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [enterpriseMode]);

  useEffect(() => {
    setPlanningDetailPhase(data.caseClosureStatus === "Closed to CPS" ? "longTerm" : data.currentPlanningPhase);
  }, [data.caseClosureStatus, data.currentPlanningPhase]);

  const confirmedNetworkMembers = useMemo(
    () => data.networkMembers.filter((member) => member.confirmed && member.name.trim()),
    [data.networkMembers],
  );
  const regionalCopy = REGIONAL_COPY[data.regionalVariant];
  const getDisplayedPlanningHeading = (heading: string, phase: PlanningPhaseKey) => {
    const trimmedHeading = heading.trim();
    return trimmedHeading
      ? getLocalizedPlanningHeading(trimmedHeading, phase, data.regionalVariant)
      : getPlanningPhaseLabel(phase, data.regionalVariant);
  };
  const localizedCurrentPhaseLabel = getLocalizedCurrentPhaseLabel(data.currentPhaseLabel, regionalCopy);
  const localizedClosureStatusLabel = getLocalizedClosureStatusLabel(data.caseClosureStatus, regionalCopy);
  const familyManagedHandoverStatusLabel = {
    not_started: "Not started",
    planned: "Planned",
    active: "Active",
  }[data.familyManagedHandoverStatus];
  const confirmedNetworkMemberIds = useMemo(
    () => confirmedNetworkMembers.map((member) => member.id),
    [confirmedNetworkMembers],
  );

  const continuityReadiness = useMemo(() => {
    const source = confirmedNetworkMembers.length ? confirmedNetworkMembers : data.networkMembers;
    const avg = source.reduce((sum, member) => sum + Number(member.reliability || 0), 0) / Math.max(1, source.length);
    return clampScale(avg);
  }, [confirmedNetworkMembers, data.networkMembers]);
  const displayedJournalEntries = useMemo(
    () =>
      enterpriseMode && externalJournalEntries.length
        ? externalJournalEntries.map((entry) =>
            normalizeJournalEntry({
              ...entry,
              urgency: "Routine",
              notifyTarget: "Network and caregivers",
            }),
          )
        : data.journalEntries,
    [data.journalEntries, enterpriseMode, externalJournalEntries],
  );

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
  const planningPhases: { key: PlanningPhaseKey; field: "immediatePlan" | "intermediatePlan" | "longTermPlan"; color: string }[] = [
    { key: "immediate", field: "immediatePlan", color: "border-rose-200 bg-rose-50" },
    { key: "intermediate", field: "intermediatePlan", color: "border-amber-200 bg-amber-50" },
    { key: "longTerm", field: "longTermPlan", color: "border-emerald-200 bg-emerald-50" },
  ];
  const activePlanningPhase = data.caseClosureStatus === "Closed to CPS" ? "longTerm" : data.currentPlanningPhase;
  const activePlanningLayer = data[getPlanningField(activePlanningPhase)];
  const activePlanningLabel = getDisplayedPlanningHeading(activePlanningLayer.heading, activePlanningPhase);
  const retainedPlanningHistory = useMemo(
    () =>
      planningPhases
        .filter((phase) => phase.key !== activePlanningPhase)
        .map((phase) => ({
          phase,
          item: data[phase.field],
        }))
        .filter(({ item }) => Boolean(item.promotedAt) || data.caseClosureStatus === "Closed to CPS" || item.status === "Completed"),
    [planningPhases, activePlanningPhase, data],
  );
  const retainedPlanningSnapshots = useMemo(
    () =>
      planningPhases
        .flatMap((phase) =>
          data[phase.field].snapshots.map((snapshot) => ({
            phase,
            heading: data[phase.field].heading,
            snapshot,
          })),
        )
        .sort((left, right) => right.snapshot.savedAt.localeCompare(left.snapshot.savedAt)),
    [planningPhases, data],
  );
  const outstandingAlerts = useMemo(() => {
    const alerts: { id: string; category: string; text: string; tone: "rose" | "amber" | "slate" }[] = [];

    splitLines(data.currentWatchpoint).forEach((text, index) => {
      alerts.push({ id: `watchpoint-${index}`, category: regionalCopy.watchpointLabel, text, tone: "amber" });
    });

    splitLines(data.immediateActionsText).forEach((text, index) => {
      alerts.push({ id: `legacy-action-${index}`, category: "Action", text, tone: "amber" });
    });

    splitLines(data.currentGapsText).forEach((text, index) => {
      alerts.push({ id: `gap-${index}`, category: "Network", text, tone: "amber" });
    });

    data.nextNetworkSteps
      .filter((item) => !item.completed)
      .forEach((item) => {
        alerts.push({ id: item.id, category: "Network", text: item.text, tone: "amber" });
      });

    data.rules
      .filter((rule) => rule.status === "Needs review" || rule.status === "At risk")
      .forEach((rule) => {
        alerts.push({
          id: rule.id,
          category: "Plan rule",
          text: `${rule.title || "Safeguarding rule"} is ${rule.status.toLowerCase()}${rule.note ? `: ${rule.note}` : "."}`,
          tone: rule.status === "At risk" ? "rose" : "amber",
        });
      });

    data.monitoringItems
      .filter((item) => !item.checked)
      .slice(0, 3)
      .forEach((item) => {
        alerts.push({ id: item.id, category: "Monitoring", text: item.text, tone: "slate" });
      });

    data.fireDrills
      .filter((item) => item.status !== "Completed")
      .forEach((item) => {
        alerts.push({
          id: item.id,
          category: "Testing",
          text: item.scenario || "A fire drill still needs to be scheduled and recorded.",
          tone: item.status === "In progress" ? "amber" : "slate",
        });
      });

    data.planAdaptations
      .filter((item) => item.status !== "Implemented")
      .forEach((item) => {
        alerts.push({
          id: item.id,
          category: "Adaptation",
          text: item.recommendation || "A safeguarding plan adaptation is still open.",
          tone: item.status === "Agreed" ? "slate" : "amber",
        });
      });

    data.closureActionItems
      .filter((item) => item.status !== "Completed")
      .forEach((item) => {
        alerts.push({
          id: item.id,
          category: "Closure",
          text: `${item.title || "Closure action"} remains ${item.status.toLowerCase()}.`,
          tone: data.caseClosureStatus === "Closure planned" ? "amber" : "slate",
        });
      });

    if (!confirmedNetworkMembers.length) {
      alerts.push({
        id: "confirmed-network-members",
        category: "Network",
        text: "No confirmed network members are currently active in the plan.",
        tone: "rose",
      });
    }

    if (data.caseClosureStatus === "Urgent CPS review") {
      alerts.push({
        id: "urgent-cps-review",
        category: "Urgent review",
        text: localizeServiceReferences(data.closureAlertNote || regionalCopy.urgentReviewDefaultText, regionalCopy),
        tone: "rose",
      });
    }

    const deduped = new Map<string, (typeof alerts)[number]>();
    alerts.forEach((item) => {
      const key = `${item.category}:${item.text}`.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, item);
    });

    return Array.from(deduped.values());
  }, [data, confirmedNetworkMembers.length, regionalCopy]);
  const urgentAlertCount = useMemo(
    () => outstandingAlerts.filter((alert) => alert.tone === "rose").length,
    [outstandingAlerts],
  );
  const reviewAlertCount = useMemo(
    () => outstandingAlerts.filter((alert) => alert.tone === "amber").length,
    [outstandingAlerts],
  );
  const infoAlertCount = useMemo(
    () => outstandingAlerts.filter((alert) => alert.tone === "slate").length,
    [outstandingAlerts],
  );

  const saveSection = async (name: string) => {
    if (!onSaveSection) {
      setBanner(`${name} saved on this device.`);
      return;
    }

    setSectionSavePending(name);
    try {
      const response = await onSaveSection(name, data);
      setBanner(typeof response === "string" && response.trim() ? response : `${name} saved.`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : `${name} could not be saved.`);
    } finally {
      setSectionSavePending("");
    }
  };

  const updatePlanningLayer = (field: "immediatePlan" | "intermediatePlan" | "longTermPlan", patch: Partial<PlanningLayer>) => {
    setData((current) => ({ ...current, [field]: { ...current[field], ...patch } }));
  };

  const savePlanningSnapshot = (phase: PlanningPhaseKey) => {
    const field = getPlanningField(phase);
    const layer = data[field];
    const note = planningSnapshotDrafts[phase].trim();
    const summary = note || `${layer.heading} update`;
    setData((current) => ({
      ...current,
      [field]: {
        ...current[field],
        snapshots: [
          normalizePlanningSnapshot({
            summary,
            actions: current[field].actions,
            members: current[field].members,
            reviewDate: current[field].reviewDate,
          }),
          ...current[field].snapshots,
        ],
      },
    }));
    setPlanningSnapshotDrafts((current) => ({ ...current, [phase]: "" }));
    setBanner(`${getDisplayedPlanningHeading(layer.heading, phase)} saved to retained history with a time stamp.`);
  };

  const promotePlanningLayer = (from: PlanningPhaseKey, to: PlanningPhaseKey) => {
    const sourceField = getPlanningField(from);
    const targetField = getPlanningField(to);
    setData((current) => {
      const source = current[sourceField];
      const target = current[targetField];
      return {
        ...current,
        currentPlanningPhase: to,
        [sourceField]: {
          ...source,
          status: "Completed",
          promotedAt: source.promotedAt || nowStamp(),
        },
        [targetField]: {
          ...target,
          status: target.status === "Completed" ? target.status : "Active",
          actions: mergeDistinctSegments(target.actions, source.actions, /\n+/),
          members: mergeDistinctSegments(target.members, source.members, /,|\n/),
        },
      };
    });
    setPlanningDetailPhase(to);
    setBanner(
      `Planning content promoted from ${getPlanningPhaseLabel(from, data.regionalVariant)} to ${getPlanningPhaseLabel(to, data.regionalVariant)}.`,
    );
  };

  const movePlanningLayerBack = (from: PlanningPhaseKey, to: PlanningPhaseKey) => {
    const sourceField = getPlanningField(from);
    const targetField = getPlanningField(to);
    setData((current) => {
      const source = current[sourceField];
      const target = current[targetField];
      return {
        ...current,
        caseClosureStatus: current.caseClosureStatus === "Closed to CPS" ? "Urgent CPS review" : current.caseClosureStatus,
        currentPlanningPhase: to,
        [sourceField]: {
          ...source,
          status: source.status === "Completed" ? "Completed" : "Active",
          promotedAt: source.promotedAt || nowStamp(),
        },
        [targetField]: {
          ...target,
          status: "Active",
        },
      };
    });
    setPlanningDetailPhase(to);
    setBanner(
      `Active planning moved back from ${getPlanningPhaseLabel(from, data.regionalVariant)} to ${getPlanningPhaseLabel(to, data.regionalVariant)} because the situation needs an earlier response layer again.`,
    );
  };

  const updateClosureStatus = (status: AppData["caseClosureStatus"]) => {
    setData((current) => {
      if (status !== "Closed to CPS") {
        return {
          ...current,
          caseClosureStatus: status,
        };
      }
      return {
        ...current,
        caseClosureStatus: status,
        currentPlanningPhase: "longTerm",
        immediatePlan: {
          ...current.immediatePlan,
          status: "Completed",
          promotedAt: current.immediatePlan.promotedAt || nowStamp(),
        },
        intermediatePlan: {
          ...current.intermediatePlan,
          status: "Completed",
          promotedAt: current.intermediatePlan.promotedAt || nowStamp(),
        },
        longTermPlan: {
          ...current.longTermPlan,
          status: current.longTermPlan.status === "Completed" ? "Completed" : "Active",
        },
      };
    });
    setPlanningDetailPhase(status === "Closed to CPS" ? "longTerm" : data.currentPlanningPhase);
  };

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

  const updateClosureDocument = (id: string, patch: Partial<DocumentItem>) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const addClosureDocument = () => {
    setData((current) => ({
      ...current,
      closureDocuments: [
        ...current.closureDocuments,
        normalizeClosureDocument({ name: "", accessMode: "allConfirmed", allowedMemberIds: [] }),
      ],
    }));
  };

  const addClosureDocumentsFromFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setData((current) => ({
      ...current,
      closureDocuments: [
        ...current.closureDocuments,
        ...Array.from(files).map((file) =>
          normalizeClosureDocument({ name: file.name, accessMode: "allConfirmed", allowedMemberIds: [] }),
        ),
      ],
    }));
  };

  const handleClosureDocumentsSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    if (enterpriseMode && onUploadDocuments) {
      setDocumentUploadPending(true);
      try {
        const response = await onUploadDocuments(Array.from(files));
        setBanner(
          typeof response === "string" && response.trim()
            ? response
            : `${files.length} case document${files.length === 1 ? "" : "s"} uploaded.`,
        );
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "The case documents could not be uploaded.");
      } finally {
        setDocumentUploadPending(false);
      }
      return;
    }
    addClosureDocumentsFromFiles(files);
  };

  const handleDeleteUploadedDocument = async (documentId: string, fileName: string) => {
    if (!enterpriseMode || !onDeleteExternalDocument) return;
    try {
      const response = await onDeleteExternalDocument(documentId, fileName);
      if (typeof response === "string" && response.trim()) {
        setBanner(response);
      }
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "The case document could not be deleted.");
    }
  };

  const removeClosureDocument = (id: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.filter((item) => item.id !== id),
    }));
  };

  const exportPlanningSnapshotToClosure = (phaseKey: PlanningPhaseKey) => {
    const layer = data[getPlanningField(phaseKey)];
    const documentName = buildPlanningSnapshotDocumentName(layer, phaseKey, data.regionalVariant);
    setData((current) => {
      if (current.closureDocuments.some((item) => item.name.trim().toLowerCase() === documentName.trim().toLowerCase())) {
        return current;
      }
      return {
        ...current,
        closureDocuments: [
          ...current.closureDocuments,
          normalizeClosureDocument({
            name: documentName,
            generatedFromLabel: layer.heading,
            generatedFromPhase: phaseKey,
            accessMode: "allConfirmed",
            allowedMemberIds: [],
          }),
        ],
      };
    });
    setBanner(`${getDisplayedPlanningHeading(layer.heading, phaseKey)} snapshot added to closure documents.`);
  };

  const setClosureDocumentAccessMode = (id: string, accessMode: DocumentAccessMode) => {
    updateClosureDocument(id, {
      accessMode,
      allowedMemberIds:
        accessMode === "allConfirmed"
          ? []
          : data.closureDocuments.find((item) => item.id === id)?.allowedMemberIds.filter((memberId) =>
              confirmedNetworkMemberIds.includes(memberId),
            ) || [],
    });
  };

  const toggleClosureDocumentMemberAccess = (id: string, memberId: string) => {
    setData((current) => ({
      ...current,
      closureDocuments: current.closureDocuments.map((item) => {
        if (item.id !== id) return item;
        const alreadyIncluded = item.allowedMemberIds.includes(memberId);
        return {
          ...item,
          accessMode: "selectedMembers",
          allowedMemberIds: alreadyIncluded
            ? item.allowedMemberIds.filter((currentMemberId) => currentMemberId !== memberId)
            : [...item.allowedMemberIds, memberId],
        };
      }),
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

  const addJournalEntry = async () => {
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

    if (enterpriseMode && onPostJournalEntry) {
      try {
        const response = await onPostJournalEntry({
          author,
          audience,
          message,
          urgency: data.journalEntryUrgency,
          notifyTarget,
        });
        setData((current) => ({
          ...current,
          journalEntryText: "",
        }));
        setBanner(typeof response === "string" && response.trim() ? response : "Journal entry posted.");
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "The journal entry could not be posted.");
      }
      return;
    }

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
    if (enterpriseMode) return;
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

  const supportEmailAddress = supportEmail || "admin@ataconsultancy.net";
  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label || "Unknown";

  const openSupportModal = () => {
    setSupportErrorMessage("");
    setSupportStatusMessage("");
    setIsSupportModalOpen(true);
  };

  const openBillingModal = () => {
    setBillingCheckoutErrorMessage("");
    setBillingCheckoutStatusMessage("");
    setBillingAlternativeErrorMessage("");
    setBillingAlternativeStatusMessage("");
    setIsBillingModalOpen(true);
  };

  const handleSupportSubmit = async (payload: SupportTicketPayload) => {
    setSupportSubmitting(true);
    setSupportErrorMessage("");
    setSupportStatusMessage("");

    try {
      const response = await submitSupportTicket(payload);
      setSupportStatusMessage(response.message);
      setBanner("Support ticket sent.");
      if (response.mailtoUrl) {
        window.location.assign(response.mailtoUrl);
      }
    } catch (error) {
      setSupportErrorMessage(error instanceof Error ? error.message : "The support ticket could not be sent.");
    } finally {
      setSupportSubmitting(false);
    }
  };

  const handleStartBillingCheckout = async (payload: BillingCheckoutPayload) => {
    setBillingCheckoutSubmitting(true);
    setBillingCheckoutErrorMessage("");
    setBillingCheckoutStatusMessage("");
    try {
      const response = await startBillingCheckout(payload);
      setBillingCheckoutStatusMessage(response.message);
      window.location.assign(response.url);
    } catch (error) {
      setBillingCheckoutErrorMessage(error instanceof Error ? error.message : "Stripe checkout could not be started.");
    } finally {
      setBillingCheckoutSubmitting(false);
    }
  };

  const handleAlternativePaymentSubmit = async (payload: AlternativePaymentRequestPayload) => {
    setBillingAlternativeSubmitting(true);
    setBillingAlternativeErrorMessage("");
    setBillingAlternativeStatusMessage("");
    try {
      const response = await submitAlternativePaymentRequest(payload);
      setBillingAlternativeStatusMessage(response.message);
      setBanner("Alternative payment request submitted.");
    } catch (error) {
      setBillingAlternativeErrorMessage(error instanceof Error ? error.message : "Alternative payment request could not be sent.");
    } finally {
      setBillingAlternativeSubmitting(false);
    }
  };

  const planStabilityTone = getScaleTone(data.planStability);
  const safeguardingTone = getScaleTone(data.safeguardingScale);

  return (
    <div className="nm-app min-h-screen bg-slate-100">
      <div className="nm-app-shell mx-auto max-w-7xl p-4 md:p-8">
        <div className="space-y-6">
          <section className="nm-hero rounded-3xl border px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="nm-brand-mark flex h-14 w-14 items-center justify-center rounded-full border p-2">
                  <img src="/sgt-logo.png" alt="SgT logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Network Manager</h1>
                  <p className="mt-1 text-sm text-slate-500">{regionalCopy.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <span>Language version</span>
                  <select
                    value={data.regionalVariant}
                    onChange={(e) => updateField("regionalVariant", e.target.value as RegionalVariant)}
                    className="input min-w-[190px]"
                  >
                    {Object.entries(REGIONAL_COPY).map(([key, copy]) => (
                      <option key={key} value={key}>
                        {copy.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="nm-mode-badge inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium">
                  {regionalCopy.viewBadge}
                </div>
                {showCommercialTools ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openSupportModal}
                      className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium"
                    >
                      Help
                    </button>
                    <button
                      type="button"
                      onClick={openBillingModal}
                      className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium"
                    >
                      Plans & Billing
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {banner ? <SaveBanner message={banner} onDismiss={() => setBanner("")} /> : null}

          <section className="nm-tabbar rounded-3xl border p-2 shadow-sm">
            <div className="scrollbar-hide flex min-w-max gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`nm-tab rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab.key ? "nm-tab-active" : "nm-tab-idle"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "case-status" && (
            <fieldset disabled={!canEditState} className="contents">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Metric
                  label={regionalCopy.currentCasePhaseMetricLabel}
                  value={localizedCurrentPhaseLabel}
                  helper={regionalCopy.currentCasePhaseMetricHelper}
                />
                <Metric
                  label={regionalCopy.confirmedNetworkMembersMetricLabel}
                  value={String(confirmedNetworkMembers.length)}
                  helper={regionalCopy.confirmedNetworkMembersMetricHelper}
                />
                <Metric
                  label={regionalCopy.activePlanMetricLabel}
                  value={activePlanningLabel}
                  helper={getPlanningPhaseLabel(activePlanningPhase, data.regionalVariant)}
                />
                <Metric
                  label={regionalCopy.planEffectivenessMetricLabel}
                  value={`${data.planStability}/10`}
                  helper={regionalCopy.currentPlanEffectivenessMetricHelper}
                />
                <Metric
                  label={regionalCopy.networkReadinessMetricLabel}
                  value={`${continuityReadiness}/10`}
                  helper={regionalCopy.networkReadinessMetricHelper}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card title={regionalCopy.caseOverviewTitle}>
                  <div className="space-y-4">
                    <SectionActions onSave={() => void saveSection("Case status")} disabled={!canEditState || Boolean(sectionSavePending)} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={regionalCopy.caseStatusFieldLabel}>
                        <input value={data.caseStatus} onChange={(e) => updateField("caseStatus", e.target.value)} className="input" />
                      </Field>
                      <Field label={regionalCopy.familyNameFieldLabel}>
                        <input value={data.familyName} onChange={(e) => updateField("familyName", e.target.value)} className="input" />
                      </Field>
                      <Field label="Mother name">
                        <input value={data.motherName} onChange={(e) => updateField("motherName", e.target.value)} className="input" />
                      </Field>
                      <Field label="Father name">
                        <input value={data.fatherName} onChange={(e) => updateField("fatherName", e.target.value)} className="input" />
                      </Field>
                      <Field label={regionalCopy.leadPractitionerLabel}>
                        <input value={data.leadPractitioner} onChange={(e) => updateField("leadPractitioner", e.target.value)} className="input" />
                      </Field>
                      <Field label={regionalCopy.caseStartDateFieldLabel}>
                        <input value={data.caseStartDate} onChange={(e) => updateField("caseStartDate", e.target.value)} className="input" />
                      </Field>
                    </div>
                    <Field label="Children names (one per line)">
                      <textarea value={data.childrenNames} onChange={(e) => updateField("childrenNames", e.target.value)} className="textarea" />
                    </Field>
                    <Field label={regionalCopy.caregiverSummaryLabel}>
                      <textarea value={data.caregiverSummary} onChange={(e) => updateField("caregiverSummary", e.target.value)} className="textarea" />
                    </Field>
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card title={regionalCopy.currentPlanEffectivenessTitle}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-600">{regionalCopy.currentPlanEffectivenessDescription}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {regionalCopy.currentPlanEffectivenessTrackingPrefix} {activePlanningLabel}
                          </p>
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
                        <span className="range-scale-label">{regionalCopy.currentPlanEffectivenessMin}</span>
                        <span className="range-scale-label">{regionalCopy.currentPlanEffectivenessMax}</span>
                      </div>
                      <ProgressBar value={data.planStability} />
                    </div>
                  </Card>

                  <Card title={regionalCopy.confirmedNetworkMembersTitle}>
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600">{regionalCopy.confirmedNetworkMembersDescription}</p>
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
                          {regionalCopy.confirmedNetworkMembersEmpty}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              <Card title={regionalCopy.priorityAlertsTitle}>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl space-y-2">
                      <p className="text-sm text-slate-600">{regionalCopy.priorityAlertsDescription}</p>
                      {regionalCopy.priorityAlertsSecondaryDescription ? (
                        <p className="text-xs text-slate-500">{regionalCopy.priorityAlertsSecondaryDescription}</p>
                      ) : null}
                    </div>
                    <StatusBadge className={outstandingAlerts.length ? "border border-amber-200 bg-amber-50 text-amber-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {outstandingAlerts.length ? `${outstandingAlerts.length} open item${outstandingAlerts.length === 1 ? "" : "s"}` : "No outstanding alerts"}
                    </StatusBadge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Urgent review</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{urgentAlertCount}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Needs follow-up</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{reviewAlertCount}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">General items</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{infoAlertCount}</p>
                    </div>
                  </div>
                  {outstandingAlerts.length ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">Open items list</p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Scroll to review all items</p>
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {outstandingAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={`rounded-2xl border px-4 py-3 ${
                              alert.tone === "rose"
                                ? "border-rose-200 bg-white"
                                : alert.tone === "amber"
                                  ? "border-amber-200 bg-white"
                                  : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-900">{alert.category}</p>
                                <p className="text-sm text-slate-700">{alert.text}</p>
                              </div>
                              <StatusBadge
                                className={
                                  alert.tone === "rose"
                                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                                    : alert.tone === "amber"
                                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                                      : "border border-slate-200 bg-slate-50 text-slate-700"
                                }
                              >
                                {alert.tone === "rose" ? "Urgent" : alert.tone === "amber" ? "Follow-up" : "Open"}
                              </StatusBadge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
                      {regionalCopy.noOpenAlertsText}
                    </div>
                  )}
                </div>
              </Card>
            </div>
            </fieldset>
          )}

          {activeTab === "timeline" && (
            <fieldset disabled={!canEditState} className="contents">
            <div className="space-y-6">
              <Card title={regionalCopy.timelineTitle}>
                <div className="space-y-6">
                  <SectionActions onSave={() => void saveSection("Timeline")} disabled={!canEditState || Boolean(sectionSavePending)} />
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
                        <p className="font-medium text-slate-900">{regionalCopy.safeguardingScaleTitle}</p>
                        <p className="mt-1 text-sm text-slate-500">{regionalCopy.safeguardingScaleDescription}</p>
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
                        <span className="range-scale-label">{regionalCopy.safeguardingScaleMin}</span>
                        <span className="range-scale-label">{regionalCopy.safeguardingScaleMax}</span>
                      </div>
                      <ProgressBar value={data.safeguardingScale} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                title={regionalCopy.timelinePathwayTitle}
                right={
                  <button type="button" onClick={addTimelineEntry} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {regionalCopy.addTimelineEntryLabel}
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
            </fieldset>
          )}

          {activeTab === "network" && (
            <fieldset disabled={!canEditState} className="contents">
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
                  <SectionActions onSave={() => void saveSection("Network building")} disabled={!canEditState || Boolean(sectionSavePending)} />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    {regionalCopy.networkSectionDescription}
                  </div>
                  {data.networkMembers.map((person) => {
                    const personTone = getScaleTone(person.reliability);
                    return (
                      <div key={person.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{person.name || regionalCopy.networkPersonDefaultName}</p>
                            <p className="text-sm text-slate-500">{person.role || regionalCopy.networkPersonDefaultRole}</p>
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
                            <select value={person.role} onChange={(e) => updateNetworkMember(person.id, "role", e.target.value)} className="input">
                              <option value="">Choose role assignment</option>
                              {CAREGIVER_ROLE_ASSIGNMENT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                              {person.role && !CAREGIVER_ROLE_ASSIGNMENT_OPTIONS.includes(person.role as (typeof CAREGIVER_ROLE_ASSIGNMENT_OPTIONS)[number]) ? (
                                <option value={person.role}>{person.role} (existing)</option>
                              ) : null}
                            </select>
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
                              <p className="font-medium text-slate-900">{regionalCopy.networkReliabilityTitle}</p>
                              <p className="text-sm text-slate-500">{regionalCopy.networkReliabilityInstruction}</p>
                              <p className="mt-1 text-sm text-slate-500">{regionalCopy.networkReliabilityDescription}</p>
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
                            <span className="range-scale-label">{regionalCopy.networkReliabilityMin}</span>
                            <span className="range-scale-label">{regionalCopy.networkReliabilityMax}</span>
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
            </fieldset>
          )}

          {activeTab === "planning" && (
            <fieldset disabled={!canEditState} className="contents">
            <div className="space-y-6">
              <Card title="Safeguarding Planning Flow">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Planning progression</p>
                        <p className="mt-1 text-sm text-slate-600">
                          The plan should move clearly from the immediate safety plan, to the intermediate safeguarding plan, and then to the final safeguarding plan. If the situation worsens, you can move back to an earlier plan.
                        </p>
                      </div>
                      <StatusBadge className="border border-blue-200 bg-blue-50 text-blue-700">
                        Current active phase: {activePlanningLabel}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {planningPhases.map((phase, index) => {
                        const item = data[phase.field];
                        const isActive = activePlanningPhase === phase.key;
                        const isOpen = planningDetailPhase === phase.key;
                        const archived = Boolean(item.promotedAt) && !isActive;
                        return (
                          <button
                            key={phase.key}
                            type="button"
                            onClick={() => setPlanningDetailPhase(phase.key)}
                            className={`rounded-2xl border p-4 text-left transition ${phase.color} ${isOpen ? "ring-2 ring-blue-200" : "hover:border-slate-300"}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-900">
                                {index + 1}. {getDisplayedPlanningHeading(item.heading, phase.key)}
                              </span>
                              <StatusBadge className={isActive ? "border border-blue-200 bg-white text-blue-700" : "border border-slate-200 bg-white text-slate-700"}>
                                {isActive ? "Current" : archived ? "History" : item.status}
                              </StatusBadge>
                            </div>
                            <p className="mt-2 text-sm text-slate-700">{item.purpose}</p>
                            <div className="mt-3 grid gap-2 text-xs text-slate-600">
                              <div>Review: {item.reviewDate || "Not set"}</div>
                              <div>{item.members ? `${item.members.split(",").map((member) => member.trim()).filter(Boolean).length} key members` : "Key members not listed"}</div>
                              <div>{item.actions ? `${splitLines(item.actions).length} live actions` : "No actions entered yet"}</div>
                              {archived && item.promotedAt ? <div>Archived on {item.promotedAt}</div> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <GuidanceNote title={PLANNING_GUIDANCE[planningDetailPhase].title} points={PLANNING_GUIDANCE[planningDetailPhase].points} />

                  {planningPhases.map((phase, index) => {
                    if (planningDetailPhase !== phase.key) return null;
                    const item = data[phase.field];
                    const nextPhase = getNextPlanningPhase(phase.key);
                    const previousPhase = getPreviousPlanningPhase(phase.key);
                    const promotionTarget = nextPhase === "intermediate" || nextPhase === "longTerm" ? nextPhase : null;
                    const canPromote = Boolean(promotionTarget) && data.caseClosureStatus !== "Closed to CPS";
                    const canMoveBack = Boolean(previousPhase) && activePlanningPhase === phase.key;
                    return (
                      <div key={phase.key} className={`rounded-2xl border p-5 ${phase.color}`}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-900">Phase {index + 1}</span>
                              <StatusBadge className="border border-slate-200 bg-white text-slate-700">{activePlanningPhase === phase.key ? "Current active phase" : item.status}</StatusBadge>
                            </div>
                            <h3 className="mt-3 text-xl font-semibold text-slate-900">
                              {getDisplayedPlanningHeading(item.heading, phase.key)}
                            </h3>
                            <p className="mt-2 text-sm text-slate-700">{item.purpose}</p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <select
                              value={item.status}
                              onChange={(e) => updatePlanningLayer(phase.field, { status: e.target.value as PlanningPhaseStatus })}
                              className="input min-w-[180px]"
                            >
                              <option>Active</option>
                              <option>Completed</option>
                            </select>
                            {canPromote ? (
                              <button
                                type="button"
                                onClick={() => promotionTarget && promotePlanningLayer(phase.key, promotionTarget)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Promote to {promotionTarget ? getPlanningPhaseLabel(promotionTarget, data.regionalVariant) : "next phase"}
                              </button>
                            ) : null}
                            {canMoveBack && previousPhase ? (
                              <button
                                type="button"
                                onClick={() => movePlanningLayerBack(phase.key, previousPhase)}
                                className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50"
                              >
                                Move back to {getPlanningPhaseLabel(previousPhase, data.regionalVariant)}
                              </button>
                            ) : null}
                            {phase.key !== activePlanningPhase ? (
                              <button
                                type="button"
                                onClick={() => exportPlanningSnapshotToClosure(phase.key)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Add snapshot to closure docs
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <Field label="Review date">
                            <input
                              value={item.reviewDate}
                              onChange={(e) => updatePlanningLayer(phase.field, { reviewDate: e.target.value })}
                              className="input"
                            />
                          </Field>
                          <Field label="Key members involved">
                            <input
                              value={item.members}
                              onChange={(e) => updatePlanningLayer(phase.field, { members: e.target.value })}
                              className="input"
                            />
                          </Field>
                        </div>
                        <div className="mt-4">
                          <Field label="Actions, arrangements, or commitments for this phase">
                            <textarea
                              value={item.actions}
                              onChange={(e) => updatePlanningLayer(phase.field, { actions: e.target.value })}
                              className="textarea"
                            />
                          </Field>
                        </div>
                        {phase.key === "immediate" ? (
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                            <Field
                              label="Save a time-stamped immediate safety update"
                              helper="Use this to capture day-to-day changes, short-term adjustments, or brief notes about what changed in the immediate safety intervention."
                            >
                              <div className="space-y-3">
                                <textarea
                                  value={planningSnapshotDrafts.immediate}
                                  onChange={(e) =>
                                    setPlanningSnapshotDrafts((current) => ({
                                      ...current,
                                      immediate: e.target.value,
                                    }))
                                  }
                                  className="textarea"
                                  placeholder="Example: Karen covered the evening at short notice after Anna flagged rising stress at 17:20."
                                />
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => savePlanningSnapshot("immediate")}
                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Save time-stamped update
                                  </button>
                                  <span className="self-center text-xs text-slate-500">
                                    Saved updates are shown below in retained history.
                                  </span>
                                </div>
                              </div>
                            </Field>
                          </div>
                        ) : null}
                        {phase.key !== activePlanningPhase ? (
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                            {phase.key === "longTerm" && data.caseClosureStatus === "Closed to CPS"
                              ? "This is the only active safeguarding plan after closure. Immediate and intermediate planning phases are retained as history."
                              : item.promotedAt
                                ? `This phase is retained as history after being carried forward on ${item.promotedAt}.`
                                : "This phase is not the primary live plan right now."}
                          </div>
                        ) : null}
                        {canMoveBack && previousPhase ? (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4 text-sm text-amber-800">
                            If risk rises again, this active plan can be stepped back to {getPlanningPhaseLabel(previousPhase, data.regionalVariant)} while keeping the later plan in the record for review.
                          </div>
                        ) : null}
                        {phase.key === "longTerm" && data.caseClosureStatus === "Closed to CPS" ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 text-sm text-emerald-800">
                            This is the only active safeguarding plan after closure. Immediate and intermediate planning phases are retained as history.
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Retained Phase History">
                <div className="space-y-4">
                  <GuidanceNote title={PLANNING_GUIDANCE.history.title} points={PLANNING_GUIDANCE.history.points} />
                  <p className="text-sm text-slate-600">
                    Earlier plans stay in the case as structured history after they are carried forward. Immediate-safety updates saved over time also remain here with their time stamp.
                  </p>
                  {retainedPlanningHistory.length ? (
                    retainedPlanningHistory.map(({ phase, item }) => (
                      <div key={phase.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <p className="text-base font-semibold text-slate-900">
                                {getDisplayedPlanningHeading(item.heading, phase.key)}
                              </p>
                              <StatusBadge className="border border-slate-200 bg-white text-slate-700">
                                {item.promotedAt ? `Archived ${item.promotedAt}` : "Retained history"}
                              </StatusBadge>
                            </div>
                            <p className="text-sm text-slate-600">{item.purpose}</p>
                            <div className="grid gap-1 text-sm text-slate-700">
                              <div><span className="font-medium text-slate-900">Members:</span> {item.members || "Not entered"}</div>
                              <div><span className="font-medium text-slate-900">Review date:</span> {item.reviewDate || "Not set"}</div>
                            </div>
                            {summarizePlanningActions(item.actions).length ? (
                              <div className="pt-1 text-sm text-slate-700">
                                <div className="font-medium text-slate-900">Key actions</div>
                                <div className="mt-2 space-y-1">
                                  {summarizePlanningActions(item.actions).map((action) => (
                                    <div key={action}>• {action}</div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => exportPlanningSnapshotToClosure(phase.key)}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Add snapshot to closure docs
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Earlier planning phases will be retained here once they have been carried forward or the case reaches closure.
                    </div>
                  )}
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-slate-900">Saved immediate-safety updates</h3>
                    {retainedPlanningSnapshots.length ? (
                      retainedPlanningSnapshots.map(({ phase, heading, snapshot }) => (
                        <div key={snapshot.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{snapshot.summary}</p>
                              <p className="text-sm text-slate-500">
                                {heading} • saved {snapshot.savedAt}
                              </p>
                            </div>
                            <StatusBadge className="border border-slate-200 bg-slate-50 text-slate-700">
                              {getPlanningPhaseLabel(phase.key, data.regionalVariant)}
                            </StatusBadge>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-slate-700">
                            <div>
                              <span className="font-medium text-slate-900">Review date:</span> {snapshot.reviewDate || "Not set"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Members:</span> {snapshot.members || "Not entered"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Actions at save point:</span>
                              <div className="mt-1 whitespace-pre-wrap">{snapshot.actions || "No actions recorded."}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                        Time-stamped immediate-safety updates will appear here after they are saved.
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card
                title="Safeguarding Rules and Commitments"
                right={
                  <button type="button" onClick={addRule} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Add safeguarding rule
                  </button>
                }
              >
                <div className="space-y-4">
                  <SectionActions onSave={() => void saveSection("Safeguarding planning")} disabled={!canEditState || Boolean(sectionSavePending)} />
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

              <Card title="Long-Term Safeguarding Plan">
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
            </fieldset>
          )}

          {activeTab === "monitoring" && (
            <fieldset disabled={!canEditState} className="contents">
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
                    <SectionActions onSave={() => void saveSection("Monitoring and testing")} disabled={!canEditState || Boolean(sectionSavePending)} />
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
            </fieldset>
          )}

          {activeTab === "journal" && (
            <fieldset disabled={!canPostSharedJournal} className="contents">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card title="Add Journal Entry">
                <div className="space-y-4">
                  <SectionActions onSave={() => void addJournalEntry()} onReset={resetJournalSection} saveLabel="Post journal entry" disabled={!canPostSharedJournal || Boolean(sectionSavePending)} />
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
                  {displayedJournalEntries.length ? (
                    displayedJournalEntries.map((entry) => {
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
                              {!enterpriseMode ? (
                                <button
                                  type="button"
                                  onClick={() => removeJournalEntry(entry.id)}
                                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.message}</p>
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                            Alert target: <span className="font-medium text-slate-900">{entry.notifyTarget}</span>
                          {"alertsSentAt" in entry && entry.alertsSentAt ? (
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
            </fieldset>
          )}

          {activeTab === "closure" && (
            <fieldset disabled={!canEditState} className="contents">
            <div className="space-y-6">
              <Card title="Family-managed handover">
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Handover status</p>
                    <div className="mt-3">
                      <StatusBadge
                        className={
                          data.familyManagedHandoverStatus === "active"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : data.familyManagedHandoverStatus === "planned"
                              ? "border border-amber-200 bg-amber-50 text-amber-700"
                              : "border border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {familyManagedHandoverStatusLabel}
                      </StatusBadge>
                    </div>
                    {data.familyManagedHandoverActivatedAt ? (
                      <p className="mt-3 text-sm text-slate-600">
                        Activated {new Date(data.familyManagedHandoverActivatedAt).toLocaleString()}.
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">
                        An organization admin activates this once the family or network representative is ready to carry the plan forward.
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {data.familyManagedHandoverStatus === "active"
                        ? "This closed case is now being carried forward inside the workspace by the family or network."
                        : data.familyManagedHandoverStatus === "planned"
                          ? "A family-managed handover is being prepared for this case."
                          : "No family-managed handover has been activated yet."}
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p>
                        <span className="font-medium text-slate-700">Handover lead:</span>{" "}
                        {data.familyManagedHandoverLeadName || "Not yet selected"}
                        {data.familyManagedHandoverLeadRole
                          ? ` • ${data.familyManagedHandoverLeadRole === "network_member" ? "Network member" : "Caregiver"}`
                          : ""}
                      </p>
                      <p>
                        Organization admins manage the handover state in the admin dashboard. Caregivers and network members can then continue using the closed workspace, documents, and journal under that agreed arrangement.
                      </p>
                      {data.familyManagedHandoverNotes ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                          {data.familyManagedHandoverNotes}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                title="Post-Closure Support Tools"
                right={
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => closureDocumentInputRef.current?.click()}
                      disabled={enterpriseMode ? !canUploadCaseDocuments || documentUploadPending : false}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {enterpriseMode ? (documentUploadPending ? "Uploading..." : "Upload case document") : "Add closure document"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveSection("Closure documents")}
                      disabled={Boolean(sectionSavePending)}
                      className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      Save documents
                    </button>
                  </div>
                }
              >
                <details open className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">{regionalCopy.closureDocumentsLabel}</summary>
                  <p className="mt-3 text-sm text-slate-600">{regionalCopy.closureDocumentsDescription}</p>
                  <input
                    ref={closureDocumentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleClosureDocumentsSelected(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {enterpriseMode ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">Uploaded case documents</p>
                        <p className="mt-1 text-sm text-slate-600">
                          These files are stored in the live case record and can be downloaded directly.
                        </p>
                      </div>
                      {externalDocuments.length ? (
                        externalDocuments.map((doc) => (
                          <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-900">{doc.fileName}</p>
                                <p className="text-xs text-slate-500">
                                  Uploaded by {doc.uploadedBy} • {doc.createdAt}
                                </p>
                              </div>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Download
                              </a>
                              {canUploadCaseDocuments && onDeleteExternalDocument ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteUploadedDocument(doc.id, doc.fileName)}
                                  disabled={deletingExternalDocumentId === doc.id}
                                  className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 disabled:opacity-60"
                                >
                                  {deletingExternalDocumentId === doc.id ? "Deleting..." : "Delete file"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                          No uploaded case documents yet.
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3">
                    {data.closureDocuments.map((doc) => (
                      <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1 space-y-3">
                            <input
                              value={doc.name}
                              onChange={(e) => updateClosureDocument(doc.id, { name: e.target.value })}
                              className="input"
                              placeholder="Enter closure document name or reference"
                            />
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_1fr]">
                              <Field label="Who can access this document?">
                                <select
                                  value={doc.accessMode}
                                  onChange={(e) => setClosureDocumentAccessMode(doc.id, e.target.value as DocumentAccessMode)}
                                  className="input"
                                >
                                  <option value="allConfirmed">All confirmed network members</option>
                                  <option value="selectedMembers">Only selected confirmed network members</option>
                                </select>
                              </Field>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Access summary</p>
                                <p className="mt-2 text-sm text-slate-700">
                                  {doc.accessMode === "allConfirmed"
                                    ? "Visible to all confirmed network members."
                                    : (() => {
                                        const visibleMembers = confirmedNetworkMembers.filter((member) => doc.allowedMemberIds.includes(member.id));
                                        if (!visibleMembers.length) return "No confirmed network members have been selected yet.";
                                        return `Visible to ${visibleMembers.map((member) => member.name).join(", ")}.`;
                                      })()}
                                </p>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeClosureDocument(doc.id)}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                        {doc.generatedFromLabel ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <StatusBadge className="border border-blue-200 bg-blue-50 text-blue-700">
                              Generated from {doc.generatedFromPhase
                                ? getDisplayedPlanningHeading(doc.generatedFromLabel, doc.generatedFromPhase)
                                : doc.generatedFromLabel}
                            </StatusBadge>
                            {doc.generatedFromPhase ? (
                              <StatusBadge className="border border-slate-200 bg-slate-50 text-slate-700">
                                {getPlanningPhaseLabel(doc.generatedFromPhase, data.regionalVariant)}
                              </StatusBadge>
                            ) : null}
                          </div>
                        ) : null}
                        {doc.accessMode === "selectedMembers" ? (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-900">Confirmed network members with access</p>
                            {confirmedNetworkMembers.length ? (
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {confirmedNetworkMembers.map((member) => {
                                  const checked = doc.allowedMemberIds.includes(member.id);
                                  return (
                                    <label key={member.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleClosureDocumentMemberAccess(doc.id, member.id)}
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <span>
                                        <span className="block font-medium text-slate-900">{member.name}</span>
                                        <span className="block text-slate-500">{member.relationship || member.role || "Confirmed network member"}</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                                Confirm network members in the Network Building tab before assigning document access.
                              </div>
                            )}
                          </div>
                        ) : null}
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

              <Card title="Safeguarding Breakdown Scenario">
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
                        <div className="text-lg font-semibold">{localizedClosureStatusLabel}</div>
                        <p className="text-sm leading-6">{localizeServiceReferences(data.closureAlertNote, regionalCopy)}</p>
                      </div>
                      <div className="w-full max-w-sm">
                        <Field label="Update closure alert status">
                          <select
                            value={data.caseClosureStatus}
                            onChange={(e) => updateClosureStatus(e.target.value as AppData["caseClosureStatus"])}
                            className="input"
                          >
                            {(
                              [
                                "CPS active",
                                "Closure planned",
                                "Closed to CPS",
                                "Urgent CPS review",
                              ] as AppData["caseClosureStatus"][]
                            ).map((status) => (
                              <option key={status} value={status}>
                                {getLocalizedClosureStatusLabel(status, regionalCopy)}
                              </option>
                            ))}
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
            </fieldset>
          )}
        </div>
      </div>
      {showCommercialTools ? (
        <>
          <SupportModal
            isOpen={isSupportModalOpen}
            isSubmitting={supportSubmitting}
            errorMessage={supportErrorMessage}
            statusMessage={supportStatusMessage}
            supportEmail={supportEmailAddress}
            activeTab={activeTabLabel}
            currentPath={typeof window === "undefined" ? "/" : window.location.pathname}
            onClose={() => setIsSupportModalOpen(false)}
            onSubmit={handleSupportSubmit}
          />
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
            onStartCheckout={handleStartBillingCheckout}
            onRequestAlternativePayment={handleAlternativePaymentSubmit}
          />
        </>
      ) : null}
    </div>
  );
}
