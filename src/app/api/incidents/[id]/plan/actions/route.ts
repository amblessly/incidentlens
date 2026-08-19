import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext, apiLogger } from "@/lib/log";
import { ExecutionError, executePlan, rollbackPlan } from "@/lib/services/execution";
import { approvePlan, PlanError, rejectPlan } from "@/lib/services/plans";
import { recordAudit } from "@/lib/services/audit";
import { planDecisionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Plan decisions — approve / reject / execute / rollback.
 *
 * All decisions require an authenticated session user (API keys are never
 * allowed to approve or execute remediation). The actor is taken from the
 * session so the approval and execution trail identifies the real user.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/incidents/[id]/plan/actions">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const { id } = await ctx.params;
      const user = await requireApiAuth(request);
      if (user.kind !== "session") {
        return apiError("Plan decisions require a session user.", 403, { code: "FORBIDDEN", request });
      }

      const parsed = planDecisionSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400, { request });
      }

      const actor = { id: user.user.id, name: user.user.name };
      const permissionFor = (action: string) =>
        action === "approve"
          ? "plan.approve"
          : action === "reject"
            ? "plan.reject"
            : action === "execute"
              ? "plan.execute"
              : "plan.rollback";

      const requirePermission = (action: string) => {
        const permission = permissionFor(action);
        if (!user.user.hasPermission(permission)) {
          throw new ExecutionError("EXECUTION_BLOCKED", `Missing permission: ${permission}`);
        }
      };

      let result: unknown;
      switch (parsed.data.action) {
        case "approve": {
          requirePermission("approve");
          result = approvePlan(id, actor);
          recordAudit({ action: "plan.approve", detail: `Plan approved by ${user.user.name}`, requestId: rid, userId: user.user.id, userName: user.user.name, workspaceId: user.user.workspace_id, incidentId: id });
          break;
        }
        case "reject": {
          requirePermission("reject");
          result = rejectPlan(id, parsed.data.reason ?? "No reason provided.", user.user.name);
          recordAudit({ action: "plan.reject", detail: `Plan rejected: ${parsed.data.reason ?? "no reason"}`, requestId: rid, userId: user.user.id, userName: user.user.name, workspaceId: user.user.workspace_id, incidentId: id });
          break;
        }
        case "execute": {
          requirePermission("execute");
          result = await executePlan(id, actor);
          recordAudit({ action: "plan.execute", detail: `Plan executed by ${user.user.name}`, requestId: rid, userId: user.user.id, userName: user.user.name, workspaceId: user.user.workspace_id, incidentId: id });
          break;
        }
        case "rollback": {
          requirePermission("rollback");
          result = rollbackPlan(id, actor);
          recordAudit({ action: "plan.rollback", detail: `Plan rolled back by ${user.user.name}`, requestId: rid, userId: user.user.id, userName: user.user.name, workspaceId: user.user.workspace_id, incidentId: id });
          break;
        }
      }

      return json({ plan: result }, undefined, request);
    } catch (error) {
      if (error instanceof PlanError) {
        return apiError(error.message, 400, { code: "PLAN_REJECTED", request });
      }
      if (error instanceof ExecutionError) {
        return apiError(error.message, error.code === "EXECUTION_BLOCKED" ? 403 : 400, { code: error.code, request });
      }
      apiLogger.error("plan action failed", { requestId: rid, error: error instanceof Error ? error.message : String(error) });
      return errorToResponse(error, request);
    }
  });
}