import { Bot, Database, Globe2 } from "lucide-react";

import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { ProvidersPanel } from "@/components/settings/providers-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { appMode, modeDescription, modeLabel, sessionSecretConfigured } from "@/lib/config";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { providerAvailable } from "@/lib/providers/registry";
import { listEnvironments, listWorkspaces } from "@/lib/services/workspaces";
import { appUiState } from "@/lib/ui-state";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const mode = appMode();
  const isDemo = mode === "demo";
  const state = await appUiState();
  const isAdmin = state.user ? hasPermission(state.user.role, "settings.manage") : false;

  const workspace = listWorkspaces()[0] ?? null;
  const environments = workspace ? listEnvironments(workspace.id) : [];
  const providerReady = providerAvailable();

  const database = db();
  const counts = {
    incidents: (database.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number }).n,
    users: (database.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
    investigationRuns: (database.prepare("SELECT COUNT(*) AS n FROM investigation_runs").get() as { n: number }).n,
    plans: (database.prepare("SELECT COUNT(*) AS n FROM remediation_plans").get() as { n: number }).n,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="size-4 text-muted-foreground" aria-hidden />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mode
              </dt>
              <dd className="font-medium">{modeLabel(mode)}</dd>
              <dd className="text-xs text-muted-foreground">{modeDescription(mode)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Provider
              </dt>
              <dd className="text-muted-foreground">
                {isDemo
                  ? "Demo provider (deterministic fixtures, clearly labeled)"
                  : providerReady
                    ? "Connected"
                    : "Not configured — investigations will report evidence as unavailable."}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" aria-hidden />
            Infrastructure providers
          </CardTitle>
          <CardDescription>
            Configure providers for incident investigation. Credentials stay server-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvidersPanel />
        </CardContent>
      </Card>

      {workspace && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" aria-hidden />
              Workspace — {workspace.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Slug
                </dt>
                <dd className="font-mono text-xs">{workspace.slug}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Environments
                </dt>
                <dd>
                  {environments.length === 0 && (
                    <span className="text-muted-foreground">None</span>
                  )}
                  {environments.map((env) => (
                    <span key={env.id}>
                      <Badge variant="outline" className="mr-1">
                        {env.name}
                      </Badge>
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage API keys for external incident ingestion. Raw secrets are shown once at
              creation time and are never retrievable afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeysPanel />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>
            Current database at <code className="text-xs">{database.name}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Incidents
              </dt>
              <dd>{counts.incidents}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Users
              </dt>
              <dd>{counts.users}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Investigation runs
              </dt>
              <dd>{counts.investigationRuns}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Remediation plans
              </dt>
              <dd>{counts.plans}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session secret</CardTitle>
          <CardDescription>
            Used to sign session cookies. Must be at least 32 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge
            variant="outline"
            className={
              sessionSecretConfigured()
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
            }
          >
            {sessionSecretConfigured() ? "Configured" : "Not configured"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
