import { db } from "@/lib/db";
import { DEFAULT_AGENT_NAME } from "@/lib/constants";
import { nowIso } from "@/lib/format";
import { computePlanHash } from "@/lib/services/plan-hash";
import {
  addEvent,
  getIncident,
  getIncidentFull,
  updateIncidentStatus,
  type PlanWithActions,
} from "@/lib/services/incidents";
import { hasCompletedInvestigation } from "@/lib/services/investigation";
import type { EngineAction, EngineResult } from "@/lib/investigation/engine";
import type { RiskLevel } from "@/lib/types";

export class PlanError extends Error {}

export async function getPlan(incidentId: string): Promise<PlanWithActions | null> {
  return (await getIncidentFull(incidentId))?.plan ?? null;
}

/** Load the latest completed investigation result for an incident. */
export async function latestInvestigationResult(incidentId: string): Promise<EngineResult | null> {
  const run = (await db()
    .prepare(
      "SELECT result FROM investigation_runs WHERE incident_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
    )
    .get(incidentId)) as { result: string | null } | undefined;
  if (!run?.result) return null;
  try {
    return JSON.parse(run.result) as EngineResult;
  } catch {
    return null;
  }
}

function toPlanActions(engineActions: EngineAction[]): {
  actions: Parameters<typeof computePlanHash>[1];
  hasManualRecovery: boolean;
} {
  const actions: Parameters<typeof computePlanHash>[1] = [];
  for (const [i, a] of engineActions.entries()) {
    actions.push({
      order_index: i,
      description: a.description,
      expected_impact: a.expectedImpact,
      risk_level: a.risk as RiskLevel,
      rollback_strategy: a.rollbackStrategy,
      affected_resources: JSON.stringify(a.resources),
      reason: a.reason,
      evidence_refs: JSON.stringify(a.supportingEvidence),
      approval_required: a.approvalRequired ? 1 : 0,
      blast_radius: a.blastRadius,
      prerequisites: JSON.stringify(a.prerequisites),
    });
  }
  return {
    actions,
    hasManualRecovery: engineActions.some((a) => a.rollbackStrategy === "Manual recovery required"),
  };
}

/**
 * Generates a remediation plan from the stored investigation evidence.
 * Every action references real evidence ids (evidence_refs) and carries an
 * explicit rollback strategy; actions without a safe rollback are marked
 * "Manual recovery required" and cannot be executed automatically.
 */
