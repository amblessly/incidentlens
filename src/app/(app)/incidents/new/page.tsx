import { IncidentForm } from "@/components/incidents/incident-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { listServices } from "@/lib/services/incidents";

export const metadata = {
  title: "New incident",
};

export default function NewIncidentPage() {
  const services = listServices();

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
          <IncidentForm services={services} />
        </CardContent>
      </Card>
    </div>
  );
}
