import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { HypothesisRow } from "@/lib/services/incidents";
import { cn } from "@/lib/utils";

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function HypothesesList({ hypotheses }: { hypotheses: HypothesisRow[] }) {
  if (hypotheses.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate hypotheses</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hypotheses.map((h) => {
          const pct = Math.round(h.confidence * 100);
          const isSelected = h.is_selected === 1;
          const evidenceTitles = parseList(h.supporting_evidence);
          const contradicting = parseList(h.contradicting_evidence);
          const missing = parseList(h.missing_evidence);
          return (
            <div
              key={h.id}
              className={cn("flex flex-col gap-1.5", !isSelected && "opacity-80")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {h.title}
                  {isSelected && (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400">
                      Selected
                    </Badge>
                  )}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <Progress value={pct} className={cn(!isSelected && "opacity-50")} aria-hidden />
              <p className="text-sm text-muted-foreground">{h.description}</p>
              {evidenceTitles.length > 0 && (
                <p className="text-xs text-muted-foreground/70">
                  <span className="text-emerald-600 dark:text-emerald-400">Supporting: </span>
                  {evidenceTitles.join(" · ")}
                </p>
              )}
              {contradicting.length > 0 && (
                <p className="text-xs text-muted-foreground/70">
                  <span className="text-amber-600 dark:text-amber-400">Contradicting: </span>
                  {contradicting.join(" · ")}
                </p>
              )}
              {missing.length > 0 && (
                <p className="text-xs text-muted-foreground/70">
                  <span className="text-sky-600 dark:text-sky-400">Missing: </span>
                  {missing.join(" · ")}
                </p>
              )}
              {h.next_step && (
                <p className="text-xs text-muted-foreground/70">
                  <span>Next step: </span>
                  {h.next_step}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
