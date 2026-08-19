import { describe, expect, it } from "vitest";

import { computePlanHash, type PlanHashAction } from "@/lib/services/plan-hash";

function actions(): PlanHashAction[] {
  return [
    {
      order_index: 1,
      description: "Roll back checkout-api to v1.4.2",
      expected_impact: "Restores previous known-good version",
      risk_level: "medium",
      rollback_strategy: "Redeploy previous image",
      affected_resources: '["service/checkout-api"]',
      reason: "Deploy v1.5.0 correlates with the error spike",
      evidence_refs: "[\"ev_3f9a\"]",
      approval_required: 1,
      blast_radius: "checkout flow only",
      prerequisites: null,
    },
  ];
}

describe("computePlanHash", () => {
  it("is deterministic for identical plans", () => {
    expect(computePlanHash("summary", actions())).toBe(computePlanHash("summary", actions()));
  });

  it("changes when the summary changes", () => {
    expect(computePlanHash("summary A", actions())).not.toBe(
      computePlanHash("summary B", actions()),
    );
  });

  it("changes when any action field changes", () => {
    const base = actions();
    const edited = computePlanHash("summary", base);
    const cases: Array<(a: PlanHashAction[]) => PlanHashAction[]> = [
      (as) => as.map((a) => ({ ...a, description: a.description + " (updated)" })),
      (as) => as.map((a) => ({ ...a, risk_level: "high" })),
      (as) => as.map((a) => ({ ...a, rollback_strategy: "different strategy" })),
      (as) => as.map((a) => ({ ...a, affected_resources: '["service/other"]' })),
      (as) => as.map((a) => ({ ...a, evidence_refs: "[]" })),
      (as) => as.map((a) => ({ ...a, approval_required: 0 })),
      (as) => as.map((a) => ({ ...a, blast_radius: "wide" })),
      (as) => [...as, { ...as[0], order_index: 2 }],
    ];
    for (const mutate of cases) {
      expect(computePlanHash("summary", mutate(structuredClone(base)))).not.toBe(edited);
    }
  });
});