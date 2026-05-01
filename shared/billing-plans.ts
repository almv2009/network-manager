import type { NetworkBillingPlanKey, NetworkBillingPlanOption } from "./types";

type BasePlan = Omit<NetworkBillingPlanOption, "availableForCheckout">;

export const NETWORK_BILLING_PLAN_CATALOG: BasePlan[] = [
  {
    key: "team",
    label: "Team",
    summary: "For one practice team starting with shared safeguarding discipline.",
    bestFor: "Small teams that want a common network-management workflow and repeatable language.",
    value: "Gives one team a structured safeguarding workspace without forcing a larger organisational rollout.",
    featureBullets: [
      "Shared team access to the network manager workspace",
      "Structured safeguarding planning, monitoring, and retained history",
      "Useful for an early implementation team or one local service"
    ]
  },
  {
    key: "small_organization",
    label: "Small Organization",
    summary: "For smaller organisations formalising one consistent safeguarding process.",
    bestFor: "Single-service or smaller agency rollouts that need dependable structure and continuity.",
    value: "Supports a clear organisational starting point with enough structure for governance, review, and everyday use.",
    featureBullets: [
      "Shared organisational practice structure",
      "Better continuity across workers, supervisors, and partners",
      "Supports accountable planning and clearer role ownership"
    ]
  },
  {
    key: "medium_organization",
    label: "Medium Organization",
    summary: "For organisations that need consistency across several teams or regions.",
    bestFor: "Multi-team services that want stable rollout, common language, and stronger implementation discipline.",
    value: "Balances structured rollout, staff consistency, and owner-level visibility without requiring a full enterprise arrangement.",
    featureBullets: [
      "Designed for wider implementation",
      "Good for multiple service teams or regional rollout",
      "Recommended for most paid deployments"
    ]
  },
  {
    key: "large_organization",
    label: "Large Organization",
    summary: "For larger or higher-governance organisational deployment.",
    bestFor: "Large organisations, multi-service rollouts, or settings that need procurement and governance conversations.",
    value: "Supports large-scale adoption planning where consistency, governance, and rollout confidence matter as much as the coaching or networking work itself.",
    featureBullets: [
      "Best fit for complex governance needs",
      "Supports large rollout and procurement conversations",
      "Suited to multi-team or multi-region adoption"
    ]
  }
];

export function getBillingPlanCatalog(): BasePlan[] {
  return NETWORK_BILLING_PLAN_CATALOG;
}

export function findBillingPlan(planKey: string | null | undefined): BasePlan | null {
  const normalized = String(planKey || "").trim().toLowerCase() as NetworkBillingPlanKey;
  return NETWORK_BILLING_PLAN_CATALOG.find((plan) => plan.key === normalized) ?? null;
}
