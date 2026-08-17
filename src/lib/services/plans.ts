import { db } from "@/lib/db";
import { CLANKER_AGENT_NAME, INVESTIGATOR_NAME } from "@/lib/constants";
import { getScenarioForIncident } from "@/lib/demo/generator";
import type { DemoScenario } from "@/lib/demo/scenarios";
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
import type { RiskLevel } from "@/lib/types";

export class PlanError extends Error {}

export function getPlan(incidentId: string): PlanWithActions | null {
  return getIncidentFull(incidentId)?.plan ?? null;
}

function synthesizeActions(scenario: DemoScenario): NonNullable<DemoScenario["plan"]> {
  const { incident } = scenario;
  const evidenceTitles = scenario.evidence.map((e) => e.title);
  return {
    summary:
      "Human-reviewed remediation plan derived from the investigation evidence. No action executes without explicit approval.",
    planStatus: "pending_approval",
    actions: [
      {
        description: `Roll back or disable the most recent change to ${incident.service}.`,
        expectedImpact: "Reverts the most probable trigger; service metrics should return toward baseline.",
        risk: "high",
        rollback: "Re-apply the change if a different cause is later confirmed.",
        resources: [`service/${incident.service}`],
        reason: "The leading hypothesis points at a recent change as the trigger.",
        evidenceTitles: evidenceTitles.slice(0, 2),
        approvalRequired: true,
        blastRadius: `All traffic served by ${incident.service}.`,
        prerequisites: [`Previous stable version of ${incident.service} available`],
      },
      {
        description: `Verify ${incident.service} health signals return to baseline.`,
        expectedImpact: "Confirms whether the intervention resolved the incident.",
        risk: "low",
        rollback: "Not applicable — observation only.",
        resources: [`metrics/${incident.service}`],
        reason: "Evidence shows abnormal signal during the incident window.",
        evidenceTitles: evidenceTitles.slice(0, 1),
        approvalRequired: false,
        blastRadius: "None — read-only diagnostics.",
        prerequisites: ["Read access to metrics dashboards"],
      },
      {
        description: `File a follow-up to fix the underlying defect before re-release.`,
        expectedImpact: "Prevents recurrence.",
        risk: "low",
        rollback: "Not applicable — process change.",
        resources: [`repo/${incident.repository ?? "unknown"}`],
        reason: "Root cause fix must precede any re-release.",
        evidenceTitles: [],
        approvalRequired: false,
        blastRadius: "None — no production change.",
        prerequisites: ["Repository access to file a follow-up"],
      },
    ],
  };
}