export async function generatePlan(incidentId: string): Promise<PlanWithActions> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new PlanError("Incident not found.");
  if (incident.status === "resolved") {
    throw new PlanError("Resolved incidents cannot have a new remediation plan.");
  }

  const existing = await getPlan(incidentId);
  if (existing && existing.status !== "rejected") {
    throw new PlanError("A remediation plan already exists for this incident.");
  }

  if (!(await hasCompletedInvestigation(incidentId))) {
    throw new PlanError(
      "Investigation must complete before a remediation plan can be generated.",
    );
  }

  const result = await latestInvestigationResult(incidentId);
  if (!result) {
    throw new PlanError("No investigation result is available for this incident.");
  }

  const d = db();
  if (existing) {
    await d.prepare("DELETE FROM remediation_plans WHERE id = ?").run(existing.id);
  }

  const { actions: actionRows, hasManualRecovery } = toPlanActions(result.recommendedActions);
  const summary = hasManualRecovery
    ? "Plan derived from the investigation evidence. Contains actions requiring manual recovery — automatic execution is blocked for those actions."
    : "Plan derived from the investigation evidence. No action executes without explicit approval.";

  const created = nowIso();

  const planResult = await d
    .prepare(
      "INSERT INTO remediation_plans (incident_id, status, summary, created_at) VALUES (?, 'pending_approval', ?, ?)",
    )
    .run(incidentId, summary, created);
  const planId = Number(planResult.lastInsertRowid);

  const insertAction = d.prepare(`
    INSERT INTO remediation_actions (plan_id, order_index, description, expected_impact, risk_level, rollback_strategy, affected_resources, reason, evidence_refs, approval_required, blast_radius, prerequisites)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of actionRows) {
    await insertAction.run(
      planId,
      a.order_index,
      a.description,
      a.expected_impact,
      a.risk_level,
      a.rollback_strategy,
      a.affected_resources,
      a.reason,
      a.evidence_refs,
      a.approval_required,
      a.blast_radius,
      a.prerequisites,
    );
  }

  await d.prepare("UPDATE remediation_plans SET hash = ? WHERE id = ?").run(
    computePlanHash(summary, actionRows),
    planId,
  );

  await addEvent(incidentId, "remediation_proposed", "Remediation plan proposed", summary, DEFAULT_AGENT_NAME, created);
  await addEvent(incidentId, "approval_requested", "Human approval requested", "Remediation plan awaiting review.", null, created);
  await updateIncidentStatus(incidentId, "awaiting_approval");

  return (await getPlan(incidentId)) as PlanWithActions;
}

/** How long an approval stays valid before execution is refused. */
export const APPROVAL_TTL_MS = Number(process.env.APPROVAL_TTL_MS ?? 60 * 60 * 1000);

/**
 * Approves a plan for the current user. Records the approver identity, the
 * plan fingerprint and the approval expiry in the approvals table. The
 * approval only applies to the exact plan version that was hashed.
 */
export async function approvePlan(
  incidentId: string,
  approvedBy: { id: string; name: string },
): Promise<PlanWithActions> {
  const plan = await getPlan(incidentId);
  if (!plan) throw new PlanError("No remediation plan exists for this incident.");
  if (plan.status !== "pending_approval") {
    throw new PlanError(`Plan cannot be approved in its current state (${plan.status}).`);
  }
  const at = nowIso();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const hash = plan.hash ?? computePlanHash(plan.summary, plan.actions);

  {
    const d = db();
    await d.transaction(async () => {
      await d
        .prepare(
          "UPDATE remediation_plans SET hash = ?, status = 'approved', approved_at = ?, approved_by = ?, approval_expires_at = ? WHERE id = ?",
        )
        .run(hash, at, approvedBy.name, expiresAt, plan.id);
      await d
        .prepare(
          "INSERT INTO approvals (plan_id, approver_id, approver_name, plan_hash, approved_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
        )
        .run(plan.id, approvedBy.id, approvedBy.name, hash, at, expiresAt);
    });
  }

  await addEvent(incidentId, "approval_granted", "Approval granted", `Remediation plan approved by ${approvedBy.name}.`, approvedBy.name, at);
  await updateIncidentStatus(incidentId, "approved");
  return (await getPlan(incidentId)) as PlanWithActions;
}

export async function rejectPlan(
  incidentId: string,
  reason: string,
  rejectedBy: string,
): Promise<PlanWithActions> {
  const plan = await getPlan(incidentId);
  if (!plan) throw new PlanError("No remediation plan exists for this incident.");
  if (plan.status !== "pending_approval") {
    throw new PlanError(`Plan cannot be rejected in its current state (${plan.status}).`);
  }
  const at = nowIso();
  await db()
    .prepare("UPDATE remediation_plans SET status = 'rejected', rejection_reason = ? WHERE id = ?")
    .run(reason, plan.id);
  await addEvent(incidentId, "approval_rejected", "Approval rejected", reason, rejectedBy, at);
  await updateIncidentStatus(incidentId, "investigating");
  return (await getPlan(incidentId)) as PlanWithActions;
}

/**
 * Records a "plan viewed" audit event when the remediation plan page
 * renders, so the review trail shows who opened the plan for review.
 */
export async function recordPlanViewed(incidentId: string, viewerName: string | null): Promise<void> {
  const plan = await getPlan(incidentId);
  if (!plan) return;
  await addEvent(
    incidentId,
    "plan_viewed",
    "Plan viewed",
    `Remediation plan #${plan.id} was opened for review.`,
    viewerName,
  );
}

export interface ApprovalRow {
  id: number;
  plan_id: number;
  approver_id: string;
  approver_name: string;
  plan_hash: string;
  approved_at: string;
  expires_at: string;
  status: string;
}

/** Active approval for a plan, if any. */
export async function activeApproval(planId: number): Promise<ApprovalRow | null> {
  return (
    ((await db()
      .prepare(
        "SELECT * FROM approvals WHERE plan_id = ? AND status = 'active' ORDER BY approved_at DESC LIMIT 1",
      )
      .get(planId)) as ApprovalRow | undefined) ?? null
  );
}