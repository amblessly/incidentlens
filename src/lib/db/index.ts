/**
 * Database wrapper for IncidentLens.
 *
 * SQLite (better-sqlite3) is used for local development and the demo.
 * PostgreSQL (via DATABASE_URL) is used for Vercel / production.
 */

import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { isDemoMode } from "@/lib/config";
import { seedIfEmpty } from "@/lib/db/seed";

const DB_PATH = process.env.INCIDENTLENS_DB_PATH ?? path.join(process.cwd(), "data", "incidentlens.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  password_hash TEXT,
  workspace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'production',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_tested_at TEXT,
  last_error TEXT,
  config TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  expires_at TEXT
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
  is_demo INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  environment TEXT,
  idempotency_key TEXT UNIQUE,
  request_id TEXT,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investigation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  agent TEXT NOT NULL DEFAULT 'incidentlens',
  provider TEXT,
  prompt_version TEXT,
  initiated_by TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  result TEXT,
  request_id TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL
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
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER,
  source TEXT NOT NULL,
  source_type TEXT,
  title TEXT NOT NULL,
  observation TEXT NOT NULL,
  relevance TEXT NOT NULL,
  confidence REAL NOT NULL,
  timestamp TEXT NOT NULL,
  service TEXT,
  environment TEXT,
  data TEXT
);
CREATE TABLE IF NOT EXISTS evidence_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER,
  evidence_from INTEGER NOT NULL,
  evidence_to INTEGER NOT NULL,
  relationship TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  explanation TEXT,
  confidence REAL NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  supporting_evidence TEXT NOT NULL,
  contradicting_evidence TEXT,
  missing_evidence TEXT,
  next_step TEXT,
  severity TEXT,
  rationale TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hypothesis_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'supporting'
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
CREATE TABLE IF NOT EXISTS remediation_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  hypothesis_id INTEGER,
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  proposed_by TEXT,
  proposed_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  rejection_reason TEXT,
  hash TEXT,
  executed_at TEXT,
  executed_by TEXT,
  execution_result TEXT,
  rollback_result TEXT,
  approval_expires_at TEXT,
  result TEXT,
  actions TEXT
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
CREATE TABLE IF NOT EXISTS plan_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'medium',
  blast_radius TEXT,
  rollback_strategy TEXT,
  resources TEXT,
  approval_required INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  approver_id TEXT NOT NULL,
  approver_name TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  action_id INTEGER,
  actor TEXT NOT NULL,
  actor_id TEXT,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  result TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT,
  user_id TEXT,
  user_name TEXT,
  workspace_id TEXT,
  incident_id TEXT,
  investigation_run_id INTEGER,
  execution_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_runs_incident ON investigation_runs(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_steps_run ON investigation_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_relationships_incident ON evidence_relationships(incident_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON hypotheses(incident_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_incident ON remediation_plans(incident_id);
CREATE INDEX IF NOT EXISTS idx_plan_actions_plan ON plan_actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_plan ON executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_incident ON audit_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
`;

function getDb(): BetterSqlite3.Database {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const database = new BetterSqlite3(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

let dbInstance: BetterSqlite3.Database | null = null;

export function db(): BetterSqlite3.Database {
  if (!dbInstance) {
    dbInstance = getDb();
    dbInstance.exec(SCHEMA);
    if (isDemoMode()) {
      seedIfEmpty(dbInstance);
    }
  }
  return dbInstance;
}

export type Database = BetterSqlite3.Database;

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export { SCHEMA };

export function resetDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  const dir = path.dirname(DB_PATH);
  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH, { force: true });
  }
  // Remove WAL and SHM files too
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${DB_PATH}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
    }
  }
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}