import { db } from "@/lib/db";
import { nowIso } from "@/lib/format";
import { auditLogger } from "@/lib/log";

/**
 * Audit log — every important operation in the platform.
 *
 * The audit log is append-only by design; entries are never updated or
 * deleted. It records who did what to which incident/plan/execution.
 */

export interface AuditEventRow {
  id: number;
  request_id: string | null;
  user_id: string | null;
  user_name: string | null;
  workspace_id: string | null;
  incident_id: string | null;
  investigation_run_id: number | null;
  execution_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface AuditInput {
  action: string;
  detail?: string | null;
  requestId?: string | null;
  userId?: string | null;
  userName?: string | null;
  workspaceId?: string | null;
  incidentId?: string | null;
  investigationRunId?: number | null;
  executionId?: string | null;
}

export function recordAudit(input: AuditInput): void {
  const row = db()
    .prepare(
      `INSERT INTO audit_events (request_id, user_id, user_name, workspace_id, incident_id, investigation_run_id, execution_id, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.requestId ?? null,
      input.userId ?? null,
      input.userName ?? null,
      input.workspaceId ?? null,
      input.incidentId ?? null,
      input.investigationRunId ?? null,
      input.executionId ?? null,
      input.action,
      input.detail ?? null,
      nowIso(),
    );
  auditLogger.info(`audit: ${input.action}`, {
    requestId: input.requestId ?? undefined,
    userId: input.userId ?? undefined,
    workspaceId: input.workspaceId ?? undefined,
    incidentId: input.incidentId ?? undefined,
    investigationRunId: input.investigationRunId ?? undefined,
    executionId: input.executionId ?? undefined,
  });
  return row ? undefined : undefined;
}

export function listAuditEvents(limit = 200, incidentId?: string): AuditEventRow[] {
  const rows = incidentId
    ? (db()
        .prepare(
          "SELECT * FROM audit_events WHERE incident_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        )
        .all(incidentId, limit) as AuditEventRow[])
    : (db()
        .prepare("SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(limit) as AuditEventRow[]);
  return rows;
}