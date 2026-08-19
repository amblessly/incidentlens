/**
 * Seed demo data into Neon PostgreSQL.
 * Run with: npx tsx scripts/seed-pg.ts
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

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log("Seeding demo data into Neon PostgreSQL...\n");

    // 1. Workspace
    await client.query(`
      INSERT INTO workspaces (id, name, slug, created_at)
      VALUES ('ws_hackathon', 'Acme Inc (Hackathon)', 'acme-hackathon', $1)
      ON CONFLICT (id) DO NOTHING
    `, [new Date().toISOString()]);
    console.log("  ✓ Workspace: Acme Inc (Hackathon)");

    // 2. Environment
    await client.query(`
      INSERT INTO environments (id, workspace_id, name, kind, created_at)
      VALUES ('env_prod', 'ws_hackathon', 'production', 'production', $1)
      ON CONFLICT (id) DO NOTHING
    `, [new Date().toISOString()]);
    console.log("  ✓ Environment: production");

    // 3. User
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, workspace_id, created_at)
      VALUES ('u_hackathon', 'Demo Engineer', 'demo@incidentlens.dev', 'demo-hash', 'admin', 'ws_hackathon', $1)
      ON CONFLICT (id) DO NOTHING
    `, [new Date().toISOString()]);
    console.log("  ✓ User: Demo Engineer");

    // 4. Provider connection
    await client.query(`
      INSERT INTO provider_connections (id, workspace_id, environment_id, provider_type, name, status, created_at)
      VALUES ('conn_clanker', 'ws_hackathon', 'env_prod', 'clanker', 'Clanker Cloud MCP', 'connected', $1)
      ON CONFLICT (id) DO NOTHING
    `, [new Date().toISOString()]);
    console.log("  ✓ Provider: Clanker Cloud MCP");

    // 5. Deployments
    const deployments = [
      ["DEP-9081", "api-production", "v3.4.1", "9f2c41a", "Jordan Reyes", minutesAgo(10), "success"],
      ["DEP-9079", "api-production", "v3.4.0", "a11b22c", "Maya Patel", minutesAgo(180), "success"],
      ["DEP-9075", "auth-service", "v2.9.0", "71fae12", "Maya Patel", minutesAgo(360), "success"],
      ["DEP-9070", "cdn-edge", "edge-44", "b6d01ef", "Jordan Reyes", minutesAgo(600), "success"],
      ["DEP-9068", "web-frontend", "v5.1.0", "8aa22d1", "Ava Chen", minutesAgo(900), "success"],
    ];
    for (const d of deployments) {
      await client.query(`
        INSERT INTO deployments (id, service, version, commit_sha, author, deployed_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `, d);
    }
    console.log(`  ✓ Deployments: ${deployments.length} records`);

    // 6. Incident
    const incidentId = "INC-PG-001";
    await client.query(`
      INSERT INTO incidents (id, title, service, severity, status, description, started_at, created_at, source, workspace_id, environment_id, environment)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING
    `, [
      incidentId,
      "Production API — 5xx spike",
      "api-production",
      "SEV-1",
      "open",
      "Production API error rate spiked from 0.2% to 18% starting ~10 minutes ago. Customers experiencing 5xx responses. On-call paged.",
      minutesAgo(12),
      new Date().toISOString(),
      "manual",
      "ws_hackathon",
      "env_prod",
      "production",
    ]);
    console.log(`  ✓ Incident: ${incidentId}`);

    // 7. Incident event
    await client.query(`
      INSERT INTO incident_events (incident_id, type, title, description, actor, created_at)
      VALUES ($1, 'incident_created', 'Incident created', 'Production API 5xx spike detected', 'System', $2)
    `, [incidentId, minutesAgo(12)]);
    console.log("  ✓ Incident event created");

    // 8. Investigation run
    const runResult = await client.query(`
      INSERT INTO investigation_runs (incident_id, status, agent, provider, initiated_by, started_at, finished_at, workspace_id)
      VALUES ($1, 'completed', 'incidentlens', 'clanker-mcp', 'Demo Engineer', $2, $3, 'ws_hackathon')
      RETURNING id
    `, [incidentId, minutesAgo(11), minutesAgo(10)]);
    const runId = runResult.rows[0].id;
    console.log(`  ✓ Investigation run: #${runId}`);

    // 9. Investigation steps
    const steps = [
      ["collecting-evidence", "Collecting evidence", "Gathering infrastructure context from Clanker Cloud MCP", "done"],
      ["checking-changes", "Checking recent changes", "Inspecting deployments and configuration changes", "done"],
      ["correlating-evidence", "Correlating evidence", "Building evidence graph and relationships", "done"],
      ["evaluating-hypotheses", "Evaluating hypotheses", "Scoring root cause hypotheses against evidence", "done"],
      ["preparing-remediation", "Preparing remediation", "Drafting human-approved remediation plan", "done"],
    ];
    for (const [phase, label, detail, status] of steps) {
      await client.query(`
        INSERT INTO investigation_steps (run_id, step_id, label, detail, status, phase, source, completed_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'agent', $7, $8)
      `, [runId, phase, label, detail, status, phase, minutesAgo(10), minutesAgo(10)]);
    }
    console.log(`  ✓ Investigation steps: ${steps.length}`);

    // 10. Evidence
    const evidenceData = [
      { source: "Service registry (clanker-mcp)", sourceType: "infrastructure", title: "Service registered", observation: "api-production is present in the environment as a service.", relevance: "primary", confidence: 1.0, service: "api-production" },
      { source: "Service health (clanker-mcp)", sourceType: "service-health", title: "Health critical", observation: "api-production health is reported CRITICAL — 5xx error rate at 18%, response times elevated.", relevance: "primary", confidence: 0.95, service: "api-production" },
      { source: "Deployment history (clanker-mcp)", sourceType: "deployments", title: "Recent deployment", observation: "DEP-9081: api-production v3.4.1 deployed by Jordan Reyes, 10 minutes before incident onset. Introduced new order aggregation queries with multi-table JOINs.", relevance: "primary", confidence: 0.9, service: "api-production" },
      { source: "Application logs (clanker-mcp)", sourceType: "logs", title: "Connection pool exhaustion", observation: "Error logs show 'connection pool exhausted (98/100 active)' starting 9 minutes ago. Multiple request timeouts on database queries.", relevance: "primary", confidence: 0.92, service: "api-production" },
      { source: "Application logs (clanker-mcp)", sourceType: "logs", title: "Slow query detected", observation: "Slow query detected: SELECT * FROM orders JOIN order_items WHERE status = 'pending' (2400ms). Unbounded result set from new JOIN queries.", relevance: "supporting", confidence: 0.88, service: "primary-db" },
      { source: "Metrics (clanker-mcp)", sourceType: "metrics", title: "Error rate spike", observation: "Error rate spiked from 0.2% to 18.2% — 847 errors in last 5 minutes (threshold: 1%).", relevance: "primary", confidence: 0.95, service: "api-production" },
      { source: "Metrics (clanker-mcp)", sourceType: "metrics", title: "Latency elevated", observation: "p95 latency elevated from 180ms to 4200ms (threshold: 500ms). Timeout count at 847.", relevance: "supporting", confidence: 0.9, service: "api-production" },
      { source: "Database state (clanker-mcp)", sourceType: "database", title: "Connection pool critical", observation: "primary-db connection pool at 98/100 active connections. 23 queries queued. Work_mem exceeded 256MB on complex JOIN queries.", relevance: "primary", confidence: 0.95, service: "primary-db" },
      { source: "Database state (clanker-mcp)", sourceType: "database", title: "Replication lag", observation: "Replication lag at 4800ms (threshold: 200ms). Standby falling behind due to load.", relevance: "supporting", confidence: 0.85, service: "primary-db" },
      { source: "Recent changes (clanker-mcp)", sourceType: "changes", title: "Deployment with new queries", observation: "DEP-9081: api-production v3.4.1 deployed — introduces new order aggregation queries with multi-table JOINs that scan unbounded result sets.", relevance: "primary", confidence: 0.92, service: "api-production" },
      { source: "Recent changes (clanker-mcp)", sourceType: "changes", title: "No config changes", observation: "No database configuration changes in the last 24 hours. Connection pool size unchanged at max_connections=100.", relevance: "supporting", confidence: 0.8, service: "primary-db" },
      { source: "Service health (clanker-mcp)", sourceType: "service-health", title: "Cache degraded", observation: "cache-layer health is WARNING — cache hit rate dropped to 61% due to upstream database pressure.", relevance: "supporting", confidence: 0.75, service: "cache-layer" },
    ];

    const evidenceIds: number[] = [];
    for (const e of evidenceData) {
      const result = await client.query(`
        INSERT INTO evidence (incident_id, run_id, source, source_type, title, observation, relevance, confidence, timestamp, service, environment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'production')
        RETURNING id
      `, [incidentId, runId, e.source, e.sourceType, e.title, e.observation, e.relevance, e.confidence, minutesAgo(11), e.service]);
      evidenceIds.push(result.rows[0].id);
    }
    console.log(`  ✓ Evidence: ${evidenceData.length} items`);

    // 11. Evidence relationships
    const relationships = [
      { from: evidenceIds[2], to: evidenceIds[7], relationship: "causes", reason: "Deployment DEP-9081 introduced new DB queries that led to connection pool exhaustion" },
      { from: evidenceIds[7], to: evidenceIds[5], relationship: "causes", reason: "Connection pool exhaustion causes request timeouts, which manifests as 5xx errors" },
      { from: evidenceIds[3], to: evidenceIds[7], relationship: "confirms", reason: "Application logs confirm connection pool exhaustion at 98/100 active" },
      { from: evidenceIds[8], to: evidenceIds[7], relationship: "amplifies", reason: "Replication lag increases pressure on primary, contributing to pool exhaustion" },
      { from: evidenceIds[4], to: evidenceIds[2], relationship: "confirms", reason: "Slow JOIN queries introduced by deployment match the observed performance degradation" },
      { from: evidenceIds[11], to: evidenceIds[7], relationship: "reflects", reason: "Cache degradation is a secondary effect of DB pressure" },
    ];
    for (const r of relationships) {
      await client.query(`
        INSERT INTO evidence_relationships (incident_id, run_id, evidence_from, evidence_to, relationship, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [incidentId, runId, r.from, r.to, r.relationship, r.reason]);
    }
    console.log(`  ✓ Relationships: ${relationships.length}`);

    // 12. Hypothesis
    const hypResult = await client.query(`
      INSERT INTO hypotheses (incident_id, run_id, title, explanation, confidence, severity, rationale)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      incidentId,
      runId,
      "Recent deployment introduced unbounded DB queries causing connection pool exhaustion",
      "Deployment DEP-9081 (api-production v3.4.1) introduced new order aggregation queries with multi-table JOINs. These queries scan unbounded result sets, consuming excessive database connections and memory. The connection pool reached 98/100 capacity, causing request timeouts and 5xx errors for all API consumers.",
      0.92,
      "SEV-1",
      "Supporting evidence: deployment timestamp correlates with error onset, logs confirm pool exhaustion, slow queries match the new JOIN patterns, and no other infrastructure changes occurred in the same window.",
    ]);
    const hypId = hypResult.rows[0].id;

    // 13. Hypothesis evidence links
    for (const evId of [evidenceIds[2], evidenceIds[3], evidenceIds[4], evidenceIds[5], evidenceIds[7], evidenceIds[9]]) {
      await client.query(`
        INSERT INTO hypothesis_evidence (hypothesis_id, evidence_id, role)
        VALUES ($1, $2, 'supporting')
      `, [hypId, evId]);
    }
    for (const evId of [evidenceIds[10], evidenceIds[11]]) {
      await client.query(`
        INSERT INTO hypothesis_evidence (hypothesis_id, evidence_id, role)
        VALUES ($1, $2, 'context')
      `, [hypId, evId]);
    }
    console.log(`  ✓ Hypothesis: confidence 92%`);

    // 14. Remediation plan
    const planResult = await client.query(`
      INSERT INTO remediation_plans (incident_id, hypothesis_id, plan_hash, status, proposed_by, proposed_at, actions)
      VALUES ($1, $2, 'sha256-demo', 'proposed', 'IncidentLens Agent', $3, $4)
      RETURNING id
    `, [
      incidentId,
      hypId,
      new Date().toISOString(),
      JSON.stringify([
        { description: "Roll back DEP-9081 to v3.4.0", risk: "medium" },
        { description: "Monitor DB connection pool recovery", risk: "low" },
        { description: "Review and optimize the new JOIN queries before re-deploying", risk: "low" },
      ]),
    ]);
    const planId = planResult.rows[0].id;

    // 15. Plan actions
    const actions = [
      { description: "Roll back DEP-9081 (api-production v3.4.1) to v3.4.0", reason: "The deployment introduced unbounded JOIN queries that exhaust the DB connection pool. Rolling back reverts the trigger.", risk: "medium", blastRadius: "All traffic served by api-production will briefly see a deployment event.", rollbackStrategy: "Redeploy v3.4.1 if the root cause is different.", orderIndex: 0 },
      { description: "Monitor DB connection pool recovery", reason: "After rollback, the connection pool should recover within 2-3 minutes as queued queries drain.", risk: "low", blastRadius: "None — read-only observation.", rollbackStrategy: "N/A", orderIndex: 1 },
      { description: "Add WHERE clauses and LIMIT to the new JOIN queries before re-deploying", reason: "The unbounded SELECT * from the new queries caused full table scans. Adding proper filters and pagination will prevent pool exhaustion.", risk: "low", blastRadius: "Code changes only — requires new deployment.", rollbackStrategy: "N/A", orderIndex: 2 },
    ];
    for (const a of actions) {
      await client.query(`
        INSERT INTO plan_actions (plan_id, description, reason, risk, blast_radius, rollback_strategy, resources, approval_required, order_index)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [planId, a.description, a.reason, a.risk, a.blastRadius, a.rollbackStrategy, JSON.stringify(["service/api-production"]), 1, a.orderIndex]);
    }
    console.log(`  ✓ Remediation plan: ${actions.length} actions`);

    // Verify
    const counts = await client.query(`
      SELECT
        (SELECT count(*) FROM workspaces) as workspaces,
        (SELECT count(*) FROM environments) as environments,
        (SELECT count(*) FROM users) as users,
        (SELECT count(*) FROM incidents) as incidents,
        (SELECT count(*) FROM investigation_runs) as runs,
        (SELECT count(*) FROM evidence) as evidence,
        (SELECT count(*) FROM evidence_relationships) as relationships,
        (SELECT count(*) FROM hypotheses) as hypotheses,
        (SELECT count(*) FROM remediation_plans) as plans,
        (SELECT count(*) FROM plan_actions) as actions,
        (SELECT count(*) FROM deployments) as deployments
    `);
    const c = counts.rows[0];
    console.log("\n=== Summary ===");
    console.log(`  Workspaces: ${c.workspaces}`);
    console.log(`  Environments: ${c.environments}`);
    console.log(`  Users: ${c.users}`);
    console.log(`  Incidents: ${c.incidents}`);
    console.log(`  Investigation runs: ${c.runs}`);
    console.log(`  Evidence items: ${c.evidence}`);
    console.log(`  Evidence relationships: ${c.relationships}`);
    console.log(`  Hypotheses: ${c.hypotheses}`);
    console.log(`  Remediation plans: ${c.plans}`);
    console.log(`  Plan actions: ${c.actions}`);
    console.log(`  Deployments: ${c.deployments}`);
    console.log("\n✓ All demo data seeded successfully!");

  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
