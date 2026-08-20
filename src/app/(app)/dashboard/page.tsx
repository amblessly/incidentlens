import { Activity, Clock, SearchCheck, ShieldCheck, Timer, TriangleAlert } from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { IncidentsChart } from "@/components/dashboard/incidents-chart";
import { RecentDeployments } from "@/components/dashboard/recent-deployments";
import { RecentIncidents } from "@/components/dashboard/recent-incidents";
import { ServiceHealthList } from "@/components/dashboard/service-health";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { getDashboardData } from "@/lib/services/dashboard";

export const metadata = {
  title: "Dashboard",
};

function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  return formatDuration(m * 60_000);
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Operations dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time snapshot of the incident console. Updated on every request.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active incidents" value={data.counts.active} sub={`${data.counts.open} open · ${data.counts.investigating} investigating`} icon={TriangleAlert} accent="hover:border-amber-500/30" />
        <StatCard label="Investigating now" value={data.counts.investigating} sub="Agent-active investigations" icon={SearchCheck} accent="hover:border-blue-500/30" />
        <StatCard label="Awaiting approval" value={data.counts.awaiting_approval} sub="Plans at the human gate" icon={ShieldCheck} accent="hover:border-violet-500/30" />
        <StatCard label="Resolved" value={data.counts.resolved} sub="Closed incidents" icon={Activity} accent="hover:border-emerald-500/30" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Mean time to investigate"
          value={formatMinutes(data.mttiMinutes)}
          sub="Investigation run duration"
          icon={Timer}
          accent="hover:border-cyan-500/30"
        />
        <StatCard
          label="Mean time to resolve"
          value={formatMinutes(data.mttrMinutes)}
          sub="Incident start → resolved"
          icon={Clock}
          accent="hover:border-pink-500/30"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incidents — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentsChart data={data.incidentsByDay} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentIncidents incidents={data.recentIncidents} />
        <ServiceHealthList services={data.serviceHealth} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentDeployments deployments={data.recentDeployments} />
        <ActivityFeed activity={data.activity} />
      </div>
    </div>
  );
}
