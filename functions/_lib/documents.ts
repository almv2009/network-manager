import { getConfig } from "./config";
import type { AppUser, CaseMembershipRecord, CaseSummary } from "../../shared/types";
import type { DocumentUploadInput, Env } from "./types";

export function canUploadDocuments(caseRecord: CaseSummary, membership: CaseMembershipRecord | null, user: AppUser) {
  if (user.userType === "org_admin") return true;
  if (!membership || !membership.active) return false;
  if (caseRecord.status === "closed" && (membership.role === "worker" || membership.role === "supervisor")) {
    return false;
  }
  return true;
}

export function validateDocumentFile(env: Env, file: File) {
  const config = getConfig(env);
  if (!file || !file.name) {
    return { ok: false as const, error: "bad_request", hint: "A document file is required." };
  }
  if (file.size <= 0) {
    return { ok: false as const, error: "bad_request", hint: "The uploaded file is empty." };
  }
  if (file.size > config.documentUploadMaxBytes) {
    return {
      ok: false as const,
      error: "bad_request",
      hint: `The uploaded file exceeds the ${Math.round(config.documentUploadMaxBytes / (1024 * 1024))}MB limit.`,
    };
  }
  if (config.documentAllowedMimeTypes.length > 0 && !config.documentAllowedMimeTypes.includes(file.type)) {
    return {
      ok: false as const,
      error: "bad_request",
      hint: `Files of type ${file.type || "unknown"} are not allowed.`,
    };
  }
  return { ok: true as const };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildDocumentStorageKey(input: DocumentUploadInput) {
  const safeName = sanitizeFileName(input.fileName) || "document";
  const date = new Date().toISOString().slice(0, 10);
  return `organizations/${input.organizationId}/cases/${input.caseId}/${date}/${crypto.randomUUID()}-${safeName}`;
}
