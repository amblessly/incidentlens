import { Bot, Database, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { readClankerConfig } from "@/lib/clanker/clanker-client";
import { db } from "@/lib/db";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  const clankerConfig = readClankerConfig();
  const clankerMode = process.env.CLANKER_MODE ?? "demo";
  const clankerConfigured = clankerMode === "live";

  const database = db();
  const counts = {
    incidents: (database.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number }).n,
    users: (database.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
    services: (database.prepare("SELECT COUNT(*) AS n FROM services").get() as { n: number }).n,
    evidence: (database.prepare("SELECT COUNT(*) AS n FROM evidence").get() as { n: number }).n,
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Integration status and local state.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" aria-hidden />
            Clanker integration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Investigation agent mode</p>
              <p className="text-xs text-muted-foreground">
                {clankerMode === "live"
                  ? "Requests are dispatched to the Clanker Cloud agent."
                  : "Deterministic demo investigator — no live infrastructure queried."}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                clankerConfigured && clankerMode === "live"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400"
              }
            >
              {clankerConfigured && clankerMode === "live" ? "Live" : "Demo"}
            </Badge>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Endpoint
              </dt>
              <dd className="font-mono text-xs">{clankerConfig.baseUrl}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mode
              </dt>
              <dd className="font-mono text-xs">{clankerMode}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Clanker Cloud uses anonymous sandboxes for live investigations. No API key required.
            Credentials live in the server environment only and are never exposed to the browser.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" aria-hidden />
            Local data
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            SQLite-backed persistence. Delete{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">data/incidentlens.db</code>{" "}
            and restart to reseed the demo fixtures.
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Incidents</dt>
              <dd className="tabular-nums">{counts.incidents}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence</dt>
              <dd className="tabular-nums">{counts.evidence}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Services</dt>
              <dd className="tabular-nums">{counts.services}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Users</dt>
              <dd className="tabular-nums">{counts.users}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
            Demo data
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            All seeded incidents are simulated and labeled{" "}
            <Badge variant="outline" className="ml-0.5 border-border bg-muted/50 text-muted-foreground">
              demo
            </Badge>
            . No simulated data is presented as live infrastructure.
          </p>
          <Separator />
          <div className="grid gap-2 sm:grid-cols-3">
            <DemoCard id="INC-0142" title="API deployment regression" state="awaiting approval" />
            <DemoCard id="INC-0153" title="Kubernetes pod crash loop" state="open — run live" />
            <DemoCard id="INC-0161" title="Database pool saturation" state="resolved" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DemoCard({ id, title, state }: { id: string; title: string; state: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className="font-mono text-xs text-muted-foreground">{id}</p>
      <p className="mt-0.5 text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{state}</p>
    </div>
  );
}
