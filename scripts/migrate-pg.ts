/**
 * PostgreSQL migration — creates all IncidentLens tables in the Neon database.
 * Run with: npx tsx scripts/migrate-pg.ts
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MIGRATION_SQL = `
-- =============================================================================
-- IncidentLens PostgreSQL schema
-- =============================================================================

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Environments
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'production',
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  last_used_at TEXT,
  revoked_at TEXT,
  expires_at TEXT
);

-- Provider Connections
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
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'SEV-3',
  status TEXT NOT NULL DEFAULT 'open',
  description TEXT NOT NULL,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
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

-- Incident Events (timeline)
CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Investigation Runs
CREATE TABLE IF NOT EXISTS investigation_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  agent TEXT NOT NULL DEFAULT 'incidentlens',
  provider TEXT,
  prompt_version TEXT,
  initiated_by TEXT,
  started_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  finished_at TEXT,
  error TEXT,
  result TEXT,
  request_id TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL
);

-- Investigation Steps
CREATE TABLE IF NOT EXISTS investigation_steps (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES investigation_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT,
  source TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Evidence
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  source_type TEXT,
  title TEXT NOT NULL DEFAULT '',
  observation TEXT NOT NULL,
  relevance TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL,
  service TEXT,
  environment TEXT,
  data TEXT
);

-- Evidence Relationships
CREATE TABLE IF NOT EXISTS evidence_relationships (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL,
  evidence_from INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  evidence_to INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Hypotheses
CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES investigation_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  severity TEXT,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Hypothesis Evidence Links
CREATE TABLE IF NOT EXISTS hypothesis_evidence (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'supporting'
);

-- Deployments
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  author TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success'
);

-- Remediation Plans
CREATE TABLE IF NOT EXISTS remediation_plans (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  hypothesis_id INTEGER REFERENCES hypotheses(id) ON DELETE SET NULL,
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  proposed_by TEXT,
  proposed_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  approved_at TEXT,
  executed_at TEXT,
  result TEXT,
  actions TEXT NOT NULL DEFAULT '[]'
);

-- Plan Actions
CREATE TABLE IF NOT EXISTS plan_actions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

-- Approvals
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

-- Executions
CREATE TABLE IF NOT EXISTS executions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  approval_id INTEGER REFERENCES approvals(id) ON DELETE SET NULL,
  executed_by TEXT,
  started_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  plan_hash_snapshot TEXT NOT NULL
);

-- Audit Events
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
  created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- =============================================================================
-- Indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_runs_incident ON investigation_runs(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_steps_run ON investigation_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_run ON evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_relationships_incident ON evidence_relationships(incident_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON hypotheses(incident_id);
CREATE INDEX IF NOT EXISTS idx_hypothesis_evidence_hypothesis ON hypothesis_evidence(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_incident ON remediation_plans(incident_id);
CREATE INDEX IF NOT EXISTS idx_plan_actions_plan ON plan_actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_plan ON executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_incident ON audit_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Connecting to Neon PostgreSQL...");
    console.log(`Database URL: ${DATABASE_URL!.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`);
    
    console.log("\nRunning migration...");
    await client.query(MIGRATION_SQL);
    
    // Verify tables
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n✓ Migration complete! ${rows.length} tables created:`);
    rows.forEach((r: any) => console.log(`  - ${r.table_name}`));
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
