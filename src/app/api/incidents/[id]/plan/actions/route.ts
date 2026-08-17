import { apiError, json } from "@/lib/api";
import { ExecutionError, executePlan, rollbackPlan } from "@/lib/services/execution";
import { approvePlan, PlanError, rejectPlan } from "@/lib/services/plans";
import { planDecisionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/incidents/[id]/plan/actions">) {
  const { id } = await ctx.params;
  const parsed = planDecisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    switch (parsed.data.action) {
      case "approve":
        return json({ plan: approvePlan(id, parsed.data.approvedBy) });
      case "reject":
        return json({ plan: rejectPlan(id, parsed.data.reason ?? "No reason provided.") });
      case "execute":
        return json({ plan: executePlan(id, { executedBy: parsed.data.executedBy }) });
      case "rollback":
        return json({ plan: rollbackPlan(id, { executedBy: parsed.data.executedBy }) });
    }
  } catch (error) {
    if (error instanceof PlanError || error instanceof ExecutionError) {
      return apiError(error.message, 400);
    }
    console.error("[plan] action failed", error);
    return apiError("Plan action failed unexpectedly.", 500);
  }
}
