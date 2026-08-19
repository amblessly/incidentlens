import type { db } from "@/lib/db";

export type Role = "admin" | "engineer" | "viewer";

export const ROLES: Role[] = ["admin", "engineer", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  engineer: "Engineer",
  viewer: "Viewer",
};

export type Permission =
  | "incidents.create"
  | "incidents.view"
  | "investigation.run"
  | "plan.generate"
  | "plan.approve"
  | "plan.reject"
  | "plan.execute"
  | "plan.rollback"
  | "settings.manage"
  | "api_keys.manage"
  | "audit.view"
  | "workspace.manage";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "incidents.create",
    "incidents.view",
    "investigation.run",
    "plan.generate",
    "plan.approve",
    "plan.reject",
    "plan.execute",
    "plan.rollback",
    "settings.manage",
    "api_keys.manage",
    "audit.view",
    "workspace.manage",
  ],
  engineer: [
    "incidents.create",
    "incidents.view",
    "investigation.run",
    "plan.generate",
    "plan.approve",
    "plan.reject",
    "plan.execute",
    "plan.rollback",
    "audit.view",
  ],
  viewer: ["incidents.view", "audit.view"],
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  if (!(normalized in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[normalized as Role].includes(permission);
}

export function normalizeRole(role: string): Role {
  const normalized = role.toLowerCase();
  return (ROLES as string[]).includes(normalized) ? (normalized as Role) : "viewer";
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspace_id: string | null;
  hasPermission: (permission: Permission) => boolean;
}

export function toCurrentUser(
  row: { id: string; name: string; email: string; role: string; workspace_id: string | null },
): CurrentUser {
  const role = normalizeRole(row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    workspace_id: row.workspace_id,
    hasPermission: (permission) => hasPermission(role, permission),
  };
}

export type UserRow = ReturnType<typeof db> extends never ? never : {
  id: string;
  name: string;
  email: string;
  role: string;
  workspace_id: string | null;
};