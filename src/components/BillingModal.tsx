import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AlternativePaymentMethod,
  AlternativePaymentRequestPayload,
  BillingCheckoutPayload,
  NetworkBillingPlanOption,
} from "../../shared/types";
import { TurnstileWidget } from "./TurnstileWidget";

interface Props {
  isOpen: boolean;
  plans: NetworkBillingPlanOption[];
  allowedAlternativePaymentMethods: AlternativePaymentMethod[];
  billingConfigured: boolean;
  alternativePaymentsEnabled: boolean;
  checkoutSubmitting: boolean;
  alternativeSubmitting: boolean;
  checkoutErrorMessage: string;
  checkoutStatusMessage: string;
  alternativeErrorMessage: string;
  alternativeStatusMessage: string;
  onClose: () => void;
  onStartCheckout: (payload: BillingCheckoutPayload) => Promise<void>;
  onRequestAlternativePayment: (payload: AlternativePaymentRequestPayload) => Promise<void>;
}

const initialForm = {
  fullName: "",
  organizationName: "",
  email: "",
  seatCount: "10",
  country: "",
  region: "",
  poNumber: "",
  notes: "",
};

export function BillingModal(props: Props) {
  const [selectedPlan, setSelectedPlan] = useState<string>(props.plans[0]?.key || "team");
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<AlternativePaymentMethod>(props.allowedAlternativePaymentMethods[0] || "wise");
  const [form, setForm] = useState(initialForm);
  const [alternativeTurnstileToken, setAlternativeTurnstileToken] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!props.isOpen) {
      setLocalError("");
      setSelectedPlan(props.plans[0]?.key || "team");
      setPreferredPaymentMethod(props.allowedAlternativePaymentMethods[0] || "wise");
      setForm(initialForm);
      setAlternativeTurnstileToken("");
    }
  }, [props.isOpen, props.plans, props.allowedAlternativePaymentMethods]);

  const canSubmitBase = useMemo(
    () =>
      Boolean(
        form.fullName.trim() &&
        form.organizationName.trim() &&
        form.email.trim() &&
        Number.parseInt(form.seatCount, 10) > 0
      ),
    [form]
  );

  if (!props.isOpen) {
    return null;
  }

  const selectedPlanMeta = props.plans.find((plan) => plan.key === selectedPlan) ?? props.plans[0];
  const combinedError = localError || props.alternativeErrorMessage || props.checkoutErrorMessage;

  const handleAlternativePayment = async () => {
    setLocalError("");
    if (!canSubmitBase || !selectedPlanMeta) {
      setLocalError("Complete the contact fields, seat count, and plan selection before sending a pricing request.");
      return;
    }
    if (!form.country.trim()) {
      setLocalError("Country is required so the administrator can prepare the right pricing and payment options.");
      return;
    }
    await props.onRequestAlternativePayment({
      fullName: form.fullName,
      organizationName: form.organizationName,
      email: form.email,
      requestedPlan: selectedPlanMeta.key,
      seatCount: Number.parseInt(form.seatCount, 10),
      preferredPaymentMethod,
      country: form.country,
      ...(form.region.trim() ? { region: form.region } : {}),
      ...(form.poNumber.trim() ? { poNumber: form.poNumber } : {}),
      ...(form.notes.trim() ? { notes: form.notes } : {}),
      ...(alternativeTurnstileToken ? { turnstileToken: alternativeTurnstileToken } : {}),
    });
  };

  return (
    <div className="nm-modal-backdrop" onClick={props.onClose} role="presentation">
      <div className="nm-modal-panel nm-modal-panel-wide" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Plans and access">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plans and access</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Contact the administrator for pricing and activation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Network Manager gives teams and organisations a structured safeguarding workspace for live planning, retained history,
              monitoring, continuity, and post-closure network management. The value is not just a tool. It is more consistent role clarity,
              more dependable planning, clearer escalation, and a better record of what the network actually holds over time.
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {props.plans.map((plan) => {
            const active = plan.key === selectedPlan;
            return (
              <button
                key={plan.key}
                type="button"
                onClick={() => setSelectedPlan(plan.key)}
                className={`nm-plan-card ${active ? "nm-plan-card-active" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{plan.label}</div>
                    <div className="mt-1 text-sm text-slate-600">{plan.summary}</div>
                  </div>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                    Contact admin
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-left text-sm text-slate-700">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Best for</div>
                    <div className="mt-1">{plan.bestFor}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Value</div>
                    <div className="mt-1">{plan.value}</div>
                  </div>
                  <div className="space-y-1">
                    {plan.featureBullets.map((item) => (
                      <div key={item}>• {item}</div>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {(props.checkoutStatusMessage || props.alternativeStatusMessage) ? (
          <div className="nm-inline-success mt-4">{props.checkoutStatusMessage || props.alternativeStatusMessage}</div>
        ) : null}
        {combinedError ? <div className="nm-inline-error mt-4">{combinedError}</div> : null}

        <form className="mt-5 grid gap-4" onSubmit={(event: FormEvent) => event.preventDefault()}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Full name
              <input className="input" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <input className="input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Organization name
              <input className="input" value={form.organizationName} onChange={(event) => setForm((current) => ({ ...current, organizationName: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Seat count
              <input className="input" type="number" min="1" step="1" value={form.seatCount} onChange={(event) => setForm((current) => ({ ...current, seatCount: event.target.value }))} />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Pricing and rollout are handled directly</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              All plans for Network Manager are discussed directly with the administrator. Use the request form below to share your
              organization, preferred plan, and expected seat count so pricing and activation can be prepared for you.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Request pricing and activation</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Share your preferred payment route and any rollout notes. The administrator can then confirm pricing, invoicing, and the
              right activation path for your organization.
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Preferred payment method
                <select className="input" value={preferredPaymentMethod} onChange={(event) => setPreferredPaymentMethod(event.target.value as AlternativePaymentMethod)}>
                  {props.allowedAlternativePaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {formatPaymentMethod(method)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Country
                <input className="input" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Region or province
                <input className="input" value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                PO number
                <input className="input" value={form.poNumber} onChange={(event) => setForm((current) => ({ ...current, poNumber: event.target.value }))} />
              </label>
            </div>
            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
              Notes
              <textarea className="textarea min-h-[96px]" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <div className="mt-4">
              <TurnstileWidget action="alternative_payment_submit" onTokenChange={setAlternativeTurnstileToken} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={!props.alternativePaymentsEnabled || props.alternativeSubmitting} onClick={() => void handleAlternativePayment()} className="app-secondary-button rounded-2xl px-4 py-3 font-medium disabled:opacity-60">
                {props.alternativeSubmitting ? "Sending request..." : "Contact admin for pricing"}
              </button>
              {!props.alternativePaymentsEnabled ? <div className="text-sm text-amber-700">Alternative payments are not enabled in this deployment yet.</div> : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatPaymentMethod(method: AlternativePaymentMethod) {
  if (method === "e_transfer") return "e-transfer";
  if (method === "eft") return "EFT / bank transfer";
  return method.charAt(0).toUpperCase() + method.slice(1);
}
