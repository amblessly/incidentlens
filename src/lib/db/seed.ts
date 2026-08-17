import type { Database } from "@/lib/db";
import { CLANKER_AGENT_NAME, INVESTIGATOR_NAME } from "@/lib/constants";
import { INVESTIGATION_PROMPT_VERSION } from "@/lib/clanker/prompts";
import { buildScenarios, type DemoScenario } from "@/lib/demo/scenarios";
import type { InvestigationResultData } from "@/lib/types";

const USERS = [
  { id: "u-ava", name: INVESTIGATOR_NAME, email: "ava@incidentlens.dev", role: "On-call engineer" },
  { id: "u-jordan", name: "Jordan Reyes", email: "jordan@incidentlens.dev", role: "Platform engineer" },
  { id: "u-maya", name: "Maya Patel", email: "maya@incidentlens.dev", role: "Backend engineer" },
];

const SERVICES = [
  { id: "svc-api", name: "api-production", team: "Core API", kind: "service" },
  { id: "svc-pay", name: "payments-service", team: "Payments", kind: "service" },
  { id: "svc-db", name: "db-primary", team: "Data", kind: "database" },
  { id: "svc-auth", name: "auth-service", team: "Identity", kind: "service" },
  { id: "svc-search", name: "search-service", team: "Search", kind: "service" },
  { id: "svc-web", name: "web-frontend", team: "Web", kind: "web" },
  { id: "svc-worker", name: "worker-jobs", team: "Batch", kind: "worker" },
  { id: "svc-cdn", name: "cdn-edge", team: "Edge", kind: "cdn" },
];

function buildResult(scenario: DemoScenario): InvestigationResultData {
  return {
    incidentSummary: scenario.incident.description,
    severityAssessment: severityAssessment(scenario.incident.severity),
    affectedServices: [scenario.incident.service],
    timeline: scenario.events.map((e) => ({
      step: e.title,
      detail: e.description ?? "",
    })),
    evidence: scenario.evidence.map((e) => ({
      source: e.source,
      title: e.title,
      observation: e.observation,
      relevance: e.relevance,
      confidence: e.confidence,
    })),
    hypotheses: scenario.hypotheses.map((h) => ({
      title: h.title,
      description: h.description,
      confidence: h.confidence,
      supportingEvidence: h.evidenceTitles,
      contradictingEvidence: h.contradictingTitles ?? [],
      missingEvidence: h.missingEvidence ?? [],
      nextStep: h.nextStep ?? "",
    })),
    recommendedActions: scenario.plan?.actions.map((a) => ({
      description: a.description,
      reason: a.reason,
    })) ?? [],
    missingEvidence: [
      ...new Set(scenario.hypotheses.flatMap((h) => h.missingEvidence ?? [])),
    ],
    confidence: scenario.hypotheses[0]?.confidence ?? 0,
    safetyNotes: [
      "Investigation is read-only. No infrastructure mutations are performed.",
      "All remediation actions require explicit human approval before execution.",
    ],
  };
}

function severityAssessment(severity: string): string {
  switch (severity) {
    case "SEV-1":
      return "Critical — complete service outage or data loss. Treat as a P0.";
    case "SEV-2":
      return "High — degraded service with partial outage. Requires urgent attention.";
    case "SEV-3":
      return "Medium — minor impact; investigation is non-urgent.";
    default:
      return "Low — cosmetic or low-impact issue.";
  }
}

