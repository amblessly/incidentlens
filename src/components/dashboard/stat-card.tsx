import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <Card className={cn("stat-card-hover cursor-default", accent)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground transition-colors group-hover/card:text-foreground" aria-hidden />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
