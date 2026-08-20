import { db } from "@/lib/db";
import { DEFAULT_AGENT_NAME } from "@/lib/constants";
import { nowIso } from "@/lib/format";
import { providerErrorMessage } from "@/lib/errors";
import { investigationLogger } from "@/lib/log";
import { runEngine, type EngineResult, type EngineStep } from "@/lib/investigation/engine";
import { getInfrastructureProvider } from "@/lib/providers/registry";
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
  request_id: string | null;
  workspace_id: string | null;
  provider_connection_id: string | null;
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

export async function getInvestigationState(incidentId: string): Promise<InvestigationState> {
  const run = (await db()
    .prepare(
      "SELECT * FROM investigation_runs WHERE incident_id = ? ORDER BY started_at DESC LIMIT 1",
    )
    .get(incidentId)) as RunRow | undefined;

  const steps = run
    ? ((await db()
        .prepare(
          "SELECT * FROM investigation_steps WHERE run_id = ? ORDER BY id ASC",
        )
        .all(run.id)) as StepRow[])
    : [];

  return { run: run ?? null, steps };
}

export async function hasCompletedInvestigation(incidentId: string): Promise<boolean> {
  return Boolean(
    await db()
      .prepare(
        "SELECT 1 FROM investigation_runs WHERE incident_id = ? AND status = 'completed' LIMIT 1",
      )
      .get(incidentId),
  );
}

/**
 * Runs the evidence-driven investigation engine against the connected
 * infrastructure provider, persisting steps, timeline events, evidence,
 * relationships and hypotheses as it goes.
 *
 * Failure contract:
 * - the incident is preserved
 * - any previous evidence/hypotheses are preserved (only replaced on success)
 * - the run is marked failed with a clear message and error code
 * - nothing is ever fabricated in place of unavailable evidence
 */
export async function runInvestigation(
  incidentId: string,
  opts: { onStep?: (step: EngineStep) => void; initiatedBy?: string } = {},
): Promise<EngineResult> {
  const d = db();
  const incident = await getIncident(incidentId);
  if (!incident) throw new InvestigationError("Incident not found.");
  if (incident.status === "resolved") {
    throw new InvestigationError("Resolved incidents cannot be re-investigated.");
  }

  const provider = getInfrastructureProvider();
  const providerName = provider.name;
  const startedAt = nowIso();
  const runResult = await d
    .prepare(
      `INSERT INTO investigation_runs (incident_id, status, agent, provider, prompt_version, initiated_by, started_at, workspace_id)
       VALUES (?, 'running', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      incidentId,
      DEFAULT_AGENT_NAME,
      provider.id,
      "engine",
      opts.initiatedBy ?? "system",
      startedAt,
      incident.workspace_id,
    );
  const runId = Number(runResult.lastInsertRowid);

  await addEventOnce(
    incidentId,
    runId,
    "investigation_started",
    "Investigation started",
    `Evidence-driven investigation started against ${providerName}.`,
    DEFAULT_AGENT_NAME,
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

  // The engine invokes onStep synchronously, so persistence is fire-and-forget;
  // the run record itself is only finalized after the engine completes.
  const handleStep = async (step: EngineStep) => {
    try {
      const at = nowIso();
      await upsertStep.run({
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
        await addEventOnce(incidentId, runId, eventType, step.label, step.detail, DEFAULT_AGENT_NAME, at);
      }
    } catch (error) {
      investigationLogger.error("failed to persist investigation step", { runId, error });
    }
    opts.onStep?.(step);
  };

  let result: EngineResult;
  try {
    result = await runEngine({
      incident,
      environment: incident.environment ?? "production",
      provider,
      onStep: handleStep,
    });
  } catch (error) {
    const message = providerErrorMessage(error);
    const finishedAt = nowIso();
    await d
      .prepare(
        "UPDATE investigation_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?",
      )
      .run(finishedAt, message, runId);
    await addEventOnce(
      incidentId,
      runId,
      "note",
      "Investigation failed",
      message,
      DEFAULT_AGENT_NAME,
      finishedAt,
    );
    investigationLogger.error("investigation failed", { incidentId, runId, error: message });
    throw new InvestigationError(message);
  }

  const finishedAt = nowIso();
  await d.transaction(async () => {
    await d
      .prepare(
        "UPDATE investigation_runs SET status = 'completed', finished_at = ?, prompt_version = 'engine-1', result = ? WHERE id = ?",
      )
      .run(finishedAt, JSON.stringify(result), runId);

    await d
      .prepare(
        "DELETE FROM evidence_relationships WHERE evidence_id IN (SELECT id FROM evidence WHERE incident_id = ?)",
      )
      .run(incidentId);
    await d.prepare("DELETE FROM evidence WHERE incident_id = ?").run(incidentId);
    const insertEvidence = d.prepare(`
      INSERT INTO evidence (incident_id, run_id, source, source_type, title, observation, relevance, confidence, timestamp, service, environment, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    const dbIds: number[] = [];
    for (const e of result.evidence) {
      const r = await insertEvidence.run(
        incidentId,
        runId,
        e.source,
        e.sourceType,
        e.observation.slice(0, 140),
        e.observation,
        e.relevance,
        e.confidence,
        e.timestamp,
        e.service,
        e.environment,
      );
      dbIds.push(Number(r.lastInsertRowid));
    }

    const insertRelationship = d.prepare(`
      INSERT OR IGNORE INTO evidence_relationships (evidence_id, related_evidence_id, relationship, reason)
      VALUES (?, ?, ?, ?)
    `);
    for (const rel of result.relationships) {
      const fromId = dbIds[rel.from];
      const toId = dbIds[rel.to];
      if (fromId === undefined || toId === undefined) continue;
      await insertRelationship.run(fromId, toId, rel.relationship, rel.reason);
    }

    await d.prepare("DELETE FROM hypotheses WHERE incident_id = ?").run(incidentId);
    const insertHypothesis = d.prepare(`
      INSERT INTO hypotheses (incident_id, run_id, title, description, confidence, is_selected, supporting_evidence, contradicting_evidence, missing_evidence, next_step, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [i, h] of result.hypotheses.entries()) {
      const toDbIds = (indices: number[]) =>
        JSON.stringify(
          indices.map((idx) => dbIds[idx]).filter((id): id is number => id !== undefined),
        );
      await insertHypothesis.run(
        incidentId,
        runId,
        h.title,
        h.explanation,
        h.confidence,
        i === 0 ? 1 : 0,
        toDbIds(h.supportingEvidence),
        toDbIds(h.contradictingEvidence),
        JSON.stringify(h.missingEvidence),
        h.suggestedNextStep,
        finishedAt,
      );
    }
  });

  await updateIncidentStatus(incidentId, "investigating");
  await addEventOnce(
    incidentId,
    runId,
    "evidence_correlated",
    "Evidence correlated",
    `Correlated ${result.evidence.length} evidence items across ${result.relationships.length} relationships.`,
    DEFAULT_AGENT_NAME,
    finishedAt,
  );
  await addEventOnce(
    incidentId,
    runId,
    "hypothesis_generated",
    "Root-cause hypothesis generated",
    `Leading hypothesis: ${result.hypotheses[0]?.title ?? "none"} (${Math.round((result.hypotheses[0]?.confidence ?? 0) * 100)}%).`,
    DEFAULT_AGENT_NAME,
    finishedAt,
  );

  return result;
}