export function generatePlan(incidentId: string): PlanWithActions {
  const incident = getIncident(incidentId);
  if (!incident) throw new PlanError("Incident not found.");
  if (incident.status === "resolved") {
    throw new PlanError("Resolved incidents cannot have a new remediation plan.");
  }

  const existing = getPlan(incidentId);
  if (existing && existing.status !== "rejected") {
    throw new PlanError("A remediation plan already exists for this incident.");
  }

  if (!hasCompletedInvestigation(incidentId)) {
    throw new PlanError(
      "Investigation must complete before a remediation plan can be generated.",
    );
  }

  const d = db();
  if (existing) {
    d.prepare("DELETE FROM remediation_plans WHERE id = ?").run(existing.id);
  }

  const scenario = getScenarioForIncident({
    incidentId: incident.id,
    title: incident.title,
    description: incident.description,
    service: incident.service,
    severity: incident.severity,
    startedAt: incident.started_at,
    deploymentId: incident.deployment_id,
    repository: incident.repository,
    alertPayload: incident.alert_payload,
  });
  const planSpec = scenario.plan ?? synthesizeActions(scenario);
  const created = nowIso();

  const planResult = d
    .prepare(
      "INSERT INTO remediation_plans (incident_id, status, summary, created_at) VALUES (?, 'pending_approval', ?, ?)",
    )
    .run(incidentId, planSpec.summary, created);
  const planId = Number(planResult.lastInsertRowid);

  const insertAction = d.prepare(`
    INSERT INTO remediation_actions (plan_id, order_index, description, expected_impact, risk_level, rollback_strategy, affected_resources, reason, evidence_refs, approval_required, blast_radius, prerequisites)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const actionRows: Parameters<typeof computePlanHash>[1] = [];
  planSpec.actions.forEach((a, i) => {
    insertAction.run(
      planId,
      i,
      a.description,
      a.expectedImpact,
      a.risk as RiskLevel,
      a.rollback,
      JSON.stringify(a.resources),
      a.reason,
      JSON.stringify(a.evidenceTitles),
      a.approvalRequired ? 1 : 0,
      a.blastRadius ?? null,
      a.prerequisites ? JSON.stringify(a.prerequisites) : null,
    );
    actionRows.push({
      order_index: i,
      description: a.description,
      expected_impact: a.expectedImpact,
      risk_level: a.risk as RiskLevel,
      rollback_strategy: a.rollback,
      affected_resources: JSON.stringify(a.resources),
      reason: a.reason,
      evidence_refs: JSON.stringify(a.evidenceTitles),
      approval_required: a.approvalRequired ? 1 : 0,
      blast_radius: a.blastRadius ?? null,
      prerequisites: a.prerequisites ? JSON.stringify(a.prerequisites) : null,
    });
  });

  d.prepare("UPDATE remediation_plans SET hash = ? WHERE id = ?").run(
    computePlanHash(planSpec.summary, actionRows),
    planId,
  );

  addEvent(incidentId, "remediation_proposed", "Remediation plan proposed", planSpec.summary, CLANKER_AGENT_NAME, created);
  addEvent(incidentId, "approval_requested", "Human approval requested", "Remediation plan awaiting review.", INVESTIGATOR_NAME, created);
  updateIncidentStatus(incidentId, "awaiting_approval");

  return getPlan(incidentId) as PlanWithActions;
}

export function approvePlan(incidentId: string, approvedBy: string): PlanWithActions {
  const plan = getPlan(incidentId);
  if (!plan) throw new PlanError("No remediation plan exists for this incident.");
  if (plan.status !== "pending_approval") {
    throw new PlanError(`Plan cannot be approved in its current state (${plan.status}).`);
  }
  const at = nowIso();
  if (!plan.hash) {
    db()
      .prepare("UPDATE remediation_plans SET hash = ? WHERE id = ?")
      .run(computePlanHash(plan.summary, plan.actions), plan.id);
  }
  db()
    .prepare("UPDATE remediation_plans SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ?")
    .run(at, approvedBy, plan.id);
  addEvent(incidentId, "approval_granted", "Approval granted", `Remediation plan approved by ${approvedBy}.`, approvedBy, at);
  updateIncidentStatus(incidentId, "approved");
  return getPlan(incidentId) as PlanWithActions;
}

export function rejectPlan(incidentId: string, reason: string): PlanWithActions {
  const plan = getPlan(incidentId);
  if (!plan) throw new PlanError("No remediation plan exists for this incident.");
  if (plan.status !== "pending_approval") {
    throw new PlanError(`Plan cannot be rejected in its current state (${plan.status}).`);
  }
  const at = nowIso();
  db()
    .prepare("UPDATE remediation_plans SET status = 'rejected', rejection_reason = ? WHERE id = ?")
    .run(reason, plan.id);
  addEvent(incidentId, "approval_rejected", "Approval rejected", reason, INVESTIGATOR_NAME, at);
  updateIncidentStatus(incidentId, "investigating");
  return getPlan(incidentId) as PlanWithActions;
}

/**
 * Records a "plan viewed" audit event. Called when the remediation plan page
 * renders so the review trail shows who opened the plan for review.
 */
export function recordPlanViewed(incidentId: string): void {
  const plan = getPlan(incidentId);
  if (!plan) return;
  addEvent(
    incidentId,
    "plan_viewed",
    "Plan viewed",
    `Remediation plan #${plan.id} was opened for review.`,
    null,
  );
}
