import { db } from "@/lib/db";
import { getInvestigator } from "@/lib/clanker/investigation-agent";
import {
  type IncidentInvestigationInput,
  type InvestigationResult,
  type InvestigationStep,
} from "@/lib/clanker/types";
import { CLANKER_AGENT_NAME, EVENT_META, INVESTIGATOR_NAME } from "@/lib/constants";
import { INVESTIGATION_PROMPT_VERSION } from "@/lib/clanker/prompts";
import { nowIso } from "@/lib/format";
import { addEventOnce, getIncident, updateIncidentStatus } from "@/lib/services/incidents";
import type { EventType } from "@/lib/types";

export class InvestigationError extends Error {}

export interface StepRow {
  id: number;
  run_id: number;
  step_id: string;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
  phase: string | null;
  source: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface RunRow {
  id: number;
  incident_id: string;
  status: "running" | "completed" | "failed";
  agent: string;
  provider: string | null;
  prompt_version: string | null;
  initiated_by: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  result: string | null;
}

export interface InvestigationState {
  run: RunRow | null;
  steps: StepRow[];
}

const STEP_TO_EVENT: Record<string, EventType> = {
  "inspecting-infrastructure": "infrastructure_queried",
  "checking-changes": "changes_inspected",
  "correlating-evidence": "evidence_correlated",
  "evaluating-hypotheses": "hypothesis_generated",
  "preparing-remediation": "remediation_proposed",
};

export function getInvestigationState(incidentId: string): InvestigationState {
  const run = db()
    .prepare(
      "SELECT * FROM investigation_runs WHERE incident_id = ? ORDER BY started_at DESC LIMIT 1",
    )
    .get(incidentId) as RunRow | undefined;

  const steps = run
    ? (db()
        .prepare(
          "SELECT * FROM investigation_steps WHERE run_id = ? ORDER BY id ASC",
        )
        .all(run.id) as StepRow[])
    : [];

  return { run: run ?? null, steps };
}

export function hasCompletedInvestigation(incidentId: string): boolean {
  return Boolean(
    db()
      .prepare(
        "SELECT 1 FROM investigation_runs WHERE incident_id = ? AND status = 'completed' LIMIT 1",
      )
      .get(incidentId),
  );
}

function buildInput(incidentId: string): IncidentInvestigationInput {
  const incident = getIncident(incidentId);
  if (!incident) {
    throw new InvestigationError("Incident not found.");
  }
  return {
    incidentId: incident.id,
    title: incident.title,
    description: incident.description,
    service: incident.service,
    severity: incident.severity,
    startedAt: incident.started_at,
    deploymentId: incident.deployment_id,
    repository: incident.repository,
    alertPayload: incident.alert_payload,
  };
}

/**
 * Runs the configured investigator for an incident, persisting step progress,
 * timeline events, evidence and hypotheses as it goes.
 *
 * The investigator is strictly read-only; no infrastructure is mutated here.
 *
 * Failure contract:
 * - the incident is preserved
 * - any previous evidence and hypotheses are preserved (a new run only
 *   replaces them on success)
 * - the run is marked failed with a clear message
 * - nothing is ever fabricated in place of unavailable evidence
 */
export async function runInvestigation(
  incidentId: string,
  opts: { onStep?: (step: InvestigationStep) => void; initiatedBy?: string } = {},
): Promise<InvestigationResult> {
  const d = db();
  const incident = getIncident(incidentId);
  if (!incident) throw new InvestigationError("Incident not found.");
  if (incident.status === "resolved") {
    throw new InvestigationError("Resolved incidents cannot be re-investigated.");
  }

  const startedAt = nowIso();
  const investigator = getInvestigator();
  const runResult = d
    .prepare(
      `INSERT INTO investigation_runs (incident_id, status, agent, provider, prompt_version, initiated_by, started_at)
       VALUES (?, 'running', ?, ?, ?, ?, ?)`,
    )
    .run(
      incidentId,
      CLANKER_AGENT_NAME,
      investigator.provider,
      null,
      opts.initiatedBy ?? INVESTIGATOR_NAME,
      startedAt,
    );
  const runId = Number(runResult.lastInsertRowid);

  addEventOnce(
    incidentId,
    runId,
    "investigation_started",
    "Investigation started",
    `${investigator.provider === "clanker-cloud" ? "Clanker Investigator" : "Demo investigator"} assigned.`,
    CLANKER_AGENT_NAME,
    startedAt,
  );

  const upsertStep = d.prepare(`
    INSERT INTO investigation_steps (run_id, step_id, label, detail, status, phase, source, completed_at, updated_at)
    VALUES (@run_id, @step_id, @label, @detail, @status, @phase, @source, @completed_at, @updated_at)
    ON CONFLICT (run_id, step_id) DO UPDATE SET
      label = excluded.label,
      detail = excluded.detail,
      status = excluded.status,
      phase = excluded.phase,
      source = excluded.source,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  `);

  const handleStep = (step: InvestigationStep) => {
    const at = nowIso();
    upsertStep.run({
      run_id: runId,
      step_id: step.id,
      label: step.label,
      detail: step.detail,
      status: step.status,
      phase: step.phase,
      source: step.source,
      completed_at: step.completedAt,
      updated_at: at,
    });
    const eventType = STEP_TO_EVENT[step.id];
    if (step.status === "done" && eventType) {
      const meta = EVENT_META[eventType];
      addEventOnce(incidentId, runId, eventType, meta.label, step.detail, CLANKER_AGENT_NAME, at);
    }
    opts.onStep?.(step);
  };

  let result: InvestigationResult;
  try {
    result = await investigator.investigateIncident(buildInput(incidentId), handleStep);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investigation failed unexpectedly.";
    const finishedAt = nowIso();
    d.prepare(
      "UPDATE investigation_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?",
    ).run(finishedAt, message, runId);
    addEventOnce(
      incidentId,
      runId,
      "note",
      "Investigation failed",
      message,
      CLANKER_AGENT_NAME,
      finishedAt,
    );
    throw new InvestigationError(message);
  }

  const finishedAt = nowIso();
  d.transaction(() => {
    d.prepare(
      "UPDATE investigation_runs SET status = 'completed', finished_at = ?, prompt_version = ?, result = ? WHERE id = ?",
    ).run(finishedAt, INVESTIGATION_PROMPT_VERSION, JSON.stringify(result), runId);

    d.prepare("DELETE FROM evidence WHERE incident_id = ?").run(incidentId);
    const insertEvidence = d.prepare(`
      INSERT INTO evidence (incident_id, source, title, observation, relevance, confidence, timestamp, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    for (const e of result.evidence) {
      insertEvidence.run(
        incidentId,
        e.source,
        e.title,
        e.observation,
        e.relevance,
        e.confidence,
        finishedAt,
      );
    }

    d.prepare("DELETE FROM hypotheses WHERE incident_id = ?").run(incidentId);
    const insertHypothesis = d.prepare(`
      INSERT INTO hypotheses (incident_id, title, description, confidence, is_selected, supporting_evidence, contradicting_evidence, missing_evidence, next_step, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    result.hypotheses.forEach((h, i) => {
      insertHypothesis.run(
        incidentId,
        h.title,
        h.description,
        h.confidence,
        i === 0 ? 1 : 0,
        JSON.stringify(h.supportingEvidence),
        JSON.stringify(h.contradictingEvidence),
        JSON.stringify(h.missingEvidence),
        h.nextStep,
        finishedAt,
      );
    });
  })();

  updateIncidentStatus(incidentId, "investigating");
  addEventOnce(
    incidentId,
    runId,
    "evidence_correlated",
    "Evidence correlated",
    `Correlated ${result.evidence.length} evidence items across sources.`,
    CLANKER_AGENT_NAME,
    finishedAt,
  );
  addEventOnce(
    incidentId,
    runId,
    "hypothesis_generated",
    "Root-cause hypothesis generated",
    `Leading hypothesis: ${result.hypotheses[0]?.title ?? "none"} (${Math.round((result.hypotheses[0]?.confidence ?? 0) * 100)}%).`,
    CLANKER_AGENT_NAME,
    finishedAt,
  );

  return result;
}
