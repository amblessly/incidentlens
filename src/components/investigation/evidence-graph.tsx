"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Box,
  Bug,
  Container,
  Database,
  Lightbulb,
  Maximize2,
  Network,
  Rocket,
  Server,
  Settings,
  TriangleAlert,
  Wrench,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildEvidenceGraph,
  canBuildEvidenceGraph,
  confidencePct,
  NODE_KIND_LABEL,
  relatedNodes,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from "@/lib/evidence-graph";
import { formatDateTime } from "@/lib/format";
import type {
  EvidenceRow,
  HypothesisRow,
  PlanWithActions,
} from "@/lib/services/incidents";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

const WORLD_W = 1100;
const ROW_H = 170;
const LAYER_GAP = 200;

const KIND_COLOR: Record<NodeKind, string> = {
  incident: "#7c3aed",
  service: "#2563eb",
  deployment: "#d97706",
  error: "#dc2626",
  metric: "#16a34a",
  infrastructure: "#64748b",
  database: "#0891b2",
  kubernetes: "#a21caf",
  config: "#ea580c",
  hypothesis: "#ca8a04",
  remediation: "#059669",
};

const KIND_ICON: Record<NodeKind, LucideIcon> = {
  incident: TriangleAlert,
  service: Server,
  deployment: Rocket,
  error: Bug,
  metric: Activity,
  infrastructure: Box,
  database: Database,
  kubernetes: Container,
  config: Settings,
  hypothesis: Lightbulb,
  remediation: Wrench,
};

interface EvidenceGraphProps {
  incident: Incident;
  evidence: EvidenceRow[];
  hypotheses: HypothesisRow[];
  plan: PlanWithActions | null;
}

interface Point {
  x: number;
  y: number;
}

interface ViewState {
  x: number;
  y: number;
  k: number;
}

type Selection =
  | { type: "node"; node: GraphNode }
  | { type: "edge"; edge: GraphEdge }
  | null;

function layerOf(kind: NodeKind): number {
  switch (kind) {
    case "incident":
      return 0;
    case "service":
      return 1;
    case "hypothesis":
      return 3;
    case "remediation":
      return 4;
    default:
      return 2;
  }
}

function layout(nodes: GraphNode[]): { positions: Map<string, Point>; height: number } {
  const groups = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const l = layerOf(n.kind);
    groups.set(l, [...(groups.get(l) ?? []), n]);
  }

  const colsFor = (l: number, count: number): number => {
    if (count === 1) return 1;
    if (l === 2) return Math.min(5, count);
    return Math.min(3, count);
  };

  const positions = new Map<string, Point>();
  let y = 70;
  for (const l of [0, 1, 2, 3, 4]) {
    const items = groups.get(l);
    if (!items || items.length === 0) continue;
    const cols = colsFor(l, items.length);
    const rows = Math.ceil(items.length / cols);
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / cols);
      const rowStart = row * cols;
      const countInRow = Math.min(cols, items.length - rowStart);
      const col = i - rowStart;
      const slot = WORLD_W / (countInRow + 1);
      positions.set(items[i].id, { x: slot * (col + 1), y: y + row * ROW_H });
    }
    y += rows * ROW_H + LAYER_GAP;
  }
  return { positions, height: y + 40 };
}

function edgeGeometry(p1: Point, p2: Point): { d: string; mx: number; my: number } {
  const my = (p1.y + p2.y) / 2;
  const d = `M ${p1.x} ${p1.y} C ${p1.x} ${my}, ${p2.x} ${my}, ${p2.x} ${p2.y}`;
  const mx = (p1.x + p2.x) / 2;
  return { d, mx, my: 0.125 * p1.y + 0.75 * my + 0.125 * p2.y };
}

