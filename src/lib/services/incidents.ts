import type { Database } from "@/lib/db";

import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/config";
import { nowIso } from "@/lib/format";
import type { Incident, IncidentEvent, Severity } from "@/lib/types";

export interface IncidentListFilters {
  severity?: string;
  status?: string;
  service?: string;
  q?: string;
}

export interface IncidentListItem extends Incident {
  investigator_name: string | null;
  has_root_cause: number;
  duration_minutes: number;
}

export interface IncidentFull extends Incident {
  events: IncidentEvent[];
  evidence: EvidenceRow[];
  hypotheses: HypothesisRow[];
  runs: RunRow[];
  plan: PlanWithActions | null;
  executions: ExecutionRow[];
}

export interface ExecutionRow {
  id: string;
  incident_id: string;
  plan_id: number;
  action_id: number | null;
  actor: string;
  actor_id: string | null;
  status: string;
  provider: string;
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface EvidenceRow {
  id: number;
  incident_id: string;
  run_id: number | null;
  source: string;
  source_type: string | null;
  title: string;
  observation: string;
  relevance: string;
  confidence: number;
  timestamp: string;
  service: string | null;
  environment: string | null;
  data: string | null;
}

export interface HypothesisRow {
  id: number;
  incident_id: string;
  run_id: number | null;
  title: string;
  description: string;
  confidence: number;
  is_selected: number;
  supporting_evidence: string;
  contradicting_evidence: string | null;
  missing_evidence: string | null;
  next_step: string | null;
  created_at: string;
}

export interface RunRow {
  id: number;
  incident_id: string;
  status: string;
  agent: string;
  provider: string | null;
  prompt_version: string | null;
  initiated_by: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  result: string | null;
}

export interface PlanRow {
  id: number;
  incident_id: string;
  status: string;
  summary: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approval_expires_at: string | null;
  rejection_reason: string | null;
  hash: string | null;
  executed_at: string | null;
  executed_by: string | null;
  execution_result: string | null;
  rollback_result: string | null;
}

export interface ActionRow {
  id: number;
  plan_id: number;
  order_index: number;
  description: string;
  expected_impact: string;
  risk_level: string;
  rollback_strategy: string;
  affected_resources: string;
  reason: string;
  evidence_refs: string;
  approval_required: number;
  blast_radius: string | null;
  prerequisites: string | null;
}

export interface PlanWithActions extends PlanRow {
  actions: ActionRow[];
}

export function listIncidents(filters: IncidentListFilters = {}): IncidentListItem[] {
  const where: string[] = [];
  const params: Record<string, string> = {};

  // Live mode never surfaces demo incidents.
  if (!isDemoMode()) {
    where.push("i.is_demo = 0");
  }

  if (filters.severity) {
    where.push("severity = @severity");
    params.severity = filters.severity;
  }
  if (filters.status) {
    where.push("status = @status");
    params.status = filters.status;
  }
  if (filters.service) {
    where.push("service = @service");
    params.service = filters.service;
  }
  if (filters.q) {
    where.push("(title LIKE @q OR description LIKE @q OR id LIKE @q)");
    params.q = `%${filters.q}%`;
  }

  const sql = `
    SELECT
      i.*,
      u.name AS investigator_name,
      (SELECT COUNT(*) FROM hypotheses h WHERE h.incident_id = i.id AND h.is_selected = 1) AS has_root_cause
    FROM incidents i
    LEFT JOIN users u ON u.id = i.assigned_to
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY i.created_at DESC
  `;

  const rows = db().prepare(sql).all(params) as Omit<IncidentListItem, "duration_minutes">[];

  return rows.map((row) => {
    const start = new Date(row.started_at).getTime();
    const end = row.resolved_at ? new Date(row.resolved_at).getTime() : Date.now();
    return {
      ...row,
      duration_minutes: Math.max(1, Math.round((end - start) / 60_000)),
    };
  });
}

export function getIncident(id: string): Incident | null {
  const row = db()
    .prepare("SELECT * FROM incidents WHERE id = ?")
    .get(id) as Incident | undefined;
  if (!row) return null;
  if (!isDemoMode() && row.is_demo === 1) return null;
  return row;
}

export function getIncidentFull(id: string): IncidentFull | null {
  const incident = getIncident(id);
  if (!incident) return null;

  const events = db()
    .prepare(
      "SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at ASC, id ASC",
    )
    .all(id) as IncidentEvent[];

  const evidence = db()
    .prepare(
      "SELECT * FROM evidence WHERE incident_id = ? ORDER BY confidence DESC, timestamp ASC",
    )
    .all(id) as EvidenceRow[];

  const hypotheses = db()
    .prepare(
      "SELECT * FROM hypotheses WHERE incident_id = ? ORDER BY is_selected DESC, confidence DESC",
    )
    .all(id) as HypothesisRow[];

  const runs = db()
    .prepare(
      "SELECT * FROM investigation_runs WHERE incident_id = ? ORDER BY started_at DESC",
    )
    .all(id) as RunRow[];

  const planRow = db()
    .prepare("SELECT * FROM remediation_plans WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(id) as PlanRow | undefined;

  let plan: PlanWithActions | null = null;
  if (planRow) {
    const actions = db()
      .prepare(
        "SELECT * FROM remediation_actions WHERE plan_id = ? ORDER BY order_index ASC",
      )
      .all(planRow.id) as ActionRow[];
    plan = { ...planRow, actions };
  }

  const executions = db()
    .prepare(
      "SELECT * FROM executions WHERE incident_id = ? ORDER BY started_at ASC",
    )
    .all(id) as ExecutionRow[];

  return { ...incident, events, evidence, hypotheses, runs, plan, executions };
}

export function nextIncidentId(d: Database = db()): string {
  const row = d
    .prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS max_num FROM incidents")
    .get() as { max_num: number | null };
  const next = (row.max_num ?? 0) + 1;
  return `INC-${String(next).padStart(4, "0")}`;
}

export interface CreateIncidentInput {
  title: string;
  service: string;
  severity: Severity;
  description: string;
  startedAt: string;
  deploymentId?: string | null;
  repository?: string | null;
  alertPayload?: string | null;
  assignedTo?: string | null;
  actorName?: string | null;
  workspaceId?: string | null;
  environmentId?: string | null;
  environment?: string | null;
  source?: string | null;
  idempotencyKey?: string | null;
  requestId?: string | null;
  metadata?: string | null;
  providerConnectionId?: string | null;
}

/**
 * Returns an existing incident created with the same idempotency key, or
 * null when the key is new/absent.
 */
export function findByIdempotencyKey(key: string | null): Incident | null {
  if (!key) return null;
  const row = db()
    .prepare("SELECT * FROM incidents WHERE idempotency_key = ?")
    .get(key) as Incident | undefined;
  return row ?? null;
}

export function createIncident(
  input: CreateIncidentInput,
  d: Database = db(),
): Incident {
  // Idempotency: an incident created earlier with the same key is returned
  // instead of creating a duplicate. The API route surfaces this as a 200
  // with duplicate:true.
  if (input.idempotencyKey) {
    const existing = findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
  }

  const id = nextIncidentId(d);
  const now = nowIso();

  const insert = d.prepare(`
    INSERT INTO incidents (id, title, service, severity, status, description, started_at, created_at, resolved_at, assigned_to, deployment_id, repository, alert_payload, is_demo, source, workspace_id, environment_id, environment, idempotency_key, request_id, metadata)
    VALUES (@id, @title, @service, @severity, 'open', @description, @started_at, @created_at, NULL, @assigned_to, @deployment_id, @repository, @alert_payload, 0, @source, @workspace_id, @environment_id, @environment, @idempotency_key, @request_id, @metadata)
  `);
  const insertEvent = d.prepare(`
    INSERT INTO incident_events (incident_id, type, title, description, actor, created_at)
    VALUES (@incident_id, 'incident_created', 'Incident created', @description, @actor, @created_at)
  `);

  d.transaction(() => {
    insert.run({
      id,
      title: input.title,
      service: input.service,
      severity: input.severity,
      description: input.description,
      started_at: input.startedAt,
      created_at: now,
      assigned_to: input.assignedTo ?? null,
      deployment_id: input.deploymentId ?? null,
      repository: input.repository ?? null,
      alert_payload: input.alertPayload ?? null,
      source: input.source ?? null,
      workspace_id: input.workspaceId ?? null,
      environment_id: input.environmentId ?? null,
      environment: input.environment ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      request_id: input.requestId ?? null,
      metadata: (() => {
        const base = input.metadata ? JSON.parse(input.metadata) : {};
        if (input.providerConnectionId) base.provider_connection_id = input.providerConnectionId;
        return Object.keys(base).length > 0 ? JSON.stringify(base) : null;
      })(),
    });
    insertEvent.run({
      incident_id: id,
      description: `Created from ${input.alertPayload ? "alert payload" : input.source ?? "manual entry"}.`,
      actor: input.actorName ?? null,
      created_at: now,
    });
    if (input.alertPayload) {
      d.prepare(`
        INSERT INTO incident_events (incident_id, type, title, description, actor, created_at)
        VALUES (?, 'alert_received', 'Alert received', ?, NULL, ?)
      `).run(id, input.alertPayload.slice(0, 500), now);
    }
  })();

  return getIncident(id) as Incident;
}

export function updateIncidentStatus(
  id: string,
  status: Incident["status"],
  opts: { resolvedAt?: string | null } = {},
): void {
  db()
    .prepare("UPDATE incidents SET status = @status, resolved_at = @resolvedAt WHERE id = @id")
    .run({ id, status, resolvedAt: opts.resolvedAt ?? null });
}

export function addEvent(
  incidentId: string,
  type: IncidentEvent["type"],
  title: string,
  description: string | null,
  actor: string | null,
  at = nowIso(),
  runId: number | null = null,
): void {
  db()
    .prepare(`
      INSERT INTO incident_events (incident_id, run_id, type, title, description, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(incidentId, runId, type, title, description, actor, at);
}

/**
 * Records a timeline event at most once per investigation run. Used for
 * investigation-generated events so the same action can never be written to
 * the timeline twice (e.g. a step callback and the run completion handler).
 */
export function addEventOnce(
  incidentId: string,
  runId: number,
  type: IncidentEvent["type"],
  title: string,
  description: string | null,
  actor: string | null,
  at = nowIso(),
): void {
  db()
    .prepare(`
      INSERT INTO incident_events (incident_id, run_id, type, title, description, actor, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM incident_events
        WHERE incident_id = ? AND run_id = ? AND type = ?
      )
    `)
    .run(incidentId, runId, type, title, description, actor, at, incidentId, runId, type);
}

/**
 * Service options for forms and filters.
 *
 * - Demo mode: from the seeded services table.
 * - Live mode: from the configured infrastructure provider. Returns an
 *   empty list when no provider is configured (never fabricated).
 */
export async function listServices(): Promise<string[]> {
  if (isDemoMode()) {
    const rows = db()
      .prepare("SELECT name FROM services ORDER BY name ASC")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }
  try {
    const { getInfrastructureProvider, providerAvailable } = await import("@/lib/providers/registry");
    if (!providerAvailable()) return [];
    const services = await getInfrastructureProvider().getServices();
    return services.map((s) => s.name);
  } catch {
    return [];
  }
}

export function getUserName(id: string | null): string | null {
  if (!id) return null;
  const row = db().prepare("SELECT name FROM users WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}


