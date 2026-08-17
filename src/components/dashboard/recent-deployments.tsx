import { Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import type { Deployment } from "@/lib/types";

export function RecentDeployments({ deployments }: { deployments: Deployment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-4 text-muted-foreground" aria-hidden />
          Recent deployments
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {deployments.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <div className="flex min-w-0 flex-col">
              <code className="truncate font-mono text-xs text-foreground">{d.service}</code>
              <span className="text-xs text-muted-foreground">
                {d.version} · {d.id}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
              >
                {d.status}
              </Badge>
              <span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {relativeTime(d.deployed_at)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
