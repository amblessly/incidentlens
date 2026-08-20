import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";

import { IncidentHeader } from "@/components/incidents/incident-header";
import { Timeline } from "@/components/incidents/timeline";
import { RootCauseCard } from "@/components/investigation/root-cause-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getIncidentFull } from "@/lib/services/incidents";

export const metadata = {
  title: "Incident",
};

export default async function IncidentDetailPage(props: PageProps<"/incidents/[id]">) {
  const { id } = await props.params;
  const incident = await getIncidentFull(id);
  if (!incident) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <IncidentHeader incident={incident} active="overview" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{incident.description}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={incident.events} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <RootCauseCard incident={incident} hypotheses={incident.hypotheses} />

          <Card size="sm">
            <CardContent className="flex flex-col items-start gap-3">
              <div>
                <p className="text-sm font-medium">Next step</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {incident.plan
                    ? "Review the remediation plan and approve or reject it."
                    : incident.runs.length > 0
                      ? "Investigation is complete. Generate the remediation plan."
                      : "Run the investigation to gather evidence."}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={
                    incident.plan
                      ? `/incidents/${incident.id}/plan`
                      : incident.runs.length > 0
                        ? `/incidents/${incident.id}/plan`
                        : `/incidents/${incident.id}/investigation`
                  }
                >
                  {incident.plan
                    ? "Review plan"
                    : incident.runs.length > 0
                      ? "Generate plan"
                      : "Go to investigation"}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
