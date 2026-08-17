"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DayBuckets } from "@/lib/services/dashboard";

interface IncidentsChartProps {
  data: DayBuckets[];
}

const SEVERITY_COLORS = {
  sev1: "var(--destructive)",
  sev2: "var(--chart-2)",
  sev3: "var(--chart-3)",
  sev4: "var(--chart-5)",
} as const;

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function IncidentsChart({ data }: IncidentsChartProps) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Incidents by severity over the last 14 days">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {(Object.keys(SEVERITY_COLORS) as (keyof typeof SEVERITY_COLORS)[]).map((key) => (
              <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SEVERITY_COLORS[key]} stopOpacity={0.35} />
                <stop offset="95%" stopColor={SEVERITY_COLORS[key]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            className="text-xs"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            className="text-xs"
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip
            labelFormatter={(label) => formatDay(String(label))}
            formatter={(value, name) => [
              String(value ?? ""),
              String(name).toUpperCase().replace("SEV", "SEV-"),
            ]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="sev1"
            stackId="1"
            stroke={SEVERITY_COLORS.sev1}
            fill={`url(#grad-sev1)`}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="sev2"
            stackId="1"
            stroke={SEVERITY_COLORS.sev2}
            fill={`url(#grad-sev2)`}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="sev3"
            stackId="1"
            stroke={SEVERITY_COLORS.sev3}
            fill={`url(#grad-sev3)`}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="sev4"
            stackId="1"
            stroke={SEVERITY_COLORS.sev4}
            fill={`url(#grad-sev4)`}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
