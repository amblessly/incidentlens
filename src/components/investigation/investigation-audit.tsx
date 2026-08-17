import { ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

interface InvestigationAuditProps {
  runId: number;
  status: "running" | "completed" | "failed";
  provider: string | null;
  promptVersion: string | null;
  initiatedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

/**
 * Compact, read-only audit trail for the latest investigation run.
 *
 * Records who initiated it, the provider used, the prompt version, and the
 * run lifecycle. No credentials or secrets are ever shown or stored.
 */
export function InvestigationAudit({
  runId,
  status,
  provider,
  promptVersion,
  initiatedBy,
  startedAt,
  finishedAt,
  error,
}: InvestigationAuditProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Run ID", value: `#${runId}` },
    { label: "Initiated by", value: initiatedBy ?? "—" },
    { label: "Provider", value: provider ?? "—" },
    { label: "Prompt version", value: promptVersion ?? "—" },
    { label: "Started", value: formatDateTime(startedAt) },
    { label: "Finished", value: formatDateTime(finishedAt) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden />
          Investigation audit
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              status === "completed"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
                : status === "failed"
                  ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400"
            }
          >
            {status}
          </Badge>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="font-mono text-[13px] text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
