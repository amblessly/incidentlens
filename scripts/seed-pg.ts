/**
 * Seed demo data into Neon PostgreSQL using the app's own seedIfEmpty.
 * Run with: npx tsx scripts/seed-pg.ts
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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (set it in .env.local or the environment).");
  process.exit(1);
}

async function seed() {
  const { db } = await import("@/lib/db");
  const { seedIfEmpty } = await import("@/lib/db/seed");

  console.log("Seeding demo data into Neon PostgreSQL via app seedIfEmpty...\n");
  await seedIfEmpty(db());

  const counts = await db()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM workspaces) AS workspaces,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM incidents) AS incidents,
        (SELECT COUNT(*) FROM investigation_runs) AS runs,
        (SELECT COUNT(*) FROM evidence) AS evidence,
        (SELECT COUNT(*) FROM hypotheses) AS hypotheses,
        (SELECT COUNT(*) FROM remediation_plans) AS plans,
        (SELECT COUNT(*) FROM remediation_actions) AS actions,
        (SELECT COUNT(*) FROM deployments) AS deployments`,
    )
    .get();
  console.log("=== Summary ===");
  for (const [key, value] of Object.entries(counts ?? {})) {
    console.log(`  ${key}: ${String(value)}`);
  }
  console.log("\n✓ Demo data seeded successfully!");
  await db().close();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});