import { ClipboardList } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { listAuditEvents } from "@/lib/services/audit";

export const metadata = {
  title: "Audit log",
};

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = listAuditEvents(200);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of every important operation in the platform.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {events.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit events recorded yet.
            </p>
          )}
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 py-3 text-sm">
              <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-mono text-xs text-muted-foreground">{event.action}</p>
                <p className="break-words text-muted-foreground">{event.detail ?? "—"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                <time className="tabular-nums">{formatDateTime(event.created_at)}</time>
                <span>{event.user_name ?? "system"}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}