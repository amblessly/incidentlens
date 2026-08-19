import { Server } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInfrastructureProvider, providerAvailable } from "@/lib/providers/registry";

export const metadata = {
  title: "Services",
};

export const dynamic = "force-dynamic";

/**
 * Live view of the services registered with the connected infrastructure
 * provider. In live mode without a provider this shows an honest empty
 * state instead of fabricated services.
 */
export default async function ServicesPage() {
  const available = providerAvailable();

  let services: Awaited<ReturnType<ReturnType<typeof getInfrastructureProvider>["getServices"]>> = [];
  let error: string | null = null;

  if (available) {
    try {
      services = await getInfrastructureProvider().getServices();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live inventory from the connected infrastructure provider.
        </p>
      </div>

      {!available && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">No provider configured</p>
            <p className="text-sm text-muted-foreground">
              In live mode, services are queried from your infrastructure provider. Set
              CLANKER_MODE=live with credentials (or run in demo mode for simulated data).
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">Provider request failed</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {available && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <Card key={service.name}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Server className="size-4 text-muted-foreground" aria-hidden />
                    {service.name}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      service.health === "healthy" || service.status === "healthy"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
                        : service.health === "warning" || service.status === "warning" || service.status === "degraded"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400"
                          : service.health === "critical"
                            ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
                            : "border-border bg-muted/50 text-muted-foreground"
                    }
                  >
                    {service.health ?? service.status ?? "unknown"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground">{service.detail ?? service.kind}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Kind</dt>
                    <dd className="font-medium">{service.kind}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Team</dt>
                    <dd className="font-medium">{service.team ?? "—"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
          {available && services.length === 0 && (
            <Card className="sm:col-span-2">
              <CardDescription className="px-4 py-8 text-center">
                No services reported by the provider.
              </CardDescription>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}