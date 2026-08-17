import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SeverityBadge } from "@/components/incidents/severity-badge";
import { StatusBadge } from "@/components/incidents/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { IncidentListItem } from "@/lib/services/incidents";

function DurationCell({ minutes }: { minutes: number }) {
  if (minutes < 60) return <span className="tabular-nums">{minutes}m</span>;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <span className="tabular-nums">
      {h}h{m > 0 ? ` ${m}m` : ""}
    </span>
  );
}

export function IncidentTable({ incidents }: { incidents: IncidentListItem[] }) {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-14 text-center">
        <p className="text-sm font-medium">No incidents match</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Adjust the filters or create a new incident to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Incident</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Investigator</TableHead>
            <TableHead>Root cause</TableHead>
            <TableHead className="text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidents.map((inc) => (
            <TableRow key={inc.id}>
              <TableCell>
                <Link
                  href={`/incidents/${inc.id}`}
                  className="group flex max-w-xs flex-col gap-0.5"
                >
                  <span className="line-clamp-1 font-medium group-hover:underline">
                    {inc.title}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {inc.id}
                    {inc.is_demo === 1 && " · demo"}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                  {inc.service}
                </code>
              </TableCell>
              <TableCell>
                <SeverityBadge severity={inc.severity} />
              </TableCell>
              <TableCell>
                <StatusBadge status={inc.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="block tabular-nums">{formatDateTime(inc.started_at)}</span>
                <span className="block text-xs text-muted-foreground/70">
                  {relativeTime(inc.started_at)}
                </span>
              </TableCell>
              <TableCell>
                <DurationCell minutes={inc.duration_minutes} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {inc.investigator_name ?? "—"}
              </TableCell>
              <TableCell>
                {inc.has_root_cause === 1 ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400">
                    Hypothesis
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/incidents/${inc.id}`}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Open ${inc.id}`}
                >
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
