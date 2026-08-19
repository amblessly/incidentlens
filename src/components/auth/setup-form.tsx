"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * First-run setup: create the initial admin user, workspace, environment
 * and provider connection. Only reachable when no users exist.
 */
export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        workspaceName: form.get("workspaceName"),
        environmentName: form.get("environmentName") || undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      setPending(false);
      setError(body.error?.message ?? "Setup failed.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-5" aria-hidden />
          </span>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Welcome to IncidentLens</h1>
          <p className="text-sm text-muted-foreground">
            First-run setup — create the initial admin account and workspace.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create your account</CardTitle>
            <CardDescription>
              You will be the admin. More users can be added later via the database or a future
              admin UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" placeholder="Ada Lovelace" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="ada@company.dev" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workspaceName">Workspace name</Label>
                <Input id="workspaceName" name="workspaceName" placeholder="Acme Inc" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="environmentName">Environment (optional)</Label>
                <Input id="environmentName" name="environmentName" placeholder="production" defaultValue="production" />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating workspace…" : "Create workspace"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}