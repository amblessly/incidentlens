import { notFound } from "next/navigation";
import { FileSearch } from "lucide-react";

import { IncidentHeader } from "@/components/incidents/incident-header";
import { Timeline } from "@/components/incidents/timeline";
import { InvestigationAudit } from "@/components/investigation/investigation-audit";
import { AgentPanel } from "@/components/investigation/agent-panel";
import { EvidenceList } from "@/components/investigation/evidence-list";
import { HypothesesList } from "@/components/investigation/hypotheses-list";
import { EvidenceGraph } from "@/components/investigation/evidence-graph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getIncidentFull } from "@/lib/services/incidents";
import { getInvestigationState, type StepRow } from "@/lib/services/investigation";

export const metadata = {
  title: "Investigation",
};

export default async function InvestigationPage(props: PageProps<"/incidents/[id]/investigation">) {
  const { id } = await props.params;
  const incident = getIncidentFull(id);
  if (!incident) notFound();

  const { run, steps } = getInvestigationState(id);
  const panelSteps: StepRow[] = steps.map((s) => ({
    ...s,
    status: s.status === "done" || s.status === "active" ? s.status : "pending",
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <IncidentHeader incident={incident} active="investigation" />

      <AgentPanel
        incidentId={incident.id}
        initialRunStatus={run?.status ?? null}
        initialRunError={run?.error ?? null}
        provider={run?.provider ?? null}
        initialSteps={panelSteps}
        incidentStatus={incident.status}
      />

      {run && run.status === "completed" && (
        <>
          <EvidenceGraph
            incident={incident}
            evidence={incident.evidence}
            hypotheses={incident.hypotheses}
            plan={incident.plan}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="size-4 text-muted-foreground" aria-hidden />
                Evidence · {incident.evidence.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvidenceList evidence={incident.evidence} />
            </CardContent>
          </Card>

          <HypothesesList hypotheses={incident.hypotheses} evidence={incident.evidence} />
        </>
      )}

      {run && (
        <InvestigationAudit
          runId={run.id}
          status={run.status}
          provider={run.provider}
          promptVersion={run.prompt_version}
          initiatedBy={run.initiated_by}
          startedAt={run.started_at}
          finishedAt={run.finished_at}
          error={run.error}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Incident timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline events={incident.events} />
        </CardContent>
      </Card>
    </div>
  );
}
