/**
 * Canonical IncidentLens schema in PostgreSQL dialect.
 *
 * Mirrors the SQLite schema exactly (src/lib/db/index.ts SCHEMA) so every
 * statement the application issues works on both backends. Identity columns
 * are INTEGER so ids are returned as numbers (matching SQLite).
 */

export const PG_SCHEMA = `
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
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  password_hash TEXT,
  workspace_id TEXT,
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
CREATE TABLE IF NOT EXISTS investigation_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  agent TEXT NOT NULL,
  provider TEXT,
  prompt_version TEXT,
  initiated_by TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  result TEXT,
  request_id TEXT,
  workspace_id TEXT,
  provider_connection_id TEXT
);
CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor TEXT,
  created_at TEXT NOT NULL,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS investigation_steps (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL,
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
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  related_evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE (evidence_id, related_evidence_id, relationship)
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL,
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
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  rollback_result TEXT,
  approval_expires_at TEXT
);
CREATE TABLE IF NOT EXISTS remediation_actions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  action_id INTEGER REFERENCES remediation_actions(id) ON DELETE SET NULL,
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
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  team TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_runs_incident ON investigation_runs(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_steps_run ON investigation_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON hypotheses(incident_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_incident ON remediation_plans(incident_id);
CREATE INDEX IF NOT EXISTS idx_executions_plan ON executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_incident ON audit_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
`;
