import { Server } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceHealth as ServiceHealthRow, ServiceHealthStatus } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ServiceHealthStatus, { label: string; dot: string }> = {
  healthy: { label: "Healthy", dot: "bg-emerald-500" },
  warning: { label: "Warning", dot: "bg-amber-500" },
  critical: { label: "Critical", dot: "bg-destructive" },
};

export function ServiceHealthList({ services }: { services: ServiceHealthRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" aria-hidden />
          Service health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {services.map((service) => {
          const style = STATUS_STYLE[service.status];
          return (
            <div
              key={service.name}
              className="list-item-hover flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <code className="truncate font-mono text-xs text-foreground">{service.name}</code>
                <span className="text-xs text-muted-foreground">
                  {service.team} · {service.openCount} open
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
                {style.label}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