function fitTransform(cw: number, ch: number, w: number, h: number): ViewState {
  const k = Math.max(0.2, Math.min(cw / w, ch / h, 1.2) * 0.95);
  return { k, x: (cw - w * k) / 2, y: (ch - h * k) / 2 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function zoomAt(v: ViewState, cw: number, ch: number, px: number, py: number, factor: number): ViewState {
  const k = clamp(v.k * factor, 0.2, 4);
  const wx = (px - v.x) / v.k;
  const wy = (py - v.y) / v.k;
  return { k, x: px - wx * k, y: py - wy * k };
}

function zoomCenter(v: ViewState, cw: number, ch: number, factor: number): ViewState {
  return zoomAt(v, cw, ch, cw / 2, ch / 2, factor);
}

const EVIDENCE_NODE_ORDER: Partial<Record<NodeKind, number>> = {
  incident: 0,
  service: 1,
  deployment: 2,
  error: 3,
  metric: 4,
  database: 5,
  kubernetes: 6,
  infrastructure: 7,
  config: 8,
  hypothesis: 10,
  remediation: 11,
};

export function EvidenceGraph({ incident, evidence, hypotheses, plan }: EvidenceGraphProps) {
  const input = useMemo(
    () => ({ incident, evidence, hypotheses, plan }),
    [incident, evidence, hypotheses, plan],
  );
  const graph = useMemo(() => buildEvidenceGraph(input), [input]);
  const { positions, height: WORLD_H } = useMemo(() => layout(graph.nodes), [graph.nodes]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const [view, setView] = useState<ViewState>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; origin: ViewState } | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      setView(fitTransform(rect.width, rect.height, WORLD_W, WORLD_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [WORLD_H]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) =>
        zoomAt(v, rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const resetView = useCallback(
    () => setView(fitTransform(size.w, size.h, WORLD_W, WORLD_H)),
    [size, WORLD_H],
  );

  const canBuild = canBuildEvidenceGraph(input);
  const usedKinds = useMemo(
    () =>
      [...new Set(graph.nodes.map((n) => n.kind))].sort(
        (a, b) => (EVIDENCE_NODE_ORDER[a] ?? 9) - (EVIDENCE_NODE_ORDER[b] ?? 9),
      ),
    [graph.nodes],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, origin: { ...view } };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setView({
      ...dragRef.current.origin,
      x: dragRef.current.origin.x + (e.clientX - dragRef.current.sx),
      y: dragRef.current.origin.y + (e.clientY - dragRef.current.sy),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture already released
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-primary" aria-hidden />
            Evidence correlation graph
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Every node maps to collected evidence. Nothing is fabricated.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!canBuild ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed px-4 py-8">
            <p className="text-sm text-muted-foreground">
              Not enough evidence to build a reliable correlation graph.
            </p>
            <p className="text-sm font-medium">Collect more evidence</p>
          </div>
        ) : (
          <>
            <div
              ref={canvasRef}
              aria-label="Evidence correlation graph. Drag to pan, scroll to zoom. Select a node or relationship for details."
              className="relative h-[480px] w-full touch-none overflow-hidden rounded-lg border bg-card/40"
            >
              <div
                className="absolute inset-0 origin-top-left"
                style={{
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                  cursor: dragging ? "grabbing" : "grab",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <svg width={WORLD_W} height={WORLD_H} className="block" aria-hidden>
                  <defs>
                    <marker
                      id="graph-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  {graph.edges.map((edge) => {
                    const p1 = positions.get(edge.from);
                    const p2 = positions.get(edge.to);
                    if (!p1 || !p2) return null;
                    const source = nodeById.get(edge.from);
                    const color = KIND_COLOR[source?.kind ?? "metric"];
                    const isSelected = selected?.type === "edge" && selected.edge.id === edge.id;
                    return (
                      <path
                        key={edge.id}
                        d={edgeGeometry(p1, p2).d}
                        fill="none"
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeOpacity={isSelected ? 1 : 0.55}
                        markerEnd="url(#graph-arrow)"
                        style={{ color }}
                      />
                    );
                  })}
                </svg>

                {graph.edges.map((edge) => {
                  const p1 = positions.get(edge.from);
                  const p2 = positions.get(edge.to);
                  if (!p1 || !p2) return null;
                  const { mx, my } = edgeGeometry(p1, p2);
                  const source = nodeById.get(edge.from);
                  const color = KIND_COLOR[source?.kind ?? "metric"];
                  const isSelected = selected?.type === "edge" && selected.edge.id === edge.id;
                  return (
                    <button
                      key={edge.id}
                      type="button"
                      aria-label={`Relationship: ${nodeById.get(edge.from)?.label ?? edge.from} ${edge.label} ${nodeById.get(edge.to)?.label ?? edge.to}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setSelected({ type: "edge", edge })}
                      className={cn(
                        "absolute z-20 rounded-full border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground shadow-sm transition-colors hover:border-ring hover:text-foreground",
                        isSelected && "ring-2 ring-ring",
                      )}
                      style={{
                        left: mx,
                        top: my - 14,
                        transform: "translate(-50%, -50%)",
                        borderColor: isSelected ? color : undefined,
                        color: isSelected ? color : undefined,
                      }}
                    >
                      {edge.label}
                    </button>
                  );
                })}

                {graph.nodes.map((node) => {
                  const pos = positions.get(node.id);
                  if (!pos) return null;
                  const Icon = KIND_ICON[node.kind];
                  const isSelected = selected?.type === "node" && selected.node.id === node.id;
                  const pct = confidencePct(node.confidence);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      aria-pressed={isSelected}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setSelected({ type: "node", node })}
                      className={cn(
                        "absolute z-10 flex w-56 flex-col gap-1 rounded-lg border bg-card p-2 text-left shadow-md ring-1 ring-foreground/10 transition-shadow",
                        isSelected && "ring-2 ring-ring",
                        node.isLeadingHypothesis &&
                          "border-yellow-500/60 ring-yellow-500/30",
                      )}
                      style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
                    >
                      <span className="flex items-start gap-1.5 text-xs font-medium text-foreground">
                        <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: KIND_COLOR[node.kind] }} aria-hidden />
                        <span className="line-clamp-2 break-words">{node.label}</span>
                      </span>
                      {pct !== null && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {pct}% confidence
                        </span>
                      )}
                      {node.isLeadingHypothesis && (
                        <span className="inline-flex w-fit items-center rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
                          Most likely explanation
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="absolute right-2 top-2 z-30 flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setView((v) => zoomCenter(v, size.w, size.h, 1.3))}
                  aria-label="Zoom in"
                  className="size-8"
                >
                  <ZoomIn className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setView((v) => zoomCenter(v, size.w, size.h, 1 / 1.3))}
                  aria-label="Zoom out"
                  className="size-8"
                >
                  <ZoomOut className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={resetView}
                  aria-label="Reset view"
                  className="size-8"
                >
                  <Maximize2 className="size-4" aria-hidden />
                </Button>
              </div>

              <span className="absolute bottom-2 right-2 z-30 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {Math.round(view.k * 100)}%
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {usedKinds.map((kind) => (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: KIND_COLOR[kind] }}
                    aria-hidden
                  />
                  {NODE_KIND_LABEL[kind]}
                </span>
              ))}
            </div>

            <div className="min-h-[120px] rounded-lg border bg-muted/30 p-3 text-sm">
              {selected?.type === "node" ? (
                <NodeDetail
                  node={selected.node}
                  graph={graph}
                  onSelect={(node) => setSelected({ type: "node", node })}
                />
              ) : selected?.type === "edge" ? (
                <EdgeDetail edge={selected.edge} graph={graph} />
              ) : (
                <p className="text-muted-foreground">
                  Select a node or relationship to see why the agent believes it.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NodeDetail({
  node,
  graph,
  onSelect,
}: {
  node: GraphNode;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  onSelect: (node: GraphNode) => void;
}) {
  const pct = confidencePct(node.confidence);
  const related = relatedNodes(graph, node.id);
  const color = KIND_COLOR[node.kind];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          style={{ borderColor: `${color}55`, color, backgroundColor: `${color}11` }}
        >
          {NODE_KIND_LABEL[node.kind]}
        </Badge>
        <p className="font-medium">{node.label}</p>
        {node.isLeadingHypothesis && (
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
            Most likely explanation — not confirmed.
          </span>
        )}
      </div>
      <p className="text-muted-foreground">{node.detail}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{node.source ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Timestamp</dt>
          <dd className="tabular-nums">{formatDateTime(node.timestamp)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Relevance</dt>
          <dd>{node.relevance ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Confidence</dt>
          <dd className="tabular-nums">{pct !== null ? `${pct}%` : "—"}</dd>
        </div>
      </dl>
      {node.observation && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Observation: </span>
          {node.observation}
        </p>
      )}
      {related.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Related evidence
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {related.map(({ node: other, relationship }) => (
              <li key={`${other.id}-${relationship}`}>
                <button
                  type="button"
                  onClick={() => onSelect(other)}
                  className="flex items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: KIND_COLOR[other.kind] }}
                    aria-hidden
                  />
                  {other.label}
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    ({relationship})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EdgeDetail({
  edge,
  graph,
}: {
  edge: GraphEdge;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}) {
  const from = graph.nodes.find((n) => n.id === edge.from);
  const to = graph.nodes.find((n) => n.id === edge.to);
  const color = KIND_COLOR[from?.kind ?? "metric"];
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{from?.label ?? edge.from}</span>
        <Badge variant="outline" style={{ borderColor: `${color}55`, color }}>
          {edge.label}
        </Badge>
        <span className="font-medium">{to?.label ?? edge.to}</span>
      </p>
      <p className="text-muted-foreground">{edge.explanation}</p>
    </div>
  );
}
