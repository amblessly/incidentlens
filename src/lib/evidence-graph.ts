import { formatDuration } from "@/lib/format";
import type {
  EvidenceRow,
  HypothesisRow,
  PlanWithActions,
} from "@/lib/services/incidents";
import type { Incident } from "@/lib/types";

export type NodeKind =
  | "incident"
  | "service"
  | "deployment"
  | "error"
  | "metric"
  | "infrastructure"
  | "database"
  | "kubernetes"
  | "config"
  | "hypothesis"
  | "remediation";

export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  incident: "Incident",
  service: "Service",
  deployment: "Deployment",
  error: "Error",
  metric: "Metric",
  infrastructure: "Infrastructure Resource",
  database: "Database",
  kubernetes: "Kubernetes Workload",
  config: "Configuration Change",
  hypothesis: "Hypothesis",
  remediation: "Remediation",
};

/** Node kinds that are driven by raw evidence rows rather than derived objects. */
export const EVIDENCE_NODE_KINDS: NodeKind[] = [
  "deployment",
  "error",
  "metric",
  "infrastructure",
  "database",
  "kubernetes",
  "config",
];

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  detail: string;
  source: string | null;
  timestamp: string | null;
  observation: string | null;
  relevance: string | null;
  confidence: number | null;
  isLeadingHypothesis?: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  explanation: string;
}

export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EvidenceGraphInput {
  incident: Incident;
  evidence: EvidenceRow[];
  hypotheses: HypothesisRow[];
  plan: PlanWithActions | null;
}

export function canBuildEvidenceGraph(input: EvidenceGraphInput): boolean {
  return input.evidence.length > 0 || input.hypotheses.length > 0;
}

/**
 * Maps an evidence source to the closest graph node kind. Provider-agnostic —
 * falls back to "metric" for anything it cannot classify.
 */
export function classifyEvidenceKind(source: string): NodeKind {
  const s = source.toLowerCase();
  if (s.includes("deployment") || s.includes("release") || s.includes("ci/cd")) {
    return "deployment";
  }
  if (s.includes("kubernetes") || s.includes("workload") || s.includes("pod") || s.includes("crashloop")) {
    return "kubernetes";
  }
  if (s.includes("database") || s.includes("db") || s.includes("pool") || s.includes("connection")) {
    return "database";
  }
  if (s.includes("error") || s.includes("log") || s.includes("exception")) {
    return "error";
  }
  if (
    s.includes("infrastructure") ||
    s.includes("cloud") ||
    s.includes("node") ||
    s.includes("host")
  ) {
    return "infrastructure";
  }
  if (s.includes("config") || s.includes("change") || s.includes("pipeline")) {
    return "config";
  }
  return "metric";
}

