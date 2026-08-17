import { MANUAL_RECOVERY_LABEL, INVESTIGATOR_NAME } from "@/lib/constants";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/format";
import { addEvent, getIncident, updateIncidentStatus } from "@/lib/services/incidents";
import { getPlan } from "@/lib/services/plans";
import { computePlanHash } from "@/lib/services/plan-hash";
import type { PlanWithActions } from "@/lib/services/incidents";

export class ExecutionError extends Error {}

/** How long an approval stays valid before execution is refused. */
const APPROVAL_TTL_MS = Number(process.env.APPROVAL_TTL_MS ?? 60 * 60 * 1000);

function isApprovalExpired(approvedAt: string | null): boolean {
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

/**
 * Execution boundary — the only path that moves a plan to "executed".
 *
 * Nothing here mutates infrastructure; IncidentLens is a planner. But the
 * same hard gates apply before a real executor can be attached:
 *
 * - a valid approved plan exists
 * - the approval has not expired
 * - the plan hash is unchanged since approval
 * - no action depends on manual recovery (blocks one-click execution)
 * - an explicit user action invoked this call
 */
export function executePlan(
  incidentId: string,
  opts: { executedBy?: string } = {},
): PlanWithActions {
  const incident = getIncident(incidentId);
  if (!incident) throw new ExecutionError("Incident not found.");

  const plan = getPlan(incidentId);
  if (!plan) throw new ExecutionError("No remediation plan exists for this incident.");
  if (plan.status !== "approved") {
    throw new ExecutionError(
      `Plan cannot be executed in its current state (${plan.status}).`,
    );
  }
  if (isApprovalExpired(plan.approved_at)) {
    throw new ExecutionError(
      "Approval has expired. Approve the plan again before it can be executed.",
    );
  }
  if (recomputePlanHash(plan) !== plan.hash) {
    throw new ExecutionError(
      "The plan changed since it was approved. Regenerate and re-approve it before execution.",
    );
  }
  if (planRequiresManualRecovery(plan)) {
    throw new ExecutionError(
      "This plan contains actions with no automated rollback. Manual recovery is required and one-click execution is blocked.",
    );
  }

  const executedBy = opts.executedBy ?? INVESTIGATOR_NAME;
  const startedAt = nowIso();
  addEvent(
    incidentId,
    "execution_started",
    "Execution started",
    `Executing approved plan #${plan.id} (${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"}).`,
    executedBy,
    startedAt,
  );

  const finishedAt = nowIso();
  // Simulated execution for audit purposes — this planner never mutates
  // infrastructure. A real executor would plug in here.
  const result =
    plan.actions.length > 0
      ? `Plan #${plan.id} executed: all ${plan.actions.length} action(s) applied (simulated — no infrastructure was mutated).`
      : `Plan #${plan.id} executed: no actions to apply.`;

  db()
    .prepare(
      "UPDATE remediation_plans SET status = 'executed', executed_at = ?, executed_by = ?, execution_result = ?, rollback_result = NULL WHERE id = ?",
    )
    .run(finishedAt, executedBy, result, plan.id);

  addEvent(incidentId, "execution_result", "Execution result", result, executedBy, finishedAt);
  addEvent(
    incidentId,
    "remediation_executed",
    "Remediation executed",
    "Approved remediation applied.",
    executedBy,
    finishedAt,
  );
  updateIncidentStatus(incidentId, "resolved", { resolvedAt: finishedAt });
  addEvent(
    incidentId,
    "incident_resolved",
    "Incident resolved",
    "Service confirmed back to baseline.",
    executedBy,
    finishedAt,
  );

  return getPlan(incidentId) as PlanWithActions;
}

/**
 * Records a rollback for an executed plan and reopens the incident for
 * continued investigation. Rollback strategies come from the plan actions.
 */
export function rollbackPlan(
  incidentId: string,
  opts: { executedBy?: string } = {},
): PlanWithActions {
  const incident = getIncident(incidentId);
  if (!incident) throw new ExecutionError("Incident not found.");

  const plan = getPlan(incidentId);
  if (!plan) throw new ExecutionError("No remediation plan exists for this incident.");
  if (plan.status !== "executed") {
    throw new ExecutionError("Only executed plans can be rolled back.");
  }

  const executedBy = opts.executedBy ?? INVESTIGATOR_NAME;
  const at = nowIso();
  const strategies = plan.actions
    .map((a) => a.rollback_strategy)
    .filter((r) => r && r !== MANUAL_RECOVERY_LABEL);
  const summary =
    strategies.length > 0
      ? `Rollback executed: ${strategies.join(" | ")}`
      : "Rollback result: no automated rollback defined — manual recovery required.";

  db()
    .prepare("UPDATE remediation_plans SET rollback_result = ? WHERE id = ?")
    .run(summary, plan.id);
  addEvent(incidentId, "rollback_result", "Rollback result", summary, executedBy, at);
  updateIncidentStatus(incidentId, "investigating");

  return getPlan(incidentId) as PlanWithActions;
}
