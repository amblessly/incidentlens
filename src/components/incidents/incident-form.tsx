"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SEVERITIES, SEVERITY_META } from "@/lib/constants";

interface IncidentFormProps {
  services: string[];
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function IncidentForm({ services }: IncidentFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (!service) nextErrors.service = "Select an affected service.";
    if (!severity) nextErrors.severity = "Select a severity.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitting(false);
      return;
    }

    const form = new FormData(e.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      service,
      severity,
      description: String(form.get("description") ?? ""),
      startedAt: new Date(String(form.get("startedAt") ?? "")).toISOString(),
      deploymentId: String(form.get("deploymentId") ?? "").trim() || null,
      repository: String(form.get("repository") ?? "").trim() || null,
      alertPayload: String(form.get("alertPayload") ?? "").trim() || null,
    };

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        error?: string;
        incident?: { id: string };
      };
      if (!res.ok || !body.incident) {
        toast.error(body.error ?? "Failed to create incident.");
        return;
      }
      toast.success(`Incident ${body.incident.id} created.`);
      router.push(`/incidents/${body.incident.id}`);
      router.refresh();
    } catch {
      toast.error("Network error while creating incident.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="title">Incident title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Production API elevated 5xx errors"
          required
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="service">Affected service</Label>
          <Select value={service} onValueChange={setService} aria-invalid={Boolean(errors.service)}>
            <SelectTrigger id="service" className="w-full" aria-invalid={Boolean(errors.service)}>
              <SelectValue placeholder="Select service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.service && <p className="text-sm text-destructive">{errors.service}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="severity">Severity</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger id="severity" className="w-full" aria-invalid={Boolean(errors.severity)}>
              <SelectValue placeholder="Select severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} — {SEVERITY_META[s].description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.severity && <p className="text-sm text-destructive">{errors.severity}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="5xx responses increased significantly after the latest deployment."
          minLength={10}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="startedAt">Incident start time</Label>
        <Input
          id="startedAt"
          name="startedAt"
          type="datetime-local"
          defaultValue={toLocalInputValue(new Date().toISOString())}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="deploymentId">Deployment ID (optional)</Label>
          <Input id="deploymentId" name="deploymentId" placeholder="DEP-9081" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="repository">Repository (optional)</Label>
          <Input id="repository" name="repository" placeholder="acme-shop/api-gateway" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="alertPayload">Alert payload (optional JSON)</Label>
        <Textarea
          id="alertPayload"
          name="alertPayload"
          className="min-h-24 font-mono text-xs"
          placeholder='{"alert":"error-rate-threshold","value":18.4}'
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Create incident
        </Button>
      </div>
    </form>
  );
}
