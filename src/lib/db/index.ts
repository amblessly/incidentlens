/**
 * Database wrapper for IncidentLens.
 *
 * Two backends behind one async interface:
 * - SQLite (better-sqlite3): local development, tests and the demo.
 * - PostgreSQL (pg, via DATABASE_URL — e.g. Neon): Vercel / production.
 *
 * The SQLite schema below matches the shipped demo database exactly so the
 * same statements work on both backends.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { Pool, PoolClient, types as pgTypes } from "pg";

import { isDemoMode } from "@/lib/config";
import { seedIfEmpty } from "@/lib/db/seed";
import { PG_SCHEMA } from "@/lib/db/pg-schema";

const DB_PATH = process.env.INCIDENTLENS_DB_PATH ?? path.join(process.cwd(), "data", "incidentlens.db");
const DATABASE_URL = process.env.DATABASE_URL;
const isPg = Boolean(DATABASE_URL) && process.env.NEXT_PHASE !== "phase-production-build";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export type Row = Record<string, any>;

export interface Statement {
  get(...params: unknown[]): Promise<Row | undefined>;
  all(...params: unknown[]): Promise<Row[]>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface Database {
  readonly kind: "sqlite" | "postgres";
  /** Path (sqlite) or "PostgreSQL" label. */
  readonly name: string;
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T> | T): Promise<T>;
  pragma(source: string): Promise<unknown>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Schema (SQLite — matches the shipped demo database exactly)
// ---------------------------------------------------------------------------

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
  result TEXT,
  request_id TEXT,
  workspace_id TEXT,
  provider_connection_id TEXT
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  related_evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE (evidence_id, related_evidence_id, relationship)
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  rollback_result TEXT,
  approval_expires_at TEXT
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

export { SCHEMA };

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

class SqliteStatement implements Statement {
  constructor(
    private readonly owner: SqliteDatabase,
    private readonly sql: string,
  ) {}

  private async db(): Promise<BetterSqlite3.Database> {
    if (!this.owner.isSeeding()) await this.owner.ensureReady();
    return this.owner.raw;
  }

  async get(...params: unknown[]): Promise<Row | undefined> {
    const database = await this.db();
    return database.prepare(this.sql).get(...(params as never[])) as Row | undefined;
  }

  async all(...params: unknown[]): Promise<Row[]> {
    const database = await this.db();
    return database.prepare(this.sql).all(...(params as never[])) as Row[];
  }

  async run(...params: unknown[]): Promise<RunResult> {
    const database = await this.db();
    return database.prepare(this.sql).run(...(params as never[])) as unknown as RunResult;
  }
}

class SqliteDatabase implements Database {
  readonly kind = "sqlite" as const;
  private rawDb: BetterSqlite3.Database | null = null;
  private ready: Promise<void> | null = null;
  private seeding = false;

  get raw(): BetterSqlite3.Database {
    if (!this.rawDb) throw new Error("SQLite database not initialized yet.");
    return this.rawDb;
  }

  get name(): string {
    return this.rawDb?.name ?? DB_PATH;
  }

  isSeeding(): boolean {
    return this.seeding;
  }

  ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const database = new BetterSqlite3(DB_PATH);
        database.pragma("journal_mode = WAL");
        database.pragma("foreign_keys = ON");
        database.exec(SCHEMA);
        this.rawDb = database;
        if (isDemoMode()) {
          this.seeding = true;
          try {
            await seedIfEmpty(this);
          } finally {
            this.seeding = false;
          }
        }
      })();
    }
    return this.ready;
  }

  prepare(sql: string): Statement {
    return new SqliteStatement(this, sql);
  }

  async exec(sql: string): Promise<void> {
    await this.ensureReady();
    this.raw.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.seeding) await this.ensureReady();
    this.raw.exec("BEGIN");
    try {
      const result = await fn();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  async pragma(source: string): Promise<unknown> {
    await this.ensureReady();
    return this.raw.pragma(source);
  }

  async close(): Promise<void> {
    if (this.rawDb) {
      this.rawDb.close();
      this.rawDb = null;
    }
    this.ready = null;
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL backend
// ---------------------------------------------------------------------------

let pgPool: Pool | null = null;
const pgTx = new AsyncLocalStorage<PoolClient>();

// int8 (COUNT/SUM/MAX...) and numeric (AVG...) come back as strings in pg;
// parse them so the app sees numbers like it does with SQLite.
pgTypes.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pgTypes.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pgPool;
}

/** Translate SQLite-flavoured SQL to PostgreSQL. */
function toPgSql(sql: string): { sql: string; isInsert: boolean } {
  let s = sql.trim().replace(/;+\s*$/, "");

  // julianday(a) - julianday(b)  →  epoch-seconds difference / 86400 (days)
  s = s.replace(
    /julianday\(\s*([^)]+)\s*\)\s*-\s*julianday\(\s*([^)]+)\s*\)/g,
    "(EXTRACT(EPOCH FROM ($1::timestamptz - $2::timestamptz)) / 86400)",
  );

  const wasOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(s);
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");

  const isInsert = /^INSERT\s+INTO/i.test(s);
  if (wasOrIgnore) s += " ON CONFLICT DO NOTHING";
  if (isInsert && !/RETURNING/i.test(s)) s += " RETURNING id";

  // Named parameters (@name) → $1..$n (bound from a single object).
  // Positional parameters (?) → $1..$n.
  const hasNamed = /@[A-Za-z_][A-Za-z0-9_]*/.test(s);
  if (hasNamed) {
    let i = 0;
    s = s.replace(/@[A-Za-z_][A-Za-z0-9_]*/g, () => `$${++i}`);
  } else {
    let i = 0;
    s = s.replace(/\?/g, () => `$${++i}`);
  }

  return { sql: s, isInsert };
}

