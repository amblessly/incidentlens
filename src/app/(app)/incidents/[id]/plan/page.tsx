import { notFound } from "next/navigation";

import { IncidentHeader } from "@/components/incidents/incident-header";
import { PlanReview } from "@/components/plan/plan-review";

import { getIncidentFull } from "@/lib/services/incidents";
import { hasCompletedInvestigation } from "@/lib/services/investigation";
import { recordPlanViewed } from "@/lib/services/plans";
import { appUiState } from "@/lib/ui-state";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata = {
  title: "Remediation plan",
};

export default async function IncidentPlanPage(props: PageProps<"/incidents/[id]/plan">) {
  const { id } = await props.params;
  const incident = await getIncidentFull(id);
  if (!incident) notFound();

  const state = await appUiState();
  await recordPlanViewed(id, state.user?.name ?? "anonymous");

  const role = state.user?.role ?? "viewer";
  const permissions = {
    generate: hasPermission(role, "plan.generate"),
    approve: hasPermission(role, "plan.approve"),
    reject: hasPermission(role, "plan.reject"),
    execute: hasPermission(role, "plan.execute"),
    rollback: hasPermission(role, "plan.rollback"),
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <IncidentHeader incident={incident} active="plan" />
      <PlanReview
        incidentId={incident.id}
        incidentStatus={incident.status}
        investigationCompleted={await hasCompletedInvestigation(incident.id)}
        plan={incident.plan}
        permissions={permissions}
      />
    </div>
  );
}
