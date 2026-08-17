import Link from "next/link";
import { ArrowLeft, Server } from "lucide-react";

import { SeverityBadge } from "@/components/incidents/severity-badge";
import { StatusBadge } from "@/components/incidents/status-badge";
import { Separator } from "@/components/ui/separator";
import { durationBetween, formatDateTime } from "@/lib/format";
import type { IncidentFull } from "@/lib/services/incidents";
import { getUserName } from "@/lib/services/incidents";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview", href: "" },
  { key: "investigation", label: "Investigation", href: "/investigation" },
  { key: "plan", label: "Plan", href: "/plan" },
] as const;

export type IncidentTab = (typeof TABS)[number]["key"];

export function IncidentHeader({
  incident,
  active,
}: {
  incident: IncidentFull;
  active: IncidentTab;
}) {
  const base = `/incidents/${incident.id}`;
  const investigator = getUserName(incident.assigned_to);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/incidents"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to incidents
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {incident.id}
            {incident.is_demo === 1 && " · demo"}
          </span>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {incident.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Server className="size-3.5" aria-hidden />
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              {incident.service}
            </code>
          </span>
          <span>
            Started <time className="tabular-nums text-foreground">{formatDateTime(incident.started_at)}</time>
          </span>
          <span>
            Duration{" "}
            <span className="tabular-nums text-foreground">
              {durationBetween(incident.started_at, incident.resolved_at)}
            </span>
          </span>
          {investigator && <span>Investigator {investigator}</span>}
          {incident.deployment_id && (
            <span>
              Deploy{" "}
              <code className="tabular-nums text-foreground">{incident.deployment_id}</code>
            </span>
          )}
        </div>
      </div>

      <Separator />

      <nav className="flex gap-1" aria-label="Incident sections">
        {TABS.map((tab) => {
          const href = tab.href ? `${base}${tab.href}` : base;
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
