import Link from "next/link";
import { Lightbulb, ShieldAlert, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { HypothesisRow, IncidentFull } from "@/lib/services/incidents";
import { cn } from "@/lib/utils";

interface RootCauseCardProps {
  incident: IncidentFull;
  hypotheses: HypothesisRow[];
}

export function RootCauseCard({ incident, hypotheses }: RootCauseCardProps) {
  const selected =
    hypotheses.find((h) => h.is_selected === 1) ?? hypotheses[0] ?? null;

  if (!selected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
            Root cause
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            No root-cause hypothesis yet. This incident still needs an investigation.
          </p>
          <Link
            href={`/incidents/${incident.id}/investigation`}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Start investigation
          </Link>
        </CardContent>
      </Card>
    );
  }

  const evidenceTitles = JSON.parse(selected.supporting_evidence) as string[];
  const confidencePct = Math.round(selected.confidence * 100);
  const recommendedAction =
    incident.plan?.actions[0]?.description ??
    (incident.runs[0]?.result
      ? (JSON.parse(incident.runs[0].result).recommendedActions?.[0]?.description as string | undefined)
      : undefined) ??
    "review the remediation plan before any change.";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-amber-500" aria-hidden />
            Probable root cause
          </CardTitle>
          <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
            Hypothesis
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">{selected.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Confidence</span>
            <span className="tabular-nums font-medium text-foreground">{confidencePct}%</span>
          </div>
          <Progress value={confidencePct} aria-label={`Confidence ${confidencePct}%`} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supporting evidence · {evidenceTitles.length}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {evidenceTitles.slice(0, 4).map((title) => (
                <li key={title} className="flex items-start gap-2">
                  <CheckDot />
                  <span className="text-muted-foreground">{title}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Affected components
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {[incident.service, ...(incident.deployment_id ? [incident.deployment_id] : [])].map(
                (component) => (
                  <code
                    key={component}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                  >
                    {component}
                  </code>
                ),
              )}
            </ul>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <span>
            Root cause is a hypothesis, not a fact. <span className="text-foreground">{confidencePct}%</span>{" "}
            confidence based on {incident.evidence.length} evidence items.
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Recommended action:</span>{" "}
            {recommendedAction}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckDot() {
  return (
    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
  );
}

export function confidenceClass(confidence: number): string {
  if (confidence >= 0.8) return "text-emerald-500";
  if (confidence >= 0.6) return "text-amber-500";
  return cn("text-muted-foreground");
}
