import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { db } from "@/lib/db";
import {
  createIncident,
  getIncident,
  getIncidentFull,
  type CreateIncidentInput,
} from "@/lib/services/incidents";
import { runInvestigation } from "@/lib/services/investigation";
import { generatePlan, approvePlan, rejectPlan } from "@/lib/services/plans";
import {
  executePlan,
  rollbackPlan,
  ExecutionError,
  mapActionToOp,
} from "@/lib/services/execution";
import { computePlanHash } from "@/lib/services/plan-hash";
import { MANUAL_RECOVERY_LABEL } from "@/lib/constants";
import { IncidentLensError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit";

const ACTOR = { id: "u-admin", name: "Admin User" };
const created: string[] = [];

function makeIncident(overrides: Partial<CreateIncidentInput> = {}): string {
  const incident = createIncident({
    title: "Elevated 5xx on api-gateway",
    service: "api-gateway",
    severity: "SEV-2",
    description: "Error rate above threshold",
    startedAt: new Date().toISOString(),
    actorName: "test",
    ...overrides,
  });
  created.push(incident.id);
  return incident.id;
}

beforeAll(() => {
  // A user row the approval/audit trail can reference.
  db()
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
    )
    .run(ACTOR.id, "admin@test.local", "not-a-real-hash", ACTOR.name, "admin", new Date().toISOString());
});

afterAll(() => {
  for (const id of created) {
    db().prepare("DELETE FROM incidents WHERE id = ?").run(id);
  }
  db().prepare("DELETE FROM users WHERE id = ?").run(ACTOR.id);
});

describe("incident → investigation → plan → approval → execution (E2E)", () => {
  it("runs the full remediation lifecycle in demo mode", async () => {
    const id = makeIncident();

    // Investigation persists evidence and hypotheses with a run id.
    const result = await runInvestigation(id, { initiatedBy: ACTOR.name });
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.hypotheses.length).toBeGreaterThan(0);

    const full = getIncidentFull(id);
    expect(full!.runs.length).toBe(1);
    expect(full!.runs[0].status).toBe("completed");
    expect(full!.evidence.length).toBe(result.evidence.length);
    expect(full!.hypotheses.length).toBe(result.hypotheses.length);
    // Hypotheses reference evidence ids that exist.
    for (const h of full!.hypotheses) {
      for (const ref of JSON.parse(h.supporting_evidence ?? "[]") as unknown[]) {
        const evidenceIds = new Set(full!.evidence.map((e) => String(e.id)));
        expect(evidenceIds.has(String(ref))).toBe(true);
      }
    }

    // Plan generation, approval, execution.
    const plan = generatePlan(id);
    expect(plan.status).toBe("pending_approval");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.hash).toBeTruthy();
    expect(plan.approval_expires_at).toBeNull();

    const approved = approvePlan(id, ACTOR);
    expect(approved.status).toBe("approved");
    expect(approved.approval_expires_at).toBeTruthy();
    expect(getIncident(id)!.status).toBe("approved");

    const outcome = await executePlan(id, ACTOR);
    expect(outcome.blocked).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(outcome.succeeded).toBe(outcome.executions);
    const executed = getIncidentFull(id)!.plan!;
    expect(executed.status).toBe("executed");
    expect(executed.executed_by).toBe(ACTOR.name);
    expect(getIncident(id)!.status).toBe("resolved");

    // Every action produced an executions row.
    const execRows = db()
      .prepare("SELECT * FROM executions WHERE incident_id = ?")
      .all(id);
    expect(execRows.length).toBe(executed.actions.length);

    // Rollback reopens the incident.
    rollbackPlan(id, ACTOR);
    expect(getIncident(id)!.status).toBe("investigating");
  });

  it("rejects execution of a plan modified after approval", async () => {
    const id = makeIncident();
    await runInvestigation(id, { initiatedBy: ACTOR.name });
    const plan = generatePlan(id);
    approvePlan(id, ACTOR);

    db()
      .prepare("UPDATE remediation_actions SET description = description || ' (tampered)' WHERE plan_id = ?")
      .run(plan.id);
    db().prepare("UPDATE remediation_plans SET hash = ? WHERE id = ?").run(
      computePlanHash(plan.summary + "x", plan.actions),
      plan.id,
    );

    await expect(executePlan(id, ACTOR)).rejects.toMatchObject({
      code: "EXECUTION_BLOCKED",
      message: expect.stringContaining("changed since it was approved"),
    });
    expect(getIncidentFull(id)!.plan!.status).toBe("approved");
  });

  it("rejects execution after approval expiry", async () => {
    const id = makeIncident();
    await runInvestigation(id, { initiatedBy: ACTOR.name });
    const plan = generatePlan(id);
    approvePlan(id, ACTOR);

    // Expire the approval in the past.
    db()
      .prepare("UPDATE approvals SET expires_at = ? WHERE plan_id = ?")
      .run(new Date(Date.now() - 60_000).toISOString(), plan.id);
    db()
      .prepare("UPDATE remediation_plans SET approval_expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 60_000).toISOString(), plan.id);

    await expect(executePlan(id, ACTOR)).rejects.toMatchObject({
      code: "EXECUTION_BLOCKED",
      message: expect.stringContaining("expired"),
    });
  });

  it("blocks execution of plans requiring manual recovery", async () => {
    const id = makeIncident();
    await runInvestigation(id, { initiatedBy: ACTOR.name });
    const plan = generatePlan(id);

    // Mark the first action as requiring manual recovery, re-hash, approve.
    db()
      .prepare("UPDATE remediation_actions SET rollback_strategy = ? WHERE plan_id = ? AND order_index = 1")
      .run(MANUAL_RECOVERY_LABEL, plan.id);
    const withManual = getIncidentFull(id)!.plan!;
    db().prepare("UPDATE remediation_plans SET hash = ? WHERE id = ?").run(
      computePlanHash(withManual.summary, withManual.actions),
      plan.id,
    );
    approvePlan(id, ACTOR);

    await expect(executePlan(id, ACTOR)).rejects.toMatchObject({
      code: "EXECUTION_BLOCKED",
      message: expect.stringContaining("Manual recovery"),
    });
  });

  it("requires approval before execution", async () => {
    const id = makeIncident();
    await runInvestigation(id, { initiatedBy: ACTOR.name });
    generatePlan(id);
    await expect(executePlan(id, ACTOR)).rejects.toMatchObject({
      code: "EXECUTION_BLOCKED",
    });
  });

  it("rejection returns the incident to investigating", async () => {
    const id = makeIncident();
    await runInvestigation(id, { initiatedBy: ACTOR.name });
    generatePlan(id);
    rejectPlan(id, "Evidence insufficient", ACTOR.name);
    expect(getIncident(id)!.status).toBe("investigating");
  });
});

