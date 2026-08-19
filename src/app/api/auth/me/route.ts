import { apiError, json, requestId } from "@/lib/api";
import { clearSessionCookieValue } from "@/lib/auth/session";
import { sessionUser } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { recordAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    const user = await sessionUser();
    if (user) {
      recordAudit({ action: "auth.logout", detail: `User ${user.email} logged out.`, userId: user.id, userName: user.name, workspaceId: user.workspace_id });
    }
    const res = json({ ok: true }, undefined, request);
    res.headers.append("Set-Cookie", clearSessionCookieValue());
    return res;
  });
}

export async function GET(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    const user = await sessionUser();
    if (!user) return apiError("Not authenticated.", 401, { code: "UNAUTHORIZED", request });
    return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, workspace_id: user.workspace_id } }, undefined, request);
  });
}