import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

/**
 * Test isolation.
 *
 * IMPORTANT: these assignments MUST run before any module importing
 * "@/lib/db" is loaded — the DB path is captured at module load time.
 * Static imports are hoisted above this code, so "@/lib/db" is only ever
 * imported lazily below.
 *
 * - INCIDENTLENS_MODE=demo so the DemoProvider is used (deterministic,
 *   no network).
 * - A fresh temp SQLite database per test run, isolated from any real
 *   development data.
 */
process.env.INCIDENTLENS_MODE = "demo";
const DB_DIR = mkdtempSync(join(tmpdir(), "incidentlens-test-"));
process.env.INCIDENTLENS_DB_PATH = join(DB_DIR, "test.db");

afterAll(async () => {
  const { closeDb } = await import("@/lib/db");
  await closeDb();
  try {
    rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});