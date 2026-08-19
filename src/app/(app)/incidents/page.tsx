import Link from "next/link";
import { Plus } from "lucide-react";

import { IncidentFilters } from "@/components/incidents/incident-filters";
import { IncidentTable } from "@/components/incidents/incident-table";
import { Button } from "@/components/ui/button";

import { listIncidents, listServices } from "@/lib/services/incidents";

export const metadata = {
  title: "Incidents",
};

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function IncidentsPage(props: PageProps<"/incidents">) {
  const searchParams = await props.searchParams;

  const incidents = listIncidents({
    severity: str(searchParams.severity),
    status: str(searchParams.status),
    service: str(searchParams.service),
    q: str(searchParams.q),
  });
  const services = await listServices();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {incidents.length} incident{incidents.length === 1 ? "" : "s"} in the console.
          </p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Plus data-icon="inline-start" />
            New incident
          </Link>
        </Button>
      </div>

      <IncidentFilters services={services} />
      <IncidentTable incidents={incidents} />
    </div>
  );
}
