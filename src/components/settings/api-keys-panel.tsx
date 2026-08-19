"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

interface ApiKeyRow {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  /** Present only on the create/rotate response — shown exactly once. */
  secret?: string;
}

/**
 * API key administration for external incident ingestion. Raw secrets are
 * shown exactly once at creation/rotation time and are never retrievable
 * afterwards.
 */
export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings/api-keys", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { keys?: ApiKeyRow[] };
    setKeys(body.keys ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/api-keys", { cache: "no-store" })
      .then((res) => res.json().catch(() => ({})) as Promise<{ keys?: ApiKeyRow[] }>)
      .then((body) => {
        if (!cancelled) {
          setKeys(body.keys ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      key?: ApiKeyRow & { secret?: string };
      error?: { message?: string };
    };
    setCreating(false);
    if (!res.ok || !body.key) {
      toast.error(body.error?.message ?? "Failed to create API key.");
      return;
    }
    setName("");
    setRevealed(body.key.secret ?? null);
    await load();
  }

  async function revoke(key: ApiKeyRow) {
    const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke API key.");
      return;
    }
    toast.success(`API key "${key.name}" revoked.`);
    await load();
  }

  async function rotate(key: ApiKeyRow) {
    const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as {
      key?: ApiKeyRow & { secret?: string };
      error?: { message?: string };
    };
    if (!res.ok || !body.key) {
      toast.error(body.error?.message ?? "Failed to rotate API key.");
      return;
    }
    setRevealed(body.key.secret ?? null);
    toast.success("API key rotated. The previous key is revoked.");
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. production alerting"
            required
          />
        </div>
        <Button type="submit" disabled={creating || name.trim().length < 2}>
          {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus data-icon="inline-start" aria-hidden />}
          Create key
        </Button>
      </form>

      {revealed && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Copy this key now — it is shown only once and cannot be retrieved again.
          </p>
          <code className="mt-1.5 block break-all rounded bg-background/60 px-2 py-1.5 font-mono text-xs">
            {revealed}
          </code>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(revealed);
              toast.success("Key copied to clipboard.");
            }}
          >
            Copy
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading keys…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 font-medium">
                  <KeyRound className="size-3.5 text-muted-foreground" aria-hidden />
                  {key.name}
                  {key.revoked_at && (
                    <span className="text-xs text-muted-foreground">(revoked {formatDateTime(key.revoked_at)})</span>
                  )}
                </span>
                <code className="font-mono text-xs text-muted-foreground">{key.key_prefix}_…</code>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {key.last_used_at ? `Last used ${formatDateTime(key.last_used_at)}` : "Never used"}
                </span>
                {!key.revoked_at && (
                  <Button variant="outline" size="icon-sm" aria-label={`Rotate ${key.name}`} onClick={() => void rotate(key)}>
                    <RefreshCcw className="size-3.5" aria-hidden />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Revoke ${key.name}`}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 dark:border-destructive/40"
                  onClick={() => void revoke(key)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}