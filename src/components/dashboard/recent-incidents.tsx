import Link from "next/link";
import { ArrowRight, Siren } from "lucide-react";

import { SeverityBadge } from "@/components/incidents/severity-badge";
import { StatusBadge } from "@/components/incidents/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import type { IncidentListItem } from "@/lib/services/incidents";

export function RecentIncidents({ incidents }: { incidents: IncidentListItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Siren className="size-4 text-muted-foreground" aria-hidden />
          Recent incidents
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {incidents.map((inc) => (
          <Link
            key={inc.id}
            href={`/incidents/${inc.id}`}
            className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-sm font-medium group-hover:underline">{inc.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {inc.id} · {relativeTime(inc.started_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <SeverityBadge severity={inc.severity} />
              <StatusBadge status={inc.status} />
              <ArrowRight className="size-3.5 text-muted-foreground/60" aria-hidden />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