function bindValues(sql: string, params: unknown[]): unknown[] {
  if (params.length === 0) return params;
  if (
    params.length === 1 &&
    typeof params[0] === "object" &&
    params[0] !== null &&
    !Array.isArray(params[0])
  ) {
    const names = [...sql.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
    if (names.length > 0) {
      const obj = params[0] as Record<string, unknown>;
      return names.map((name) => obj[name] ?? null);
    }
    // Object binding with no named placeholders (e.g. an empty filter object).
    return [];
  }
  return params;
}

class PgStatement implements Statement {
  private readonly translated: { sql: string; isInsert: boolean };

  constructor(private readonly sql: string) {
    this.translated = toPgSql(sql);
  }

  private async query(params: unknown[]) {
    if (!pgSeeding) await pgEnsureReady();
    const values = bindValues(this.sql, params);
    const client = pgTx.getStore();
    const executor = client ?? getPool();
    return executor.query(this.translated.sql, values);
  }

  async get(...params: unknown[]): Promise<Row | undefined> {
    const result = await this.query(params);
    return result.rows[0] as Row | undefined;
  }

  async all(...params: unknown[]): Promise<Row[]> {
    const result = await this.query(params);
    return result.rows as Row[];
  }

  async run(...params: unknown[]): Promise<RunResult> {
    const result = await this.query(params);
    const lastInsertRowid = this.translated.isInsert
      ? Number((result.rows?.[0] as Row | undefined)?.id ?? 0)
      : 0;
    return { changes: result.rowCount ?? 0, lastInsertRowid };
  }
}

class PgDatabase implements Database {
  readonly kind = "postgres" as const;
  readonly name = "PostgreSQL (DATABASE_URL)";

  prepare(sql: string): Statement {
    return new PgStatement(sql);
  }

  async exec(sql: string): Promise<void> {
    await pgEnsureReady();
    const client = pgTx.getStore();
    const executor = client ?? getPool();
    await executor.query(sql);
  }

  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await pgTx.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async pragma(): Promise<unknown> {
    return undefined;
  }

  async close(): Promise<void> {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
  }
}

let pgReady: Promise<void> | null = null;
let pgSeeding = false;

async function pgEnsureReady(): Promise<void> {
  if (!pgReady) {
    pgReady = (async () => {
      await getPool().query(PG_SCHEMA);
      if (isDemoMode()) {
        const result = await getPool().query("SELECT COUNT(*) AS n FROM incidents");
        const n = Number(result.rows[0]?.n ?? 0);
        if (n === 0) {
          pgSeeding = true;
          try {
            await seedIfEmpty(pgDb());
          } finally {
            pgSeeding = false;
          }
        }
      }
    })();
  }
  return pgReady;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let dbInstance: Database | null = null;

export function db(): Database {
  if (!dbInstance) {
    dbInstance = isPg ? new PgDatabase() : new SqliteDatabase();
  }
  return dbInstance;
}

function pgDb(): Database {
  if (!dbInstance || dbInstance.kind !== "postgres") {
    dbInstance = new PgDatabase();
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
  pgReady = null;
}

export function resetDb(): void {
  if (dbInstance && dbInstance.kind === "sqlite") {
    const sqlite = dbInstance as SqliteDatabase;
    sqlite.close().catch(() => undefined);
    dbInstance = null;
  }
  pgReady = null;
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${DB_PATH}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
