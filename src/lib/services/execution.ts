import { randomUUID } from "node:crypto";

import { MANUAL_RECOVERY_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { IncidentLensError, providerErrorMessage } from "@/lib/errors";
import { getExecutionProvider } from "@/lib/execution/registry";
import type { StructuredOp } from "@/lib/execution/types";
import { nowIso } from "@/lib/format";
import { executionLogger } from "@/lib/log";
import { activeApproval, APPROVAL_TTL_MS, getPlan } from "@/lib/services/plans";
import { computePlanHash } from "@/lib/services/plan-hash";
import {
  addEvent,
  getIncident,
  updateIncidentStatus,
  type ActionRow,
  type PlanWithActions,
} from "@/lib/services/incidents";

export class ExecutionError extends IncidentLensError {
  constructor(code: "EXECUTION_BLOCKED" | "EXECUTION_FAILED" | "INVALID_REQUEST", message: string) {
    super(code, message);
  }
}

function isApprovalExpired(approvedAt: string | null, approvalExpiresAt: string | null): boolean {
  if (approvalExpiresAt) {
    return Date.now() > new Date(approvalExpiresAt).getTime();
  }
  if (!approvedAt) return true;
  return Date.now() - new Date(approvedAt).getTime() > APPROVAL_TTL_MS;
}

/** True when at least one action has no automated rollback defined. */
export function planRequiresManualRecovery(plan: PlanWithActions): boolean {
  return plan.actions.some((a) => a.rollback_strategy === MANUAL_RECOVERY_LABEL);
}

/** Recompute the plan fingerprint from its current rows. */
export function recomputePlanHash(plan: PlanWithActions): string {
  return computePlanHash(plan.summary, plan.actions);
}

function resourcesOf(action: ActionRow): string[] {
  try {
    const parsed = JSON.parse(action.affected_resources) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Map a plan action to an allow-listed structured op, or null if none. */
export function mapActionToOp(action: ActionRow): StructuredOp | null {
  const service = resourcesOf(action)
    .map((r) =>
      r.startsWith("service/") || r.startsWith("config/") || r.startsWith("database/")
        ? r.slice(r.indexOf("/") + 1)
        : null,
    )
    .find((s): s is string => Boolean(s)) ?? null;

  const description = action.description.toLowerCase();

  if (description.startsWith("roll back")) {
    return { op: "rollback_deployment", service: service ?? "unknown" };
  }
  if (description.startsWith("run targeted diagnostics")) {
    return { op: "run_readonly_check", service: service ?? "unknown", check: "diagnostics" };
  }
  if (description.startsWith("verify")) {
    return { op: "run_readonly_check", service: service ?? "unknown", check: "health" };
  }
  return null;
}

export interface ExecutionOutcome {
  plan: PlanWithActions;
  executions: number;
  succeeded: number;
  failed: number;
  blocked: number;
}

/**
 * Execution boundary — the only path that moves a plan to "executed".
 *
 * Hard gates (all must pass):
 * - an approved plan exists and the approval is recorded in `approvals`
 * - the approval has not expired (approval_expires_at / APPROVAL_TTL_MS)
 * - the plan fingerprint is unchanged since approval (execution recomputes
 *   the hash; a modified plan is rejected)
 * - no action requires manual recovery (blocks one-click execution)
 * - the actor is authorized (enforced by the API route via permissions)
 *
 * Every action produces an `executions` row with status
 * succeeded | failed | blocked, the executing provider, result/error.
 */
export async function executePlan(
  incidentId: string,
  actor: { id: string; name: string },
): Promise<ExecutionOutcome> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new ExecutionError("INVALID_REQUEST", "Incident not found.");

  const plan = await getPlan(incidentId);
  if (!plan) throw new ExecutionError("INVALID_REQUEST", "No remediation plan exists for this incident.");
  if (plan.status !== "approved") {
    throw new ExecutionError(
      "EXECUTION_BLOCKED",
      `Plan cannot be executed in its current state (${plan.status}).`,
    );
  }

  const approval = await activeApproval(plan.id);
  if (!approval) {
    throw new ExecutionError(
      "EXECUTION_BLOCKED",
      "No active approval record exists for this plan. Approve the plan again before execution.",
    );
  }
  if (isApprovalExpired(plan.approved_at, plan.approval_expires_at)) {
    throw new ExecutionError(
      "EXECUTION_BLOCKED",
      "Approval has expired. Approve the plan again before it can be executed.",
    );
  }
  const currentHash = recomputePlanHash(plan);
  if (currentHash !== plan.hash || currentHash !== approval.plan_hash) {
    throw new ExecutionError(
      "EXECUTION_BLOCKED",
      "The plan changed since it was approved. Regenerate and re-approve it before execution.",
    );
  }
  if (planRequiresManualRecovery(plan)) {
    throw new ExecutionError(
      "EXECUTION_BLOCKED",
      "This plan contains actions with no automated rollback. Manual recovery is required and one-click execution is blocked.",
    );
  }

  const provider = getExecutionProvider();
  const d = db();
  const startedAt = nowIso();
  await addEvent(
    incidentId,
    "execution_started",
    "Execution started",
    `Executing approved plan #${plan.id} (${plan.actions.length} actions) via ${provider.providerName}.`,
    actor.name,
    startedAt,
  );
  executionLogger.info("execution started", { incidentId, planId: plan.id, actor: actor.name, provider: provider.providerType });

  const outcomes: { actionId: number; status: string; result: string; error: string | null }[] = [];
  const insertExecution = d.prepare(`
    INSERT INTO executions (id, incident_id, plan_id, action_id, actor, actor_id, status, provider, result, error, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const action of plan.actions) {
    const executionId = `EXEC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const at = nowIso();
    const op = mapActionToOp(action);

    if (!op) {
      const message =
        "Action cannot be mapped to an allow-listed operation. Manual recovery required.";
      await insertExecution.run(
        executionId, incidentId, plan.id, action.id, actor.name, actor.id,
        "blocked", provider.providerType, null, message, at, at,
      );
      outcomes.push({ actionId: action.id, status: "blocked", result: "", error: "EXECUTION_BLOCKED" });
      executionLogger.warn("action blocked (no allow-listed op)", { incidentId, planId: plan.id, actionId: action.id });
      continue;
    }

    try {
      const result = await provider.execute(op);
      const finished = nowIso();
      await insertExecution.run(
        executionId, incidentId, plan.id, action.id, actor.name, actor.id,
        result.status, provider.providerType, result.result, result.error ?? null, at, finished,
      );
      outcomes.push({ actionId: action.id, status: result.status, result: result.result, error: result.error ?? null });
    } catch (error) {
      const message = providerErrorMessage(error);
      const finished = nowIso();
      await insertExecution.run(
        executionId, incidentId, plan.id, action.id, actor.name, actor.id,
        "failed", provider.providerType, null, message, at, finished,
      );
      outcomes.push({ actionId: action.id, status: "failed", result: "", error: message });
      executionLogger.error("action execution failed", { incidentId, planId: plan.id, actionId: action.id, error: message });
    }
  }

  const succeeded = outcomes.filter((o) => o.status === "succeeded").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const blocked = outcomes.filter((o) => o.status === "blocked").length;
  const finishedAt = nowIso();

  if (blocked === 0 && failed === 0) {
    await d
      .prepare(
        "UPDATE remediation_plans SET status = 'executed', executed_at = ?, executed_by = ?, execution_result = ? WHERE id = ?",
      )
      .run(
        finishedAt,
        actor.name,
        `Plan #${plan.id} executed: ${succeeded} action(s) applied via ${provider.providerName}.`,
        plan.id,
      );
    await addEvent(incidentId, "execution_result", "Execution result", `All ${succeeded} action(s) succeeded.`, actor.name, finishedAt);
    await addEvent(incidentId, "remediation_executed", "Remediation executed", "Approved remediation applied.", actor.name, finishedAt);
    await updateIncidentStatus(incidentId, "resolved", { resolvedAt: finishedAt });
    await addEvent(incidentId, "incident_resolved", "Incident resolved", "All approved actions completed.", actor.name, finishedAt);
  } else {
    await d
      .prepare(
        "UPDATE remediation_plans SET execution_result = ? WHERE id = ?",
      )
      .run(
        `Plan #${plan.id}: ${succeeded} succeeded, ${failed} failed, ${blocked} blocked. Plan remains approved — resolve failures before retrying.`,
        plan.id,
      );
    await addEvent(incidentId, "execution_result", "Execution result", `Partial execution: ${succeeded} succeeded, ${failed} failed, ${blocked} blocked.`, actor.name, finishedAt);
  }

  return {
    plan: (await getPlan(incidentId)) as PlanWithActions,
    executions: outcomes.length,
    succeeded,
    failed,
    blocked,
  };
}

/**
 * Records a rollback for an executed plan and reopens the incident for
 * continued investigation. Rollback strategies come from the plan actions.
 */
export async function rollbackPlan(
  incidentId: string,
  actor: { id: string; name: string },
): Promise<PlanWithActions> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new ExecutionError("INVALID_REQUEST", "Incident not found.");

  const plan = await getPlan(incidentId);
  if (!plan) throw new ExecutionError("INVALID_REQUEST", "No remediation plan exists for this incident.");
  if (plan.status !== "executed") {
    throw new ExecutionError("EXECUTION_BLOCKED", "Only executed plans can be rolled back.");
  }

  const at = nowIso();
  const strategies = plan.actions
    .map((a) => a.rollback_strategy)
    .filter((r) => r && r !== MANUAL_RECOVERY_LABEL);
  const summary =
    strategies.length > 0
      ? `Rollback executed: ${strategies.join(" | ")}`
      : "Rollback result: no automated rollback defined — manual recovery required.";

  await db()
    .prepare("UPDATE remediation_plans SET rollback_result = ? WHERE id = ?")
    .run(summary, plan.id);
  await addEvent(incidentId, "rollback_result", "Rollback result", summary, actor.name, at);
  await updateIncidentStatus(incidentId, "investigating");
  executionLogger.info("plan rolled back", { incidentId, planId: plan.id, actor: actor.name });

  return (await getPlan(incidentId)) as PlanWithActions;
}