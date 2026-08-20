import { IncidentForm } from "@/components/incidents/incident-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { listServices } from "@/lib/services/incidents";
import { listWorkspaces, listConnections } from "@/lib/services/workspaces";

export const metadata = {
  title: "New incident",
};

export default async function NewIncidentPage() {
  const services = await listServices();
  const workspaces = await listWorkspaces();
  const workspace = workspaces[0] ?? null;
  const providers = workspace ? await listConnections(workspace.id) : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">New incident</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open an incident to begin the investigation workflow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incident details</CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentForm services={services} providers={providers} />
        </CardContent>
      </Card>
    </div>
  );
}
