import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
