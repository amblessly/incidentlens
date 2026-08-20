/**
 * Ensure the deterministic demo API key exists (for databases that were
 * already seeded before the key was added to seedIfEmpty).
 * Run with: npx tsx scripts/ensure-demo-key.ts
 * Set DATABASE_URL to target Neon; without it, targets the local SQLite DB.
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const localEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.DATABASE_URL = process.env.DATABASE_URL ?? localEnv.DATABASE_URL;
process.env.INCIDENTLENS_MODE = process.env.INCIDENTLENS_MODE ?? localEnv.INCIDENTLENS_MODE ?? "demo";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? localEnv.SESSION_SECRET;

async function main() {
  const { db } = await import("@/lib/db");
  const { DEMO_API_KEY_SECRET, DEMO_API_KEY_ID } = await import("@/lib/db/seed");
  const database = db();

  const workspace = (await database.prepare("SELECT * FROM workspaces LIMIT 1").get()) as
    | { id: string }
    | undefined;
  if (!workspace) {
    console.error("No workspace found. Run the migration + seed first.");
    process.exit(1);
  }

  await database
    .prepare(
      "INSERT INTO api_keys (id, workspace_id, name, key_hash, key_prefix, created_at, revoked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL) ON CONFLICT (id) DO NOTHING",
    )
    .run(DEMO_API_KEY_ID, workspace.id, "Demo ingestion key", "", "", new Date().toISOString());

  const existing = (await database
    .prepare("SELECT key_hash, key_prefix FROM api_keys WHERE id = ?")
    .get(DEMO_API_KEY_ID)) as { key_hash: string; key_prefix: string } | undefined;

  const { createHash } = await import("node:crypto");
  const expectedHash = createHash("sha256").update(DEMO_API_KEY_SECRET).digest("hex");
  if (!existing || existing.key_hash !== expectedHash) {
    await database
      .prepare("UPDATE api_keys SET key_hash = ?, key_prefix = ? WHERE id = ?")
      .run(expectedHash, DEMO_API_KEY_SECRET.slice(0, 8), DEMO_API_KEY_ID);
  }

  console.log(`✓ Demo API key ready: ${DEMO_API_KEY_ID} -> ${DEMO_API_KEY_SECRET.slice(0, 8)}...`);
  await database.close();
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});