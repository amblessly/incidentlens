/**
 * PostgreSQL migration — drops any previous IncidentLens tables in the Neon
 * database and recreates the canonical schema (src/lib/db/pg-schema.ts).
 *
 * Run with: npx tsx scripts/migrate-pg.ts
 *
 * The canonical schema is the single source of truth; this script must
 * always stay in sync with what the app applies at runtime.
 */

import fs from "node:fs";
import path from "node:path";

import { Pool } from "pg";

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
const DATABASE_URL = process.env.DATABASE_URL ?? localEnv.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (set it in .env.local or the environment).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TABLES = [
  "audit_events",
  "executions",
  "approvals",
  "remediation_actions",
  "remediation_plans",
  "deployments",
  "hypotheses",
  "hypothesis_evidence",
  "evidence_relationships",
  "evidence",
  "investigation_steps",
  "incident_events",
  "investigation_runs",
  "incidents",
  "api_keys",
  "provider_connections",
  "environments",
  "services",
  "users",
  "workspaces",
  "plan_actions",
];

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Connecting to Neon PostgreSQL...");

    console.log("\nDropping previous IncidentLens tables...");
    for (const table of TABLES) {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    console.log("Applying canonical schema (src/lib/db/pg-schema.ts)...");
    const { PG_SCHEMA } = await import("../src/lib/db/pg-schema");
    await client.query(PG_SCHEMA);

    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`\n✓ Migration complete! ${rows.length} tables:`);
    for (const r of rows as Array<{ table_name: string }>) {
      console.log(`  - ${r.table_name}`);
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();