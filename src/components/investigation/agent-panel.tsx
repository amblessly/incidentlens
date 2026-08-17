"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, FlaskConical, Loader2, Play, RotateCcw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_STEPS, INVESTIGATION_PHASE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

type StepState = {
  step_id: string;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
  phase: string | null;
  source: string | null;
  completed_at: string | null;
};

interface AgentPanelProps {
  incidentId: string;
  initialRunStatus: "running" | "completed" | "failed" | null;
  initialRunError: string | null;
  provider: string | null;
  initialSteps: StepState[];
  incidentStatus: string;
}

function fallbackSteps(): StepState[] {
  return AGENT_STEPS.map((label) => ({
    step_id: label,
    label,
    detail: "",
    status: "pending",
    phase: null,
    source: null,
    completed_at: null,
  }));
}

export function AgentPanel({
  incidentId,
  initialRunStatus,
  initialRunError,
  provider,
  initialSteps,
  incidentStatus,
}: AgentPanelProps) {
  const router = useRouter();
  const [runStatus, setRunStatus] = useState(initialRunStatus);
  const [runError, setRunError] = useState(initialRunError);
  const [steps, setSteps] = useState<StepState[]>(
    initialSteps.length > 0 ? initialSteps : fallbackSteps(),
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshedRef = useRef(false);

  const isDemo = provider !== "clanker-cloud";

  useEffect(() => {
    if (runStatus !== "running") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/incidents/${incidentId}/investigation`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          setError("Investigation could not be started.");
          setRunStatus("failed");
          return;
        }
        if (!res.ok) {
          setError("Failed to read investigation progress.");
          setRunStatus("failed");
          return;
        }
        const body = (await res.json()) as {
          run: {
            status: "running" | "completed" | "failed";
            error: string | null;
          };
          steps: StepState[];
        };
        if (body.steps.length > 0) setSteps(body.steps);
        setRunStatus(body.run.status);
        if (body.run.status === "failed") {
          setRunError(body.run.error ?? "Investigation failed unexpectedly.");
        }
        if (body.run.status === "running") {
          timer = setTimeout(tick, 600);
        } else if (!refreshedRef.current) {
          refreshedRef.current = true;
          router.refresh();
        }
      } catch {
        setError("Lost connection to the investigation agent.");
        setRunStatus("failed");
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runStatus, incidentId, router]);

  async function start() {
    setStarting(true);
    setError(null);
    setRunError(null);
    setRunStatus("running");
    setSteps(fallbackSteps());
    try {
      await fetch(`/api/incidents/${incidentId}/investigation`, {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      /* failure surfaces via polling */
    }
    setStarting(false);
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const isWaitingForApproval =
    runStatus === "completed" && incidentStatus === "awaiting_approval";
  const showError = error ?? (runStatus === "failed" ? runError : null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Bot className="size-4 text-primary" aria-hidden />
            Investigation agent
            <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
              Clanker · read-only
            </Badge>
            {isDemo && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400"
              >
                <FlaskConical className="size-3" aria-hidden />
                DEMO ENVIRONMENT
              </Badge>
            )}
          </CardTitle>
          {runStatus === "running" && (
            <Badge
              variant="outline"
              className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400"
            >
              <Loader2 className="size-3 animate-spin" />
              Investigating
            </Badge>
          )}
          {runStatus === "completed" && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
            >
              <Check className="size-3" />
              Complete
            </Badge>
          )}
          {runStatus === "failed" && (
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
            >
              Failed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isDemo && (
          <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            DEMO ENVIRONMENT — the investigation agent replays deterministic fixtures. No live
            infrastructure is queried and simulated evidence is never mixed with live evidence.
          </p>
        )}

        {runStatus === null && !starting && (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" aria-hidden />
              Investigation not started
            </div>
            <p className="text-sm text-muted-foreground">
              Run the Clanker investigation agent to collect evidence and produce a
              root-cause hypothesis. The agent is strictly read-only.
            </p>
            <Button onClick={start} disabled={starting}>
              <Play data-icon="inline-start" />
              Start investigation
            </Button>
          </div>
        )}

        {(starting || runStatus !== null) && (
          <ol className="flex flex-col gap-1" aria-label="Investigation progress">
            {steps.map((step, i) => {
              const isDone = step.status === "done";
              const isActive = step.status === "active";
              const isLast = i === steps.length - 1;
              const phase = step.phase ? INVESTIGATION_PHASE_META[step.phase as keyof typeof INVESTIGATION_PHASE_META] : null;
              return (
                <li key={step.step_id} className="relative flex gap-3 pb-2.5">
                  {!isLast && (
                    <span
                      className={cn(
                        "absolute top-6 left-[7px] h-[calc(100%-24px)] w-px",
                        isDone ? "bg-emerald-500/30" : "bg-border",
                      )}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      isDone && "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
                      isActive && "border-sky-500/40 bg-sky-500/10 text-sky-500",
                      !isDone && !isActive && "border-border bg-background text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {isDone ? (
                      <Check className="size-3" />
                    ) : isActive ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <span className="size-1 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        isDone || isActive ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-sm text-muted-foreground">{step.detail}</p>
                    )}
                    <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground/70">
                      {phase && <span>{phase.label}</span>}
                      {step.source && <span>source: {step.source}</span>}
                      {step.completed_at && (
                        <span className="tabular-nums">
                          {new Date(step.completed_at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {showError && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="text-sm text-destructive">{showError}</p>
            {runStatus === "failed" && (
              <p className="text-xs text-muted-foreground">
                The incident and any previously collected evidence are preserved. You can retry.
              </p>
            )}
          </div>
        )}

        {runStatus === "failed" && (
          <Button variant="outline" onClick={start} disabled={starting} className="self-start">
            <RotateCcw data-icon="inline-start" />
            Retry investigation
          </Button>
        )}

        {runStatus === "completed" && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm">
            <p className="font-medium">
              Investigation complete — {doneCount}/{steps.length} steps
            </p>
            <p className="text-muted-foreground">
              {isWaitingForApproval
                ? "Remediation plan generated and awaiting human approval."
                : "Evidence and hypotheses are ready for review."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