function parseTitles(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function timeDeltaMs(after: string | null, before: string | null): number | null {
  if (!after || !before) return null;
  const a = new Date(after).getTime();
  const b = new Date(before).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a - b;
}

/**
 * Builds the correlation graph from investigation data.
 *
 * Every node and edge maps to real evidence — nothing is fabricated. The
 * leading hypothesis is flagged for highlighting, not asserted as fact.
 */
export function buildEvidenceGraph(input: EvidenceGraphInput): EvidenceGraph {
  const { incident, evidence, hypotheses, plan } = input;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push(
    {
      id: "incident",
      kind: "incident",
      label: incident.title,
      detail: incident.description,
      source: "Incident report",
      timestamp: incident.started_at,
      observation: incident.description,
      relevance: "primary",
      confidence: null,
    },
    {
      id: "service",
      kind: "service",
      label: incident.service,
      detail: `Affected service for ${incident.id}.`,
      source: "Incident report",
      timestamp: incident.started_at,
      observation: `Service reported as affected in ${incident.title}.`,
      relevance: "primary",
      confidence: null,
    },
  );

  edges.push({
    id: "incident-affects-service",
    from: "incident",
    to: "service",
    label: "affects",
    explanation: `${incident.title} affects ${incident.service}. Every correlated piece of evidence below belongs to this service.`,
  });

  const evidenceNodes: GraphNode[] = evidence.map((e) => ({
    id: `ev-${e.id}`,
    kind: classifyEvidenceKind(e.source),
    label: e.title,
    detail: e.observation,
    source: e.source,
    timestamp: e.timestamp,
    observation: e.observation,
    relevance: e.relevance,
    confidence: e.confidence,
  }));
  nodes.push(...evidenceNodes);

  for (const ev of evidenceNodes) {
    if (ev.kind === "deployment") {
      const delta = timeDeltaMs(incident.started_at, ev.timestamp);
      edges.push({
        id: `edge-deploy-${ev.id}`,
        from: ev.id,
        to: "incident",
        label: "preceded incident",
        explanation:
          delta !== null
            ? `This deployment occurred ${formatDuration(Math.abs(delta))} before the incident started (${incident.id}).`
            : `This deployment is correlated with the onset of ${incident.id}.`,
      });
    } else if (ev.kind === "database") {
      edges.push({
        id: `edge-db-${ev.id}`,
        from: ev.id,
        to: "service",
        label: "depends on",
        explanation: `${incident.service} depends on this database source. Pool exhaustion or degradation here directly impacts the service.`,
      });
    } else if (ev.kind === "kubernetes") {
      edges.push({
        id: `edge-k8s-${ev.id}`,
        from: ev.id,
        to: "service",
        label: "workload of",
        explanation: `This Kubernetes workload serves ${incident.service}. Restart or state anomalies surface as service symptoms.`,
      });
    } else {
      edges.push({
        id: `edge-ev-${ev.id}`,
        from: ev.id,
        to: "service",
        label: "observed in",
        explanation: `This observation was recorded against ${incident.service} during the incident window.`,
      });
    }
  }

  const hypothesisNodes: GraphNode[] = hypotheses.map((h) => ({
    id: `hyp-${h.id}`,
    kind: "hypothesis",
    label: h.title,
    detail: h.description,
    source: "Investigation analysis",
    timestamp: h.created_at,
    observation: h.description,
    relevance: null,
    confidence: h.confidence,
    isLeadingHypothesis: h.is_selected === 1,
  }));
  nodes.push(...hypothesisNodes);

  for (const ev of evidenceNodes) {
    for (const h of hypotheses) {
      const refs = parseTitles(h.supporting_evidence);
      const supports = refs.some((ref) => {
        if (/^\d+$/.test(ref)) {
          return String(ev.id.slice(3)) === ref;
        }
        return ref === ev.label;
      });
      if (supports) {
        edges.push({
          id: `edge-supports-${ev.id}-hyp-${h.id}`,
          from: ev.id,
          to: `hyp-${h.id}`,
          label: "supports",
          explanation: `This evidence is referenced as supporting evidence for the hypothesis "${h.title}".`,
        });
      }
    }
  }

  if (plan) {
    nodes.push({
      id: "remediation",
      kind: "remediation",
      label: "Remediation plan",
      detail: plan.summary,
      source: "Remediation planner",
      timestamp: plan.created_at,
      observation: plan.summary,
      relevance: null,
      confidence: null,
    });
    const leading = hypothesisNodes.find((h) => h.isLeadingHypothesis) ?? hypothesisNodes[0];
    if (leading) {
      edges.push({
        id: "edge-remediation",
        from: leading.id,
        to: "remediation",
        label: "recommends",
        explanation: `The remediation plan was generated from this investigation, guided by "${leading.label}".`,
      });
    }
  }

  return { nodes, edges };
}

/** Connected neighbors of a node, for the detail panel. */
export function relatedNodes(
  graph: EvidenceGraph,
  nodeId: string,
): { node: GraphNode; relationship: string }[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const related: { node: GraphNode; relationship: string }[] = [];
  for (const edge of graph.edges) {
    if (edge.from === nodeId) {
      const other = byId.get(edge.to);
      if (other) related.push({ node: other, relationship: edge.label });
    } else if (edge.to === nodeId) {
      const other = byId.get(edge.from);
      if (other) related.push({ node: other, relationship: edge.label });
    }
  }
  return related;
}

export function confidencePct(confidence: number | null): number | null {
  if (confidence === null) return null;
  return Math.round(confidence * 100);
}
