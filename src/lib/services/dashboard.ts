import { db } from "@/lib/db";
import { listIncidents } from "@/lib/services/incidents";
import type { Deployment, IncidentStatus, Severity } from "@/lib/types";

export type ServiceHealthStatus = "healthy" | "warning" | "critical";

export interface ServiceHealth {
  name: string;
  status: ServiceHealthStatus;
  openCount: number;
  resolvedCount: number;
  team: string;
  kind: string;
}

export interface DayBuckets {
  date: string;
  total: number;
  sev1: number;
  sev2: number;
  sev3: number;
  sev4: number;
}

export interface ActivityRow {
  incident_id: string;
  incident_title: string;
  type: string;
  title: string;
  created_at: string;
}

export interface DashboardData {
  counts: Record<
    "active" | "open" | "investigating" | "awaiting_approval" | "approved" | "resolved",
    number
  >;
  mttrMinutes: number | null;
  mttiMinutes: number | null;
  recentIncidents: ReturnType<typeof listIncidents>;
  serviceHealth: ServiceHealth[];
  recentDeployments: Deployment[];
  activity: ActivityRow[];
  incidentsByDay: DayBuckets[];
}

export function getDashboardData(): DashboardData {
  const d = db();

  const statusCounts = d
    .prepare("SELECT status, COUNT(*) AS n FROM incidents GROUP BY status")
    .all() as { status: IncidentStatus; n: number }[];
  const countFor = (s: IncidentStatus) =>
    statusCounts.find((r) => r.status === s)?.n ?? 0;

  const active = ["open", "investigating", "awaiting_approval", "approved"].reduce(
    (sum, s) => sum + countFor(s as IncidentStatus),
    0,
  );

  const mttr = d
    .prepare(
      "SELECT AVG((julianday(resolved_at) - julianday(started_at)) * 1440) AS avg FROM incidents WHERE resolved_at IS NOT NULL",
    )
    .get() as { avg: number | null };

  const mtti = d
    .prepare(
      `SELECT AVG((julianday(r.finished_at) - julianday(r.started_at)) * 1440) AS avg
       FROM investigation_runs r
       WHERE r.status = 'completed' AND r.finished_at IS NOT NULL`,
    )
    .get() as { avg: number | null };

  const recentIncidents = listIncidents().slice(0, 6);

  const serviceRows = d
    .prepare(
      `SELECT s.name, s.team, s.kind,
              SUM(CASE WHEN i.status != 'resolved' THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count
       FROM services s
       LEFT JOIN incidents i ON i.service = s.name
       GROUP BY s.id
       ORDER BY s.name ASC`,
    )
    .all() as {
    name: string;
    team: string;
    kind: string;
    open_count: number | null;
    resolved_count: number | null;
  }[];

  const serviceHealth: ServiceHealth[] = serviceRows.map((s) => {
    const openCount = s.open_count ?? 0;
    const hasSev1 = d
      .prepare(
        "SELECT COUNT(*) AS n FROM incidents WHERE service = ? AND status != 'resolved' AND severity = 'SEV-1'",
      )
      .get(s.name) as { n: number };
    const status: ServiceHealthStatus =
      openCount === 0 ? "healthy" : openCount === 1 && hasSev1.n === 0 ? "warning" : "critical";
    return {
      name: s.name,
      team: s.team,
      kind: s.kind,
      status,
      openCount,
      resolvedCount: s.resolved_count ?? 0,
    };
  });

  const recentDeployments = d
    .prepare("SELECT * FROM deployments ORDER BY deployed_at DESC LIMIT 6")
    .all() as Deployment[];

  const activity = d
    .prepare(
      `SELECT e.incident_id, i.title AS incident_title, e.type, e.title, e.created_at
       FROM incident_events e
       JOIN incidents i ON i.id = e.incident_id
       WHERE e.type IN ('investigation_started','infrastructure_queried','logs_inspected','changes_inspected','deployment_discovered','evidence_correlated','hypothesis_generated','remediation_proposed','approval_requested','approval_granted','remediation_executed','incident_resolved')
       ORDER BY e.created_at DESC
       LIMIT 8`,
    )
    .all() as ActivityRow[];

  const incidentsByDay = buildDayBuckets(d);

  return {
    counts: {
      active,
      open: countFor("open"),
      investigating: countFor("investigating"),
      awaiting_approval: countFor("awaiting_approval"),
      approved: countFor("approved"),
      resolved: countFor("resolved"),
    },
    mttrMinutes: mttr.avg,
    mttiMinutes: mtti.avg,
    recentIncidents,
    serviceHealth,
    recentDeployments,
    activity,
    incidentsByDay,
  };
}

function buildDayBuckets(d: ReturnType<typeof db>): DayBuckets[] {
  const days: DayBuckets[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    days.push({
      date: date.toISOString().slice(0, 10),
      total: 0,
      sev1: 0,
      sev2: 0,
      sev3: 0,
      sev4: 0,
    });
  }

  const rows = d
    .prepare("SELECT started_at, severity FROM incidents")
    .all() as { started_at: string; severity: Severity }[];

  const dayIndex = new Map(days.map((d2, i) => [d2.date, i]));
  for (const row of rows) {
    const key = new Date(row.started_at).toISOString().slice(0, 10);
    const idx = dayIndex.get(key);
    if (idx === undefined) continue;
    const bucket = days[idx];
    bucket.total += 1;
    bucket[`sev${row.severity.slice(-1)}` as "sev1" | "sev2" | "sev3" | "sev4"] += 1;
  }
  return days;
}
