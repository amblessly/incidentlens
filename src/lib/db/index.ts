import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { seedIfEmpty } from "@/lib/db/seed";

const DB_PATH =
  process.env.INCIDENTLENS_DB_PATH ??
  path.join(process.cwd(), "data", "incidentlens.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  team TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  author TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success'
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  assigned_to TEXT,
  deployment_id TEXT,
  repository TEXT,
  alert_payload TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor TEXT,
  created_at TEXT NOT NULL,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  observation TEXT NOT NULL,
  relevance TEXT NOT NULL,
  confidence REAL NOT NULL,
  timestamp TEXT NOT NULL,
  data TEXT
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  supporting_evidence TEXT NOT NULL,
  contradicting_evidence TEXT,
  missing_evidence TEXT,
  next_step TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  agent TEXT NOT NULL,
  provider TEXT,
  prompt_version TEXT,
  initiated_by TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  result TEXT
);

CREATE TABLE IF NOT EXISTS investigation_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES investigation_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT,
  source TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, step_id)
);

CREATE TABLE IF NOT EXISTS remediation_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  rejection_reason TEXT,
  hash TEXT,
  executed_at TEXT,
  executed_by TEXT,
  execution_result TEXT,
  rollback_result TEXT
);

CREATE TABLE IF NOT EXISTS remediation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  description TEXT NOT NULL,
  expected_impact TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  rollback_strategy TEXT NOT NULL,
  affected_resources TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_refs TEXT NOT NULL,
  approval_required INTEGER NOT NULL DEFAULT 1,
  blast_radius TEXT,
  prerequisites TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON hypotheses(incident_id);
CREATE INDEX IF NOT EXISTS idx_runs_incident ON investigation_runs(incident_id);
CREATE INDEX IF NOT EXISTS idx_steps_run ON investigation_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_plans_incident ON remediation_plans(incident_id);
CREATE INDEX IF NOT EXISTS idx_actions_plan ON remediation_actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service);
`;

type GlobalWithDb = typeof globalThis & {
  __incidentlensDb?: Database;
};

/** Adds columns introduced after the original schema was released. */
function migrate(db: Database): void {
  const columns = (table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  const add = (table: string, column: string, definition: string): void => {
    if (!columns(table).includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  add("incident_events", "run_id", "INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL");
  add("hypotheses", "contradicting_evidence", "TEXT");
  add("hypotheses", "missing_evidence", "TEXT");
  add("hypotheses", "next_step", "TEXT");
  add("investigation_runs", "provider", "TEXT");
  add("investigation_runs", "prompt_version", "TEXT");
  add("investigation_runs", "initiated_by", "TEXT");
  add("investigation_runs", "error", "TEXT");
  add("investigation_steps", "phase", "TEXT");
  add("investigation_steps", "source", "TEXT");
  add("remediation_plans", "hash", "TEXT");
  add("remediation_plans", "executed_at", "TEXT");
  add("remediation_plans", "executed_by", "TEXT");
  add("remediation_plans", "execution_result", "TEXT");
  add("remediation_plans", "rollback_result", "TEXT");
  add("remediation_actions", "blast_radius", "TEXT");
  add("remediation_actions", "prerequisites", "TEXT");

  // Runs after the column migrations above so existing databases can
  // gain the index once `run_id` exists.
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_run ON incident_events(run_id)");
}

function getDb(): Database {
  const g = globalThis as GlobalWithDb;
  if (g.__incidentlensDb) return g.__incidentlensDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new BetterSqlite3(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);

  seedIfEmpty(db);

  g.__incidentlensDb = db;
  return db;
}

export function db(): Database {
  return getDb();
}

export function closeDb(): void {
  const g = globalThis as GlobalWithDb;
  if (g.__incidentlensDb) {
    g.__incidentlensDb.close();
    g.__incidentlensDb = undefined;
  }
}

export type Database = BetterSqlite3.Database;