describe("execution action mapping", () => {
  it("maps allow-listed descriptions to structured ops", () => {
    const op = mapActionToOp({
      id: 1,
      description: "Roll back checkout-api to v1.4.2",
      affected_resources: '["service/checkout-api"]',
    } as never);
    expect(op).toEqual({ op: "rollback_deployment", service: "checkout-api" });
  });

  it("maps targeted diagnostics and verification", () => {
    expect(mapActionToOp({ description: "Run targeted diagnostics on payments", affected_resources: '["service/payments"]' } as never)).toEqual({
      op: "run_readonly_check",
      service: "payments",
      check: "diagnostics",
    });
    expect(mapActionToOp({ description: "Verify checkout-api health", affected_resources: '["service/checkout-api"]' } as never)).toEqual({
      op: "run_readonly_check",
      service: "checkout-api",
      check: "health",
    });
  });

  it("returns null for unmappable actions", () => {
    expect(mapActionToOp({ description: "Something exotic", affected_resources: '["service/x"]' } as never)).toBeNull();
  });
});

describe("idempotent ingestion", () => {
  it("returns the same incident for the same idempotency key", () => {
    const input: CreateIncidentInput = {
      title: "Repeated alert",
      service: "orders",
      severity: "SEV-3",
      description: "duplicate",
      startedAt: new Date().toISOString(),
      idempotencyKey: "idem-e2e-1",
      source: "test",
    };
    const a = createIncident(input);
    const b = createIncident(input);
    const c = createIncident(input);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
  });
});

describe("audit trail", () => {
  it("records and lists audit events with request id", () => {
    recordAudit({
      userId: "u-admin",
      userName: "Admin User",
      action: "plan.approve",
      incidentId: "INC-9999",
      detail: "test audit entry",
      requestId: "req-audit-1",
    });
    const events = db()
      .prepare("SELECT * FROM audit_events WHERE request_id = ?")
      .all("req-audit-1") as Array<{ action: string; actor_name: string }>;
    expect(events.length).toBe(1);
    expect(events[0].action).toBe("plan.approve");
  });
});

describe("execution error type", () => {
  it("is an IncidentLensError with a stable code", () => {
    const err = new ExecutionError("EXECUTION_BLOCKED", "no");
    expect(err).toBeInstanceOf(IncidentLensError);
    expect(err.code).toBe("EXECUTION_BLOCKED");
    expect(err.message).toBe("no");
  });
});