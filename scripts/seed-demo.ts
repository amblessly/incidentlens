#!/usr/bin/env node
/**
 * Seed a demo incident for the hackathon video.
 * Run with: npx tsx scripts/seed-demo.ts
 */

import { db } from "@/lib/db";
import { createIncident, listIncidents } from "@/lib/services/incidents";
import { defaultWorkspace } from "@/lib/services/workspaces";
import { nowIso } from "@/lib/format";

function main() {
  const workspace = defaultWorkspace();
  if (!workspace) {
    console.error("No default workspace found. Run setup first.");
    process.exit(1);
  }

  console.log(`Using workspace: ${workspace.name} (${workspace.id})`);

  // Clean up existing incidents
  const existing = listIncidents({});
  if (existing.length > 0) {
    console.log(`Removing ${existing.length} existing incidents...`);
    for (const inc of existing) {
      db().prepare("DELETE FROM investigation_runs WHERE incident_id = ?").run(inc.id);
      db().prepare("DELETE FROM investigation_steps WHERE run_id IN (SELECT id FROM investigation_runs WHERE incident_id = ?)").run(inc.id);
      db().prepare("DELETE FROM evidence_relationships WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?)").run(inc.id);
      db().prepare("DELETE FROM evidence WHERE incident_id = ?").run(inc.id);
      db().prepare("DELETE FROM hypotheses WHERE incident_id = ?").run(inc.id);
      db().prepare("DELETE FROM incident_events WHERE incident_id = ?").run(inc.id);
      db().prepare("DELETE FROM incidents WHERE id = ?").run(inc.id);
    }
  }

  // Create a demo incident that will produce a great investigation story:
  // "Production API — 5xx spike caused by recent deployment introducing DB connection exhaustion"
  const incident = createIncident({
    title: "Production API — 5xx spike",
    service: "api-production",
    severity: "SEV-1",
    description: "Production API error rate spiked from 0.2% to 18% starting ~10 minutes ago. Customers experiencing 5xx responses. On-call paged.",
    startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 minutes ago
    environment: "production",
    workspaceId: workspace.id,
    source: "manual",
    actorName: "Demo Setup",
    alertPayload: JSON.stringify({
      alert: "HighErrorRate",
      service: "api-production",
      errorRate: "18%",
      threshold: "5%",
      window: "5m",
    }),
    metadata: JSON.stringify({
      demo: true,
      scenario: "deployment-caused-db-pressure",
    }),
  });

  console.log(`Created incident: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Service: ${incident.service}`);
  console.log(`Severity: ${incident.severity}`);
  console.log(`Started: ${incident.started_at}`);
  console.log("");
  console.log("🎬 Ready for demo! Navigate to /incidents/${incident.id} to investigate.");
  console.log("");
  console.log("Expected investigation story:");
  console.log("  1. Recent deployment DEP-9081 (api-production v3.4.1) deployed ~10 min before incident");
  console.log("  2. Error logs show 'connection pool exhausted'");
  console.log("  3. Metrics show p95 latency spike and error rate spike");
  console.log("  4. Database state shows connections at 98/100 (98% utilization)");
  console.log("  5. Hypothesis: Recent deployment caused DB connection exhaustion (high confidence)");
  console.log("  6. Remediation: Roll back DEP-9081");
}

main();