"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProviderRow {
  id: string;
  workspace_id: string;
  environment_id: string | null;
  provider_type: string;
  name: string;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
  config: string | null;
  created_at: string;
}

const PROVIDER_TYPES = [
  { value: "generic", label: "Generic REST API", description: "Configure base URL, auth, and endpoint paths." },
  { value: "clanker", label: "Clanker Cloud", description: "Sandbox-based infrastructure probes." },
  { value: "datadog", label: "Datadog", description: "APM, logs, and metrics from Datadog." },
  { value: "grafana", label: "Grafana Cloud", description: "Logs, metrics, and traces from Grafana." },
  { value: "aws", label: "AWS", description: "CloudWatch, EKS, RDS, and more." },
  { value: "gcp", label: "Google Cloud", description: "Cloud Monitoring, Logging, GKE." },
  { value: "azure", label: "Azure", description: "Monitor, App Insights, AKS." },
];

function isGenericType(t: string) {
  return t === "generic" || t === "datadog" || t === "grafana" || t === "aws" || t === "gcp" || t === "azure";
}

export function ProvidersPanel() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("generic");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formEndpoints, setFormEndpoints] = useState(
    "services,health,logs,metrics,deployments,database,changes",
  );

  async function load() {
    const res = await fetch("/api/settings/providers", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { providers?: ProviderRow[] };
    setProviders(body.providers ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      await load();
      if (!cancelled) {
        // state already set inside load
      }
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setFormName("");
    setFormType("generic");
    setFormBaseUrl("");
    setFormApiKey("");
    setFormEndpoints("services,health,logs,metrics,deployments,database,changes");
  }

  async function handleCreate() {
    if (!formName.trim() || formName.trim().length < 2) {
      toast.error("Provider name must be at least 2 characters.");
      return;
    }

    const config = isGenericType(formType)
      ? {
          baseUrl: formBaseUrl.trim(),
          authMethod: formApiKey ? "api-key" : ("none" as const),
          credentials: formApiKey || null,
          headers: {},
          endpoints: {
            services: formEndpoints.includes("services") ? "/api/services" : null,
            health: formEndpoints.includes("health") ? "/api/health" : null,
            logs: formEndpoints.includes("logs") ? "/api/logs" : null,
            metrics: formEndpoints.includes("metrics") ? "/api/metrics" : null,
            deployments: formEndpoints.includes("deployments") ? "/api/deployments" : null,
            database: formEndpoints.includes("database") ? "/api/database" : null,
            changes: formEndpoints.includes("changes") ? "/api/changes" : null,
          },
          timeoutMs: 30_000,
        }
      : undefined;

    setCreating(true);
    try {
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), provider_type: formType, config }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        provider?: ProviderRow;
      };
      if (!res.ok || !body.provider) {
        toast.error(body.error?.message ?? "Failed to create provider.");
        return;
      }
      toast.success(`Provider "${body.provider.name}" created.`);
      setShowForm(false);
      resetForm();
      await load();
    } catch {
      toast.error("Network error while creating provider.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(provider: ProviderRow) {
    if (!confirm(`Delete provider "${provider.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/settings/providers/${provider.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(body.error?.message ?? "Failed to delete provider.");
        return;
      }
      toast.success(`Provider "${provider.name}" deleted.`);
      await load();
    } catch {
      toast.error("Network error while deleting provider.");
    }
  }

  async function handleTestConnection(provider: ProviderRow) {
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: provider.id }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        latencyMs?: number;
        message?: string;
        error?: { message?: string };
      };
      if (body.ok) {
        toast.success(`Connected (${body.latencyMs}ms): ${body.message}`);
      } else {
        toast.error(body.error?.message ?? body.message ?? "Connection failed.");
      }
      await load();
    } catch {
      toast.error("Network error while testing connection.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {providers.length} provider{providers.length !== 1 ? "s" : ""} registered
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
          disabled={creating}
        >
          <Plus className="mr-1.5 size-3.5" />
          Add Provider
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="provider-name">Provider name</Label>
              <Input
                id="provider-name"
                placeholder="e.g. Production Datadog"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Provider type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isGenericType(formType) && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="provider-url">Base URL</Label>
                <Input
                  id="provider-url"
                  placeholder="https://api.example.com"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="provider-apikey">API Key (optional)</Label>
                <Input
                  id="provider-apikey"
                  type="password"
                  placeholder="Server-side only, never exposed to browser"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="provider-endpoints">Capabilities (comma-separated)</Label>
                <Textarea
                  id="provider-endpoints"
                  value={formEndpoints}
                  onChange={(e) => setFormEndpoints(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list: services, health, logs, metrics, deployments, database, changes
                </p>
              </div>
            </>
          )}

          {formType === "clanker" && (
            <p className="text-xs text-muted-foreground">
              Configure CLANKER_MODE=live in your server environment. Credentials stay server-side.
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating || !formName.trim()}>
              {creating ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading providers...
        </div>
      ) : providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No providers configured. Click &ldquo;Add Provider&rdquo; to connect to your infrastructure.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {providers.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge
                    variant="outline"
                    className={
                      p.status === "connected"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400"
                        : p.status === "error"
                          ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
                          : "border-border bg-muted/50 text-muted-foreground"
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
                <code className="font-mono text-xs text-muted-foreground">
                  {p.provider_type} · {p.id}
                </code>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => handleTestConnection(p)}
                  title="Test connection"
                >
                  <Wifi className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(p)}
                  title="Delete provider"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
