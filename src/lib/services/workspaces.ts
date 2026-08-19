import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { nowIso } from "@/lib/format";

/**
 * Workspace / environment / provider-connection model.
 *
 * Workspace → Environments → Provider connections → Incidents.
 * Provider connections are workspace-scoped; credentials themselves always
 * live in the server environment (never in the database or browser).
 */

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface EnvironmentRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  created_at: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ProviderConnectionRow {
  id: string;
  workspace_id: string;
  environment_id: string | null;
  provider_type: string;
  name: string;
  status: ConnectionStatus;
  last_tested_at: string | null;
  last_error: string | null;
  config: string | null;
  created_at: string;
}

export function createWorkspace(name: string): WorkspaceRow {
  const id = `ws_${randomUUID().slice(0, 12)}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace"}-${id.slice(3, 7)}`;
  db()
    .prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(id, name, slug, nowIso());
  return db().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow;
}

export function createEnvironment(
  workspaceId: string,
  name: string,
  kind = "production",
): EnvironmentRow {
  const id = `env_${randomUUID().slice(0, 12)}`;
  db()
    .prepare(
      "INSERT INTO environments (id, workspace_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, workspaceId, name, kind, nowIso());
  return db().prepare("SELECT * FROM environments WHERE id = ?").get(id) as EnvironmentRow;
}

export function createProviderConnection(
  workspaceId: string,
  opts: {
    environmentId?: string | null;
    providerType: string;
    name?: string;
  },
): ProviderConnectionRow {
  const id = `conn_${randomUUID().slice(0, 12)}`;
  db()
    .prepare(
      `INSERT INTO provider_connections (id, workspace_id, environment_id, provider_type, name, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'disconnected', ?)`,
    )
    .run(
      id,
      workspaceId,
      opts.environmentId ?? null,
      opts.providerType,
      opts.name ?? `${opts.providerType} connection`,
      nowIso(),
    );
  return db().prepare("SELECT * FROM provider_connections WHERE id = ?").get(id) as ProviderConnectionRow;
}

export function listWorkspaces(): WorkspaceRow[] {
  return db().prepare("SELECT * FROM workspaces ORDER BY created_at ASC").all() as WorkspaceRow[];
}

export function listEnvironments(workspaceId: string): EnvironmentRow[] {
  return db()
    .prepare("SELECT * FROM environments WHERE workspace_id = ? ORDER BY created_at ASC")
    .all(workspaceId) as EnvironmentRow[];
}

export function listConnections(workspaceId: string): ProviderConnectionRow[] {
  return db()
    .prepare("SELECT * FROM provider_connections WHERE workspace_id = ? ORDER BY created_at ASC")
    .all(workspaceId) as ProviderConnectionRow[];
}

export function getConnection(id: string): ProviderConnectionRow | null {
  return (
    (db().prepare("SELECT * FROM provider_connections WHERE id = ?").get(id) as
      | ProviderConnectionRow
      | undefined) ?? null
  );
}

export function updateConnectionStatus(
  id: string,
  status: ConnectionStatus,
  opts: { error?: string | null; testedAt?: string } = {},
): void {
  db()
    .prepare(
      "UPDATE provider_connections SET status = ?, last_error = ?, last_tested_at = ? WHERE id = ?",
    )
    .run(status, opts.error ?? null, opts.testedAt ?? nowIso(), id);
}

export function deleteConnection(id: string): boolean {
  const result = db().prepare("DELETE FROM provider_connections WHERE id = ?").run(id);
  return result.changes > 0;
}

/** The first workspace (setup flow), or null when none exist. */
export function defaultWorkspace(): WorkspaceRow | null {
  return listWorkspaces()[0] ?? null;
}