import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { EvidenceRow } from "@/lib/services/incidents";
import { cn } from "@/lib/utils";

const RELEVANCE_STYLE: Record<string, string> = {
  primary:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
  supporting:
    "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400",
  context: "border-border bg-muted/50 text-muted-foreground",
};

function confidencePct(confidence: number): number {
  return Math.round(confidence * 100);
}

export function EvidenceList({ evidence }: { evidence: EvidenceRow[] }) {
  if (evidence.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No evidence collected yet. Run the investigation to gather evidence.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {evidence.map((item) => (
        <Card key={item.id} size="sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">{item.title}</CardTitle>
                <Badge
                  variant="outline"
                  className={cn("font-mono text-[10px]", RELEVANCE_STYLE[item.relevance])}
                >
                  {item.relevance}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{item.source}</span>
                <span className="tabular-nums">{confidencePct(item.confidence)}%</span>
                <time className="tabular-nums">{formatDateTime(item.timestamp)}</time>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{item.observation}</p>
            {item.data && (
              <pre className="mt-2 overflow-x-auto rounded-lg border bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
                {item.data}
              </pre>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
