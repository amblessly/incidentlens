import { createHash } from "node:crypto";

/**
 * Content of a remediation action that participates in the plan fingerprint.
 * Kept explicit so a plan mutation anywhere (summary, action, order) is
 * detected at execution time.
 */
export interface PlanHashAction {
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

/**
 * Deterministic fingerprint of a remediation plan.
 *
 * The hash is computed over the plan summary and every action field, and
 * stored on the plan row at generation time. The execution service recomputes
 * it and rejects execution if the stored hash no longer matches — the plan
 * changed after approval.
 */
export function computePlanHash(summary: string, actions: PlanHashAction[]): string {
  const canonical = JSON.stringify({
    summary,
    actions: actions.map((a) => ({
      order_index: a.order_index,
      description: a.description,
      expected_impact: a.expected_impact,
      risk_level: a.risk_level,
      rollback_strategy: a.rollback_strategy,
      affected_resources: a.affected_resources,
      reason: a.reason,
      evidence_refs: a.evidence_refs,
      approval_required: a.approval_required,
      blast_radius: a.blast_radius ?? null,
      prerequisites: a.prerequisites ?? null,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
