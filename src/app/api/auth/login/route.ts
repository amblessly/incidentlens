import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { createSessionToken, sessionCookieValue } from "@/lib/auth/session";
import { getUserByEmail } from "@/lib/auth/current-user";
import { verifyPassword } from "@/lib/auth/password";
import { withLogContext } from "@/lib/log";
import { recordAudit } from "@/lib/services/audit";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const parsed = loginSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400, { request });
      }

      const user = await getUserByEmail(parsed.data.email.toLowerCase());
      if (!user || !user.password_hash || !verifyPassword(parsed.data.password, user.password_hash)) {
        return apiError("Invalid email or password.", 401, { code: "UNAUTHORIZED", request });
      }

      const token = createSessionToken(user.id);
      await recordAudit({
        action: "auth.login",
        detail: `User ${user.email} logged in.`,
        requestId: rid,
        userId: user.id,
        userName: user.name,
        workspaceId: user.workspace_id,
      });

      const res = json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, undefined, request);
      res.headers.append("Set-Cookie", sessionCookieValue(token));
      return res;
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}