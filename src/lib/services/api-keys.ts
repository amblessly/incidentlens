import { createHash, randomBytes, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { nowIso } from "@/lib/format";

/**
 * API keys for external incident ingestion (POST /api/incidents).
 *
 * Security:
 * - only the SHA-256 hash of the key is stored (never the raw key)
 * - the raw key is returned exactly once at creation time
 * - keys can be revoked (soft delete) and rotated
 */

export interface ApiKeyRow {
  id: string;
  workspace_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface CreatedApiKey {
  row: ApiKeyRow;
  /** The raw key — shown exactly once. */
  secret: string;
}

export function createApiKey(
  workspaceId: string,
  name: string,
  opts: { expiresAt?: string | null } = {},
): CreatedApiKey {
  const id = `key_${randomUUID().slice(0, 12)}`;
  const prefix = `il_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const key = `${prefix}_${secret}`;

  db()
    .prepare(
      `INSERT INTO api_keys (id, workspace_id, name, key_hash, key_prefix, created_at, revoked_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(id, workspaceId, name, hashApiKey(key), prefix, nowIso(), opts.expiresAt ?? null);

  return {
    row: db().prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as ApiKeyRow,
    secret: key,
  };
}

/** True when the key is valid: exists, not revoked, not expired, hash matches. */
export function verifyApiKey(key: string): ApiKeyRow | null {
  const hash = hashApiKey(key);
  const row = db()
    .prepare("SELECT * FROM api_keys WHERE key_hash = ?")
    .get(hash) as ApiKeyRow | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && Date.now() > new Date(row.expires_at).getTime()) return null;
  db().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return db().prepare("SELECT * FROM api_keys WHERE id = ?").get(row.id) as ApiKeyRow;
}

export function revokeApiKey(id: string): void {
  db().prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?").run(nowIso(), id);
}

/** Revoke the old key and issue a new one. */
export function rotateApiKey(id: string): CreatedApiKey | null {
  const row = db().prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as ApiKeyRow | undefined;
  if (!row) return null;
  revokeApiKey(id);
  return createApiKey(row.workspace_id, `${row.name} (rotated)`);
}

export function listApiKeys(workspaceId: string): ApiKeyRow[] {
  return db()
    .prepare("SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId) as ApiKeyRow[];
}