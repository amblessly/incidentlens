"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterX, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INCIDENT_STATUSES, SEVERITIES } from "@/lib/constants";

interface IncidentFiltersProps {
  services: string[];
}

export function IncidentFilters({ services }: IncidentFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `/incidents?${qs}` : "/incidents", { scroll: false });
    },
    [router, searchParams],
  );

  const hasFilters = ["severity", "status", "service", "q"].some((k) =>
    searchParams.has(k),
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Search incidents…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") update({ q: q.trim() || null });
          }}
          onBlur={() => update({ q: q.trim() || null })}
          aria-label="Search incidents"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.get("severity") ?? ""}
          onValueChange={(v) => update({ severity: v || null })}
        >
          <SelectTrigger className="w-32" aria-label="Filter by severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? ""}
          onValueChange={(v) => update({ status: v || null })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {INCIDENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("service") ?? ""}
          onValueChange={(v) => update({ service: v || null })}
        >
          <SelectTrigger className="w-44" aria-label="Filter by service">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              router.replace("/incidents", { scroll: false });
            }}
          >
            <FilterX className="size-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
