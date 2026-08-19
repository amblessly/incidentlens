"use client";

import { useState } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Runs a real read-only probe against the provider for a connection and
 * reports exactly what the provider returned (or the error it produced).
 */
export function TestConnectionButton({ connectionId }: { connectionId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        durationMs?: number;
        error?: { message?: string; code?: string };
      };
      if (!res.ok) {
        setResult(body.error?.message ?? "Test failed.");
        toast.error(body.error?.message ?? "Test failed.");
        return;
      }
      setResult(`Connected — probe completed in ${body.durationMs}ms.`);
      toast.success("Connection test succeeded.");
    } catch {
      setResult("Network error while testing the connection.");
      toast.error("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="outline" size="sm" onClick={test} disabled={busy}>
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <PlugZap data-icon="inline-start" aria-hidden />
        )}
        Test connection
      </Button>
      {result && <p className="max-w-[220px] text-right text-xs text-muted-foreground">{result}</p>}
    </div>
  );
}