import type { AuditEventInput, D1Database } from "./types";
import { writeAuditEvent } from "./db";

export async function audit(db: D1Database, input: AuditEventInput) {
  await writeAuditEvent(db, input);
}