export function seedIfEmpty(db: Database): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number };
  if (count.n > 0) return;

  const now = new Date();
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, role, created_at) VALUES (@id, @name, @email, @role, @created_at)",
  );
  const insertService = db.prepare(
    "INSERT INTO services (id, name, team, kind, created_at) VALUES (@id, @name, @team, @kind, @created_at)",
  );
  const insertDeployment = db.prepare(
    "INSERT INTO deployments (id, service, version, commit_sha, author, deployed_at, status) VALUES (@id, @service, @version, @commit, @author, @deployed_at, @status)",
  );
  const insertIncident = db.prepare(`
    INSERT INTO incidents (id, title, service, severity, status, description, started_at, created_at, resolved_at, assigned_to, deployment_id, repository, alert_payload, is_demo)
    VALUES (@id, @title, @service, @severity, @status, @description, @started_at, @created_at, @resolved_at, @assigned_to, @deployment_id, @repository, @alert_payload, @is_demo)
  `);
  const insertEvent = db.prepare(
    "INSERT INTO incident_events (incident_id, type, title, description, actor, created_at) VALUES (@incident_id, @type, @title, @description, @actor, @created_at)",
  );
  const insertEvidence = db.prepare(`
    INSERT INTO evidence (incident_id, source, title, observation, relevance, confidence, timestamp, data)
    VALUES (@incident_id, @source, @title, @observation, @relevance, @confidence, @timestamp, @data)
  `);
  const insertHypothesis = db.prepare(`
    INSERT INTO hypotheses (incident_id, title, description, confidence, is_selected, supporting_evidence, contradicting_evidence, missing_evidence, next_step, created_at)
    VALUES (@incident_id, @title, @description, @confidence, @is_selected, @supporting_evidence, @contradicting_evidence, @missing_evidence, @next_step, @created_at)
  `);
  const insertRun = db.prepare(`
    INSERT INTO investigation_runs (incident_id, status, agent, provider, prompt_version, initiated_by, started_at, finished_at, result)
    VALUES (@incident_id, @status, @agent, @provider, @prompt_version, @initiated_by, @started_at, @finished_at, @result)
  `);
  const insertPlan = db.prepare(`
    INSERT INTO remediation_plans (incident_id, status, summary, created_at, approved_at, approved_by, rejection_reason, hash, executed_at, executed_by, execution_result, rollback_result)
    VALUES (@incident_id, @status, @summary, @created_at, @approved_at, @approved_by, @rejection_reason, @hash, @executed_at, @executed_by, @execution_result, @rollback_result)
  `);
  const insertAction = db.prepare(`
    INSERT INTO remediation_actions (plan_id, order_index, description, expected_impact, risk_level, rollback_strategy, affected_resources, reason, evidence_refs, approval_required, blast_radius, prerequisites)
    VALUES (@plan_id, @order_index, @description, @expected_impact, @risk_level, @rollback_strategy, @affected_resources, @reason, @evidence_refs, @approval_required, @blast_radius, @prerequisites)
  `);

  const scenarios = buildScenarios(now);

  db.transaction(() => {
    for (const u of USERS) {
      insertUser.run({ ...u, created_at: ago(60 * 24 * 30) });
    }
    for (const s of SERVICES) {
      insertService.run({ ...s, created_at: ago(60 * 24 * 60) });
    }

    for (const sc of scenarios) {
      insertDeployment.run({
        id: sc.deployment.id,
        service: sc.deployment.service,
        version: sc.deployment.version,
        commit: sc.deployment.commit,
        author: sc.deployment.author,
        deployed_at: ago(sc.deployment.deployedAgo),
        status: "success",
      });
    }

    insertDeployment.run({
      id: "DEP-9097",
      service: "worker-jobs",
      version: "v1.4.2",
      commit: "c41d9ab",
      author: "Ava Chen",
      deployed_at: ago(7 * 60),
      status: "success",
    });
    insertDeployment.run({
      id: "DEP-9095",
      service: "auth-service",
      version: "v2.9.0",
      commit: "71fae12",
      author: "Maya Patel",
      deployed_at: ago(23 * 60),
      status: "success",
    });
    insertDeployment.run({
      id: "DEP-9093",
      service: "cdn-edge",
      version: "edge-44",
      commit: "b6d01ef",
      author: "Jordan Reyes",
      deployed_at: ago(41 * 60),
      status: "success",
    });
    insertDeployment.run({
      id: "DEP-9088",
      service: "web-frontend",
      version: "v5.1.0",
      commit: "8aa22d1",
      author: "Maya Patel",
      deployed_at: ago(41 * 60),
      status: "success",
    });

    for (const sc of scenarios) {
      const { incident } = sc;
      insertIncident.run({
        id: incident.id,
        title: incident.title,
        service: incident.service,
        severity: incident.severity,
        status: incident.status,
        description: incident.description,
        started_at: ago(incident.startedAgo),
        created_at: ago(incident.startedAgo),
        resolved_at: incident.resolvedAgo ? ago(incident.resolvedAgo) : null,
        assigned_to: "u-ava",
        deployment_id: incident.deploymentId,
        repository: incident.repository,
        alert_payload: incident.alertPayload ? JSON.stringify(incident.alertPayload) : null,
        is_demo: 1,
      });

      const hasInvestigation = sc.evidence.length > 0;

      for (const e of [...sc.events].sort((a, b) => a.atAgo - b.atAgo)) {
        insertEvent.run({
          incident_id: incident.id,
          type: e.type,
          title: e.title,
          description: e.description ?? null,
          actor: e.type.startsWith("approval") || e.type === "note"
            ? INVESTIGATOR_NAME
            : hasInvestigation
              ? CLANKER_AGENT_NAME
              : INVESTIGATOR_NAME,
          created_at: ago(e.atAgo),
        });
      }

      for (const ev of sc.evidence) {
        insertEvidence.run({
          incident_id: incident.id,
          source: ev.source,
          title: ev.title,
          observation: ev.observation,
          relevance: ev.relevance,
          confidence: ev.confidence,
          timestamp: ago(ev.atAgo),
          data: ev.data ? JSON.stringify(ev.data) : null,
        });
      }

      for (const [i, h] of sc.hypotheses.entries()) {
        insertHypothesis.run({
          incident_id: incident.id,
          title: h.title,
          description: h.description,
          confidence: h.confidence,
          is_selected: i === 0 ? 1 : 0,
          supporting_evidence: JSON.stringify(h.evidenceTitles),
          contradicting_evidence: h.contradictingTitles ? JSON.stringify(h.contradictingTitles) : null,
          missing_evidence: h.missingEvidence ? JSON.stringify(h.missingEvidence) : null,
          next_step: h.nextStep ?? null,
          created_at: ago(sc.events.length ? Math.min(...sc.events.map((e) => e.atAgo)) + 12 : incident.startedAgo),
        });
      }

      if (hasInvestigation) {
        const started = ago(incident.startedAgo - 1);
        const finished = ago(Math.min(incident.startedAgo - 12, ...sc.evidence.map((e) => e.atAgo)));
        const result = buildResult(sc);
        const runResult = insertRun.run({
          incident_id: incident.id,
          status: "completed",
          agent: CLANKER_AGENT_NAME,
          provider: "clanker-demo",
          prompt_version: INVESTIGATION_PROMPT_VERSION,
          initiated_by: INVESTIGATOR_NAME,
          started_at: started,
          finished_at: finished,
          result: JSON.stringify(result),
        });
        const runId = Number(runResult.lastInsertRowid);

        const stepDefs = [
          { id: "understanding-incident", label: "Understanding incident", detail: `Reading incident context and alert payload for ${incident.service}.`, phase: "understanding", source: "incident-report" },
          { id: "determining-window", label: "Determining investigation window", detail: "Bracketing the window from the incident start time and alert firing time.", phase: "understanding", source: "incident-report" },
          { id: "investigation-planning", label: "Planning investigation", detail: "Building a plan: inspect service, check changes, inspect errors, check dependencies, correlate.", phase: "planning", source: "agent" },
          { id: "inspecting-infrastructure", label: "Inspecting infrastructure", detail: `Querying read-only infrastructure state for ${incident.service}.`, phase: "collection", source: "cloud-infrastructure" },
          { id: "checking-changes", label: "Checking recent changes", detail: `Scanning recent deployments and CI history touching ${incident.service}.`, phase: "collection", source: "deployments" },
          { id: "correlating-evidence", label: "Correlating evidence", detail: `Correlating ${sc.evidence.length} observations across metrics, logs and state.`, phase: "correlation", source: "agent" },
          { id: "evaluating-hypotheses", label: "Evaluating hypotheses", detail: `Scoring ${sc.hypotheses.length} candidate hypotheses against collected evidence.`, phase: "root-cause", source: "agent" },
          { id: "preparing-remediation", label: "Preparing remediation plan", detail: "Drafting a read-only remediation plan for human review.", phase: "remediation", source: "agent" },
        ];
        const insertStep = db.prepare(`
          INSERT INTO investigation_steps (run_id, step_id, label, detail, status, phase, source, completed_at, updated_at)
          VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?)
        `);
        stepDefs.forEach((s, i) => {
          const completedAt = new Date(
            new Date(finished).getTime() - (stepDefs.length - 1 - i) * 30_000,
          ).toISOString();
          insertStep.run(runId, s.id, s.label, s.detail, s.phase, s.source, completedAt, completedAt);
        });
      }

      if (sc.plan) {
        const isExecuted = sc.plan.planStatus === "executed";
        const planResult = insertPlan.run({
          incident_id: incident.id,
          status: sc.plan.planStatus,
          summary: sc.plan.summary,
          created_at: ago(sc.plan.approvedAgo ? sc.plan.approvedAgo + 8 : incident.startedAgo - 8),
          approved_at: sc.plan.approvedAgo ? ago(sc.plan.approvedAgo) : null,
          approved_by: sc.plan.approvedAgo ? INVESTIGATOR_NAME : null,
          rejection_reason: null,
          hash: null,
          executed_at: isExecuted ? ago(6) : null,
          executed_by: isExecuted ? INVESTIGATOR_NAME : null,
          execution_result: isExecuted
            ? "Plan executed: all 3 actions applied (simulated — no infrastructure was mutated)."
            : null,
          rollback_result: null,
        });
        const planIdValue = Number(planResult.lastInsertRowid);

        sc.plan.actions.forEach((a, i) => {
          insertAction.run({
            plan_id: planIdValue,
            order_index: i,
            description: a.description,
            expected_impact: a.expectedImpact,
            risk_level: a.risk,
            rollback_strategy: a.rollback,
            affected_resources: JSON.stringify(a.resources),
            reason: a.reason,
            evidence_refs: JSON.stringify(a.evidenceTitles),
            approval_required: a.approvalRequired ? 1 : 0,
            blast_radius: a.blastRadius ?? null,
            prerequisites: a.prerequisites ? JSON.stringify(a.prerequisites) : null,
          });
        });
      }
    }
  })();

  console.log(`[incidentlens] seeded demo database with ${scenarios.length} incidents`);
}

