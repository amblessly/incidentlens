"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MANUAL_RECOVERY_LABEL, PLAN_STATUS_META, RISK_META } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { PlanWithActions } from "@/lib/services/incidents";

interface PlanReviewProps {
  incidentId: string;
  incidentStatus: string;
  investigationCompleted: boolean;
  plan: PlanWithActions | null;
  permissions: {
    generate: boolean;
    approve: boolean;
    reject: boolean;
    execute: boolean;
    rollback: boolean;
  };
}

type PlanAction = "generate" | "approve" | "reject" | "execute" | "rollback";

function apiErrorMessage(error: { message?: string } | string | undefined): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  return error.message;
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function PlanReview({
  incidentId,
  incidentStatus,
  investigationCompleted,
  plan,
  permissions,
}: PlanReviewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | PlanAction>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function runAction(action: PlanAction, payload?: Record<string, unknown>) {
    setBusy(action);
    try {
      if (action === "generate") {
        const res = await fetch(`/api/incidents/${incidentId}/plan`, {
          method: "POST",
          cache: "no-store",
        });
        const body = (await res.json()) as { error?: { message?: string } | string };
        if (!res.ok) {
          toast.error(apiErrorMessage(body.error) ?? "Failed to generate plan.");
          return;
        }
        toast.success("Remediation plan generated.");
      } else {
        const res = await fetch(`/api/incidents/${incidentId}/plan/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
          cache: "no-store",
        });
        const body = (await res.json()) as { error?: { message?: string } | string };
        if (!res.ok) {
          toast.error(apiErrorMessage(body.error) ?? "Action failed.");
          return;
        }
        if (action === "approve") {
          toast.success("Plan approved. Nothing executes until you explicitly execute the plan.");
        }
        if (action === "reject") toast.success("Plan rejected.");
        if (action === "execute") toast.success("Plan executed.");
        if (action === "rollback") toast.success("Rollback recorded. Incident reopened.");
      }
      router.refresh();
    } catch {
      toast.error("Network error.");
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = plan ? PLAN_STATUS_META[plan.status as keyof typeof PLAN_STATUS_META] : null;
  const showGenerate = !plan && investigationCompleted;
  const needsInvestigation = !plan && !investigationCompleted;
  const manualRecovery =
    plan !== null && plan.actions.some((a) => a.rollback_strategy === MANUAL_RECOVERY_LABEL);

  const previewLines = plan
    ? [
        ...plan.actions.map((a, i) => `${i + 1}. ${a.description}`),
        `${plan.actions.length + 1}. Stop if health does not improve — ${
          manualRecovery
            ? "some actions have no automated rollback and require manual recovery."
            : "every action defines a rollback strategy."
        }`,
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm dark:border-amber-500/40">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
        <p className="text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Review required before infrastructure changes.</span>{" "}
          Investigation is read-only. No action in this plan executes automatically — every
          change requires explicit human approval. Nothing will change in your infrastructure
          until you approve and then execute this plan.
        </p>
      </div>

      {needsInvestigation && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-6">
          <p className="text-sm font-medium">Investigation required first</p>
          <p className="text-sm text-muted-foreground">
            A remediation plan can only be generated after the investigation completes.
          </p>
          <Button asChild variant="outline" size="sm">
            <a href={`/incidents/${incidentId}/investigation`}>Open investigation</a>
          </Button>
        </div>
      )}

      {showGenerate && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" aria-hidden />
            No remediation plan yet
          </div>
          <p className="text-sm text-muted-foreground">
            Generate a human-reviewed remediation plan from the investigation evidence.
          </p>
          <Button onClick={() => runAction("generate")} disabled={busy !== null || !permissions.generate}>
            {busy === "generate" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            Generate remediation plan
          </Button>
        </div>
      )}

      {plan && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-heading text-base font-medium">Remediation plan</p>
              {statusLabel && (
                <Badge variant="outline" className={statusLabel.className}>
                  {statusLabel.label}
                </Badge>
              )}
              {manualRecovery && (
                <Badge
                  variant="outline"
                  className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
                >
                  <ShieldAlert className="mr-1 size-3.5" aria-hidden />
                  Manual recovery required
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {plan.status === "pending_approval" && (permissions.approve || permissions.reject) && (
                <>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button disabled={busy !== null || !permissions.approve}>
                        {busy === "approve" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCheck data-icon="inline-start" />
                        )}
                        Approve plan
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Approve remediation plan</DialogTitle>
                        <DialogDescription>
                          Review required before infrastructure changes. Confirm you have
                          reviewed the proposed changes, evidence, risk and rollback for every
                          action in this plan.
                        </DialogDescription>
                      </DialogHeader>
                      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                        {plan.summary}
                      </p>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button
                            disabled={busy !== null}
                            onClick={() => {
                              void runAction("approve");
                            }}
                          >
                            {busy === "approve" ? <Loader2 className="animate-spin" /> : null}
                            Confirm approval
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={busy !== null || !permissions.reject}
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 dark:border-destructive/40"
                      >
                        <ShieldX data-icon="inline-start" />
                        Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject remediation plan</DialogTitle>
                        <DialogDescription>
                          Rejecting sends the plan back and returns the incident to an
                          investigating state. Provide a reason for the record.
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Why is this plan not acceptable?"
                        aria-label="Rejection reason"
                      />
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button
                            variant="destructive"
                            disabled={busy !== null || rejectReason.trim().length < 3}
                            onClick={() => {
                              void runAction("reject", { reason: rejectReason.trim() });
                            }}
                          >
                            {busy === "reject" ? <Loader2 className="animate-spin" /> : null}
                            Confirm rejection
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {plan.status === "approved" && incidentStatus !== "resolved" && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button disabled={busy !== null || manualRecovery || !permissions.execute}>
                      {busy === "execute" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Play data-icon="inline-start" />
                      )}
                      Execute plan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Execute approved plan?</DialogTitle>
                      <DialogDescription>
                        This is the execution boundary. The plan fingerprint and approval are
                        verified before anything runs. If the plan changed since approval, or
                        the approval has expired, execution is refused.
                      </DialogDescription>
                    </DialogHeader>
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      {plan.summary}
                    </p>
                    {plan.hash && (
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        Plan fingerprint: {plan.hash}
                      </p>
                    )}
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          disabled={busy !== null}
                          onClick={() => {
                            void runAction("execute");
                          }}
                        >
                          {busy === "execute" ? <Loader2 className="animate-spin" /> : null}
                          Confirm execution
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {plan.status === "executed" && permissions.rollback && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={busy !== null}>
                      {busy === "rollback" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RotateCcw data-icon="inline-start" />
                      )}
                      Rollback
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Roll back remediation?</DialogTitle>
                      <DialogDescription>
                        Reverses the executed plan using each action&apos;s rollback strategy and
                        reopens the incident for continued investigation.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          variant="destructive"
                          disabled={busy !== null}
                          onClick={() => {
                            void runAction("rollback");
                          }}
                        >
                          {busy === "rollback" ? <Loader2 className="animate-spin" /> : null}
                          Confirm rollback
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {plan.status === "rejected" && permissions.generate && (
                <Button onClick={() => runAction("generate")} disabled={busy !== null}>
                  {busy === "generate" ? <Loader2 className="animate-spin" /> : null}
                  Regenerate plan
                </Button>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{plan.summary}</p>

          {plan.approved_by && plan.approved_at && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-emerald-500" aria-hidden />
              Approved by <span className="font-medium text-foreground">{plan.approved_by}</span>{" "}
              at {formatDateTime(plan.approved_at)}
            </p>
          )}

          {plan.rejection_reason && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Rejected:</span> {plan.rejection_reason}
              </span>
            </div>
          )}

          <div className="overflow-hidden rounded-lg bg-zinc-950 font-mono text-xs leading-relaxed text-emerald-400 ring-1 ring-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <span className="tracking-widest text-zinc-400">PLAN</span>
              <span className="text-zinc-500">
                #{plan.id} · {statusLabel?.label ?? plan.status}
              </span>
            </div>
            <pre className="whitespace-pre-wrap p-3">{previewLines.join("\n")}</pre>
          </div>

          <ol className="flex flex-col gap-3">
            {plan.actions.map((action) => {
              const risk = RISK_META[action.risk_level as keyof typeof RISK_META];
              const resources = parseList(action.affected_resources);
              const evidence = parseList(action.evidence_refs);
              const prerequisites = parseList(action.prerequisites ?? "");
              const isManual = action.rollback_strategy === MANUAL_RECOVERY_LABEL;
              return (
                <li
                  key={action.id}
                  className="rounded-xl border bg-card p-4 text-sm ring-1 ring-foreground/5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground">
                        {action.order_index + 1}
                      </span>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">{action.description}</p>
                        {action.approval_required === 1 && (
                          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <ShieldCheck className="size-3.5" aria-hidden />
                            Requires explicit approval
                          </p>
                        )}
                        {isManual && (
                          <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <ShieldAlert className="size-3.5" aria-hidden />
                            Manual recovery required — one-click execution is blocked
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={risk.className}>
                      {risk.label} risk
                    </Badge>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Expected impact
                      </dt>
                      <dd className="text-muted-foreground">{action.expected_impact}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Blast radius
                      </dt>
                      <dd className="text-muted-foreground">{action.blast_radius ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Rollback
                      </dt>
                      <dd className="text-muted-foreground">{action.rollback_strategy}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Reason
                      </dt>
                      <dd className="text-muted-foreground">{action.reason}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Evidence
                      </dt>
                      <dd className="text-muted-foreground">
                        {evidence.length > 0 ? evidence.join(" · ") : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Prerequisites
                      </dt>
                      <dd className="text-muted-foreground">
                        {prerequisites.length > 0 ? prerequisites.join(" · ") : "—"}
                      </dd>
                    </div>
                  </dl>

                  {resources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {resources.map((r) => (
                        <code key={r} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {r}
                        </code>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {plan.status === "executed" && (
            <div className="rounded-xl border bg-card p-4 text-sm ring-1 ring-foreground/5">
              <p className="font-medium">Execution audit trail</p>
              <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Approved by
                  </dt>
                  <dd className="text-muted-foreground">{plan.approved_by ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Approved at
                  </dt>
                  <dd className="text-muted-foreground">{formatDateTime(plan.approved_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Executed by
                  </dt>
                  <dd className="text-muted-foreground">{plan.executed_by ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Executed at
                  </dt>
                  <dd className="text-muted-foreground">{formatDateTime(plan.executed_at)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Execution result
                  </dt>
                  <dd className="text-muted-foreground">{plan.execution_result ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Rollback result
                  </dt>
                  <dd className="text-muted-foreground">{plan.rollback_result ?? "None"}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
