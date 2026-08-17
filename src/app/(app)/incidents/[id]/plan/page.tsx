import { notFound } from "next/navigation";

import { IncidentHeader } from "@/components/incidents/incident-header";
import { PlanReview } from "@/components/plan/plan-review";

import { getIncidentFull } from "@/lib/services/incidents";
import { hasCompletedInvestigation } from "@/lib/services/investigation";
import { recordPlanViewed } from "@/lib/services/plans";

export const metadata = {
  title: "Remediation plan",
};

export default async function IncidentPlanPage(props: PageProps<"/incidents/[id]/plan">) {
  const { id } = await props.params;
  const incident = getIncidentFull(id);
  if (!incident) notFound();

  recordPlanViewed(id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <IncidentHeader incident={incident} active="plan" />
      <PlanReview
        incidentId={incident.id}
        incidentStatus={incident.status}
        investigationCompleted={hasCompletedInvestigation(incident.id)}
        plan={incident.plan}
      />
    </div>
  );
}
