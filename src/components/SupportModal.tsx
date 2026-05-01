import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { SupportTicketPayload } from "../../shared/types";
import { TurnstileWidget } from "./TurnstileWidget";

interface Props {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  statusMessage: string;
  supportEmail: string;
  activeTab: string;
  currentPath: string;
  onClose: () => void;
  onSubmit: (payload: SupportTicketPayload) => Promise<void>;
}

const emptyForm = {
  fullName: "",
  email: "",
  organizationName: "",
  summary: "",
  details: "",
  stepsToReproduce: "",
  expectedOutcome: "",
  actualOutcome: "",
};

export function SupportModal(props: Props) {
  const [form, setForm] = useState(emptyForm);
  const [screenshotName, setScreenshotName] = useState("");
  const [screenshotContentType, setScreenshotContentType] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!props.isOpen) {
      setForm(emptyForm);
      setScreenshotName("");
      setScreenshotContentType("");
      setScreenshotDataUrl("");
      setTurnstileToken("");
      setLocalError("");
    }
  }, [props.isOpen]);

  const canSubmit = useMemo(
    () => Boolean(form.fullName.trim() && form.email.trim() && form.summary.trim() && form.details.trim()),
    [form]
  );

  if (!props.isOpen) {
    return null;
  }

  const combinedError = localError || props.errorMessage;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setScreenshotName("");
      setScreenshotContentType("");
      setScreenshotDataUrl("");
      setLocalError("");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setLocalError("The screenshot is too large. Use an image under about 3 MB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setScreenshotName(file.name);
      setScreenshotContentType(file.type || "image/png");
      setScreenshotDataUrl(dataUrl);
      setLocalError("");
    } catch {
      setLocalError("The screenshot could not be read. Try a different image file.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");

    if (!canSubmit) {
      setLocalError("Add your name, email, a short summary, and enough detail for someone to understand the issue.");
      return;
    }

    await props.onSubmit({
      fullName: form.fullName,
      email: form.email,
      ...(form.organizationName.trim() ? { organizationName: form.organizationName } : {}),
      summary: form.summary,
      details: form.details,
      ...(form.stepsToReproduce.trim() ? { stepsToReproduce: form.stepsToReproduce } : {}),
      ...(form.expectedOutcome.trim() ? { expectedOutcome: form.expectedOutcome } : {}),
      ...(form.actualOutcome.trim() ? { actualOutcome: form.actualOutcome } : {}),
      currentPath: props.currentPath,
      activeTab: props.activeTab,
      ...(screenshotName ? { screenshotName } : {}),
      ...(screenshotContentType ? { screenshotContentType } : {}),
      ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
      ...(turnstileToken ? { turnstileToken } : {}),
    });
  };

  return (
    <div className="nm-modal-backdrop" onClick={props.onClose} role="presentation">
      <div className="nm-modal-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Help and support">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Help and support</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Report a bug or ask for help</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Send enough detail for review, including what you expected, what happened instead, and a screenshot if you can take one.
              Tickets are directed to <strong>{props.supportEmail}</strong>.
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium">
            Close
          </button>
        </div>

        {props.statusMessage ? <div className="nm-inline-success mt-4">{props.statusMessage}</div> : null}
        {combinedError ? <div className="nm-inline-error mt-4">{combinedError}</div> : null}

        <form className="mt-5 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
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

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Organization name
            <input className="input" value={form.organizationName} onChange={(event) => setForm((current) => ({ ...current, organizationName: event.target.value }))} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Short summary
            <input className="input" value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Example: Immediate safety history did not save correctly" />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            What happened?
            <textarea className="textarea min-h-[140px]" value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Steps to reproduce
              <textarea className="textarea min-h-[110px]" value={form.stepsToReproduce} onChange={(event) => setForm((current) => ({ ...current, stepsToReproduce: event.target.value }))} />
            </label>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Expected result
                <textarea className="textarea min-h-[72px]" value={form.expectedOutcome} onChange={(event) => setForm((current) => ({ ...current, expectedOutcome: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Actual result
                <textarea className="textarea min-h-[72px]" value={form.actualOutcome} onChange={(event) => setForm((current) => ({ ...current, actualOutcome: event.target.value }))} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div><strong>Context captured automatically</strong></div>
            <div className="mt-2">Tab: {props.activeTab}</div>
            <div>Page: {props.currentPath}</div>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Optional screenshot
            <input accept="image/*" className="input" onChange={(event) => void handleFileChange(event)} type="file" />
          </label>

          <TurnstileWidget action="support_ticket_submit" onTokenChange={setTurnstileToken} />

          {screenshotDataUrl ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{screenshotName}</div>
              <img alt="Support screenshot preview" className="mt-3 max-h-64 rounded-2xl border border-slate-200 object-contain" src={screenshotDataUrl} />
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={props.onClose} className="app-secondary-button rounded-2xl px-4 py-3 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || props.isSubmitting} className="app-primary-button rounded-2xl px-4 py-3 font-medium disabled:opacity-60">
              {props.isSubmitting ? "Sending ticket..." : "Send support ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid_file")));
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}
