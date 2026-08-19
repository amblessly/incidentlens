import Link from "next/link";
import { Activity as ActivityIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_META } from "@/lib/constants";
import { formatTime, relativeTime } from "@/lib/format";
import type { ActivityRow } from "@/lib/services/dashboard";

export function ActivityFeed({ activity }: { activity: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" aria-hidden />
          Investigation activity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {activity.length === 0 && (
          <p className="text-sm text-muted-foreground">No investigation activity yet.</p>
        )}
        {activity.map((item) => {
          const meta = EVENT_META[item.type as keyof typeof EVENT_META] ?? { label: item.title, kind: "info" as const };
          return (
            <Link
              key={`${item.incident_id}-${item.created_at}-${item.type}`}
              href={`/incidents/${item.incident_id}`}
              className="list-item-hover flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-medium">{meta.label}</p>
                <p className="truncate text-xs text-muted-foreground">{item.incident_title}</p>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={formatTime(item.created_at)}>
                {relativeTime(item.created_at)}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
