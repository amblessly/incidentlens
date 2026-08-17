import type {
  EvidenceRelevance,
  EventType,
  IncidentStatus,
  RiskLevel,
  Severity,
} from "@/lib/types";

export interface ScenarioEvent {
  type: EventType;
  title: string;
  description?: string;
  /** minutes ago, relative to seed time */
  atAgo: number;
}

export interface ScenarioEvidence {
  source: string;
  title: string;
  observation: string;
  relevance: EvidenceRelevance;
  confidence: number;
  atAgo: number;
  data?: Record<string, unknown>;
}

export interface ScenarioHypothesis {
  title: string;
  description: string;
  confidence: number;
  evidenceTitles: string[];
  contradictingTitles?: string[];
  missingEvidence?: string[];
  nextStep?: string;
}

export interface ScenarioAction {
  description: string;
  expectedImpact: string;
  risk: RiskLevel;
  rollback: string;
  resources: string[];
  reason: string;
  evidenceTitles: string[];
  approvalRequired: boolean;
  blastRadius: string;
  prerequisites: string[];
}

export interface DemoScenario {
  incident: {
    id: string;
    title: string;
    service: string;
    severity: Severity;
    status: IncidentStatus;
    description: string;
    startedAgo: number;
    resolvedAgo: number | null;
    deploymentId: string | null;
    repository: string | null;
    alertPayload: Record<string, unknown> | null;
  };
  events: ScenarioEvent[];
  evidence: ScenarioEvidence[];
  hypotheses: ScenarioHypothesis[];
  plan: {
    summary: string;
    planStatus: "pending_approval" | "approved" | "executed" | "rejected";
    approvedAgo?: number;
    actions: ScenarioAction[];
  } | null;
  deployment: {
    id: string;
    service: string;
    version: string;
    commit: string;
    author: string;
    deployedAgo: number;
  };
}

export function buildScenarios(now: Date): DemoScenario[] {
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  return [
    {
      incident: {
        id: "INC-0142",
        title: "Production API — 5xx spike",
        service: "api-production",
        severity: "SEV-2",
        status: "awaiting_approval",
        description:
          "5xx responses rose from 1.2% to 12% starting at 14:04, two minutes after deployment v2.8.0. Database connection usage increased at 14:06 while the database itself remained healthy.",
        startedAgo: 3 * 60 + 28,
        resolvedAgo: null,
        deploymentId: "DEP-9081",
        repository: "acme-shop/api-gateway",
        alertPayload: {
          alert: "error-rate-threshold",
          service: "api-production",
          threshold: 5,
          value: 12,
          window: "5m",
          firedAt: ago(205),
        },
      },
      deployment: {
        id: "DEP-9081",
        service: "api-production",
        version: "v2.8.0",
        commit: "5f3c9a1",
        author: "Jordan Reyes",
        deployedAgo: 210,
      },
      events: [
        { type: "alert_received", title: "Alert received", description: "Error rate 12% exceeding 5% threshold for 5m window.", atAgo: 205 },
        { type: "incident_created", title: "Incident created", description: "Created by Ava Chen from alert 'error-rate-threshold'.", atAgo: 204 },
        { type: "investigation_started", title: "Investigation started", description: "Clanker Investigator assigned.", atAgo: 204 },
        { type: "infrastructure_queried", title: "Service health checked", description: "api-production unhealthy: 5xx elevated across all nodes.", atAgo: 202 },
        { type: "deployment_discovered", title: "Deployment discovered", description: "DEP-9081 v2.8.0 deployed at 14:02, 2 minutes before the error onset.", atAgo: 201 },
        { type: "logs_inspected", title: "Error logs inspected", description: "Repeated 'UnhandledParseError: invalid request body' in api-gateway pods.", atAgo: 200 },
        { type: "infrastructure_queried", title: "Database health checked", description: "Connection usage rising at 14:06 but database itself healthy.", atAgo: 199 },
        { type: "evidence_correlated", title: "Evidence correlated", description: "Deployment → application error → DB connection increase → 5xx spike.", atAgo: 197 },
        { type: "hypothesis_generated", title: "Root cause hypothesis generated", description: "Likely regression in deployment v2.8.0 with 92% confidence.", atAgo: 195 },
        { type: "remediation_proposed", title: "Remediation plan proposed", description: "Roll back to v2.7.4 recommended pending human approval.", atAgo: 190 },
        { type: "approval_requested", title: "Human approval requested", description: "Plan awaiting approval from on-call engineer.", atAgo: 190 },
      ],
      evidence: [
        {
          source: "Metrics",
          title: "Error rate spike",
          observation: "5xx rate rose from 1.2% to 12% between 14:04 and 14:05, immediately after deployment DEP-9081.",
          relevance: "primary",
          confidence: 0.96,
          atAgo: 207,
          data: { baseline: 1.2, peak: 12, window: "5m" },
        },
        {
          source: "Recent deployment",
          title: "v2.8.0 rollout to api-production",
          observation: "DEP-9081 (v2.8.0, commit 5f3c9a1) deployed at 14:02. First error onset at 14:04 — exactly 2 minutes later.",
          relevance: "primary",
          confidence: 0.99,
          atAgo: 210,
          data: { version: "v2.8.0", commit: "5f3c9a1", author: "Jordan Reyes" },
        },
        {
          source: "Application error logs",
          title: "UnhandledParseError in api-gateway",
          observation: "Pods reporting 'UnhandledParseError: invalid request body' — introduced by the v2.8.0 request-parsing change.",
          relevance: "primary",
          confidence: 0.9,
          atAgo: 200,
        },
        {
          source: "Database health",
          title: "Database connection usage increase",
          observation: "Connection count rose at 14:06 alongside the error spike, but the pool was never exhausted.",
          relevance: "supporting",
          confidence: 0.85,
          atAgo: 206,
          data: { poolUsagePct: 62, trend: "rising" },
        },
        {
          source: "Database health",
          title: "Database itself healthy",
          observation: "No errors, no saturation, no lock contention on db-primary. Rules out database as root cause.",
          relevance: "context",
          confidence: 0.94,
          atAgo: 199,
        },
        {
          source: "Cloud infrastructure state",
          title: "Infrastructure healthy",
          observation: "Node CPU/memory normal, no scaling events, network healthy. Rules out infra-level fault.",
          relevance: "context",
          confidence: 0.94,
          atAgo: 202,
        },
        {
          source: "CI/CD pipeline",
          title: "Previous version baseline",
          observation: "v2.7.4 ran 9 days with average error rate 1.2%; no change except the v2.8.0 rollout.",
          relevance: "supporting",
          confidence: 0.95,
          atAgo: 198,
        },
      ],
      hypotheses: [
        {
          title: "Regression introduced in deployment v2.8.0",
          description:
            "v2.8.0 introduced a request-parsing change that throws on valid-but-unusual request bodies, spiking 5xx across the fleet. The error onset exactly 2 minutes after rollout and the new log signature make this the most likely cause.",
          confidence: 0.92,
          evidenceTitles: ["v2.8.0 rollout to api-production", "Error rate spike", "UnhandledParseError in api-gateway", "Previous version baseline", "Infrastructure healthy"],
          contradictingTitles: ["Database connection usage increase"],
          missingEvidence: ["Error-rate rollup broken down by deployment version", "Trace sampling for the affected endpoints"],
          nextStep: "Inspect the v2.8.0 request-parsing path around the deployment timestamp.",
        },
        {
          title: "Transient upstream provider degradation",
          description:
            "CDN or upstream provider degrading caused 5xx without application involvement. Weak: infra health unchanged and logs are application-level.",
          confidence: 0.28,
          evidenceTitles: ["Error rate spike"],
          contradictingTitles: ["UnhandledParseError in api-gateway"],
          missingEvidence: ["Upstream provider status for the incident window"],
          nextStep: "Check CDN/edge status and retry rates for the window.",
        },
        {
          title: "Database saturation",
          description:
            "Connection pressure caused request failures. Weak: the pool was never exhausted and db-primary showed no errors.",
          confidence: 0.18,
          evidenceTitles: ["Database connection usage increase"],
          contradictingTitles: ["Database itself healthy", "UnhandledParseError in api-gateway"],
          missingEvidence: ["Connection pool metric history before 14:04"],
          nextStep: "Pull connection-pool metrics for the 10 minutes before the incident.",
        },
      ],
      plan: {
        summary:
          "Roll back api-production from v2.8.0 to v2.7.4, verify the error rate and service health return to baseline, then resolve the incident or escalate if it does not.",
        planStatus: "pending_approval",
        actions: [
          {
            description: "Verify current service health signals and record the 14:04 baseline.",
            expectedImpact: "Establishes the starting point for the rollback.",
            risk: "low",
            rollback: "Not applicable — observation only.",
            resources: ["metrics/error-rate", "metrics/latency", "service/api-production"],
            reason: "Confirms the incident is ongoing before touching anything.",
            evidenceTitles: ["Error rate spike"],
            approvalRequired: false,
            blastRadius: "None — read-only diagnostics.",
            prerequisites: ["Read access to metrics dashboards"],
          },
          {
            description: "Confirm previous stable revision v2.7.4 is available in the registry.",
            expectedImpact: "Guarantees the rollback target is deployable.",
            risk: "low",
            rollback: "Not applicable — read-only check.",
            resources: ["registry/api-gateway"],
            reason: "A rollback is only safe if the target image exists.",
            evidenceTitles: ["Previous version baseline"],
            approvalRequired: false,
            blastRadius: "None — read-only check.",
            prerequisites: ["Registry read access"],
          },
          {
            description: "Prepare the rollback runbook and stage v2.7.4 for deployment.",
            expectedImpact: "Makes the rollback a one-click, verified action.",
            risk: "medium",
            rollback: "Abort preparation; no change has been applied yet.",
            resources: ["deployment/api-production"],
            reason: "Pre-validated rollback reduces blast radius.",
            evidenceTitles: ["v2.8.0 rollout to api-production"],
            approvalRequired: false,
            blastRadius: "None until executed.",
            prerequisites: ["Deploy permissions for production"],
          },
          {
            description: "Roll back api-production image to v2.7.4.",
            expectedImpact: "Error rate returns to ~1.2% within minutes; checkout failures stop.",
            risk: "high",
            rollback: "Re-deploy v2.8.0 if the regression is not the cause.",
            resources: ["deployment/api-production"],
            reason: "v2.8.0 is the only variable correlated with the spike.",
            evidenceTitles: ["v2.8.0 rollout to api-production", "Error rate spike"],
            approvalRequired: true,
            blastRadius: "All api-production traffic (~60% of checkout requests).",
            prerequisites: ["Approved remediation plan", "v2.7.4 image confirmed in registry"],
          },
          {
            description: "Check the error rate returns to ~1.2% over the next 15 minutes.",
            expectedImpact: "Confirms the rollback resolved the incident.",
            risk: "low",
            rollback: "Not applicable — observation only.",
            resources: ["metrics/error-rate"],
            reason: "Validates the root-cause hypothesis under load.",
            evidenceTitles: ["Error rate spike"],
            approvalRequired: false,
            blastRadius: "None — read-only diagnostics.",
            prerequisites: ["Read access to metrics dashboards"],
          },
          {
            description: "Check service health returns to baseline.",
            expectedImpact: "Confirms api-production is serving normally.",
            risk: "low",
            rollback: "Not applicable — observation only.",
            resources: ["service/api-production"],
            reason: "Error rate alone does not prove service recovery.",
            evidenceTitles: ["Infrastructure healthy"],
            approvalRequired: false,
            blastRadius: "None — read-only diagnostics.",
            prerequisites: ["Read access to service health"],
          },
          {
            description: "Resolve the incident, or escalate if health does not improve.",
            expectedImpact: "Closes the incident cleanly or escalates with evidence.",
            risk: "low",
            rollback: "Not applicable — decision step.",
            resources: ["incident/INC-0142"],
            reason: "Incidents must end in a clear resolved or escalated state.",
            evidenceTitles: ["Error rate spike", "UnhandledParseError in api-gateway"],
            approvalRequired: false,
            blastRadius: "None — process step.",
            prerequisites: ["15 minutes of stable metrics post-rollback"],
          },
        ],
      },
    },

    {
      incident: {
        id: "INC-0153",
        title: "Payments service pods crash looping",
        service: "payments-service",
        severity: "SEV-1",
        status: "open",
        description:
          "Payments service pods are CrashLoopBackOff. Checkout transactions intermittently fail with connection reset.",
        startedAgo: 18,
        resolvedAgo: null,
        deploymentId: "DEP-9092",
        repository: "acme-shop/payments",
        alertPayload: {
          alert: "crashloop",
          service: "payments-service",
          namespace: "production",
          pods: 8,
          firedAt: ago(17),
        },
      },
      deployment: {
        id: "DEP-9092",
        service: "payments-service",
        version: "v1.9.0",
        commit: "4f1b0c8",
        author: "Maya Patel",
        deployedAgo: 55,
      },
      events: [
        { type: "incident_created", title: "Incident created", description: "Created by Ava Chen from alert 'crashloop'.", atAgo: 18 },
        { type: "alert_received", title: "Alert received", description: "payments-service pods restarting continuously, 8 pods affected.", atAgo: 17 },
      ],
      evidence: [
        {
          source: "Kubernetes workload state",
          title: "CrashLoopBackOff across 8 pods",
          observation: "All replicas restarting every ~40s. Restart counts climbing rapidly.",
          relevance: "primary",
          confidence: 0.98,
          atAgo: 17,
          data: { namespace: "production", replicas: 8, restarts: 240 },
        },
        {
          source: "Kubernetes workload state",
          title: "OOMKilled events",
          observation: "Last terminated reason is OOMKilled; memory usage exceeded the 512Mi limit.",
          relevance: "primary",
          confidence: 0.95,
          atAgo: 16,
        },
        {
          source: "Recent deployment",
          title: "v1.9.0 rollout",
          observation: "DEP-9092 (v1.9.0) deployed 37 minutes before first pod restart. No prior crash loops.",
          relevance: "supporting",
          confidence: 0.9,
          atAgo: 15,
          data: { version: "v1.9.0", commit: "4f1b0c8", author: "Maya Patel" },
        },
        {
          source: "Database health",
          title: "db-primary healthy",
          observation: "No connection pool exhaustion on db-primary; payments DB idle connections normal.",
          relevance: "context",
          confidence: 0.93,
          atAgo: 16,
        },
      ],
      hypotheses: [
        {
          title: "Memory leak introduced in v1.9.0",
          description:
            "v1.9.0 added an in-memory retry buffer that grows unboundedly per request, exhausting the pod memory limit and triggering OOM kills.",
          confidence: 0.72,
          evidenceTitles: ["OOMKilled events", "CrashLoopBackOff across 8 pods", "v1.9.0 rollout"],
          contradictingTitles: ["Node resource metrics were within norms before the crash"],
          missingEvidence: ["Heap-dump or memory profile from a crashed pod"],
          nextStep: "Collect a memory profile from a crashing pod before it is evicted.",
        },
        {
          title: "Missing memory limits on new resource template",
          description:
            "A new resource template without limits allowed runaway memory. Weak: pods were killed by the existing 512Mi limit.",
          confidence: 0.18,
          evidenceTitles: ["OOMKilled events"],
          missingEvidence: ["Resource template diff for the v1.9.0 rollout"],
          nextStep: "Diff the resource template deployed with v1.9.0.",
        },
      ],
      plan: null,
    },

    {
      incident: {
        id: "INC-0161",
        title: "Database connection pool saturation",
        service: "db-primary",
        severity: "SEV-2",
        status: "resolved",
        description:
          "db-primary reached 100% of its connection limit. API queries blocked, checkout latency spiked to 40s.",
        startedAgo: 26 * 60 + 40,
        resolvedAgo: 25 * 60 + 30,
        deploymentId: "DEP-9074",
        repository: "acme-shop/search-service",
        alertPayload: {
          alert: "connection-pool-exhausted",
          service: "db-primary",
          maxConnections: 100,
          firedAt: ago(26 * 60 + 38),
        },
      },
      deployment: {
        id: "DEP-9074",
        service: "search-service",
        version: "v3.2.1",
        commit: "9d1a7f3",
        author: "Jordan Reyes",
        deployedAgo: 27 * 60 + 5,
      },
      events: [
        { type: "incident_created", title: "Incident created", description: "Created by Jordan Reyes from alert 'connection-pool-exhausted'.", atAgo: 26 * 60 + 40 },
        { type: "alert_received", title: "Alert received", description: "db-primary at 100/100 connections for 3 minutes.", atAgo: 26 * 60 + 38 },
        { type: "investigation_started", title: "Investigation started", description: "Clanker Investigator assigned.", atAgo: 26 * 60 + 36 },
        { type: "infrastructure_queried", title: "Database health checked", description: "pg_stat_activity shows 74 idle-in-transaction connections from search-service.", atAgo: 26 * 60 + 33 },
        { type: "deployment_discovered", title: "Deployment discovered", description: "search-service v3.2.1 deployed 2 minutes before saturation began.", atAgo: 26 * 60 + 30 },
        { type: "logs_inspected", title: "Search service logs inspected", description: "Pool size configured to 60 but workload opens one connection per document index batch.", atAgo: 26 * 60 + 27 },
        { type: "evidence_correlated", title: "Evidence correlated", description: "Connection growth curve matches search-service indexing throughput.", atAgo: 26 * 60 + 24 },
        { type: "hypothesis_generated", title: "Root cause hypothesis generated", description: "Connection leak in search-service v3.2.1 with 91% confidence.", atAgo: 26 * 60 + 22 },
        { type: "remediation_proposed", title: "Remediation plan proposed", description: "Scale down search index workers, then apply fix.", atAgo: 26 * 60 + 18 },
        { type: "approval_requested", title: "Human approval requested", description: "Plan awaiting approval.", atAgo: 26 * 60 + 18 },
        { type: "approval_granted", title: "Approval granted", description: "Plan approved by Ava Chen.", atAgo: 26 * 60 + 12 },
        { type: "remediation_executed", title: "Remediation executed", description: "Index workers scaled down; pool dropped to 34% within 10 minutes.", atAgo: 26 * 60 + 2 },
        { type: "incident_resolved", title: "Incident resolved", description: "Connection usage back to baseline, latency normal.", atAgo: 25 * 60 + 30 },
      ],
      evidence: [
        {
          source: "Database health",
          title: "Connection pool exhausted",
          observation: "db-primary at 100/100 connections; 74 idle-in-transaction from search-service.",
          relevance: "primary",
          confidence: 0.98,
          atAgo: 26 * 60 + 33,
          data: { maxConnections: 100, used: 100, idleInTransaction: 74 },
        },
        {
          source: "Recent deployment",
          title: "search-service v3.2.1 rollout",
          observation: "DEP-9074 deployed 2 minutes before saturation. Indexing code path changed in the same release.",
          relevance: "primary",
          confidence: 0.9,
          atAgo: 26 * 60 + 30,
          data: { version: "v3.2.1", commit: "9d1a7f3", author: "Jordan Reyes" },
        },
        {
          source: "Application error logs",
          title: "Blocked query timeouts",
          observation: "Application queries timing out after 30s waiting for a pooled connection.",
          relevance: "supporting",
          confidence: 0.85,
          atAgo: 26 * 60 + 27,
        },
        {
          source: "Cloud infrastructure state",
          title: "Compute healthy",
          observation: "DB node CPU/memory normal; saturation is connection-bound, not resource-bound.",
          relevance: "context",
          confidence: 0.92,
          atAgo: 26 * 60 + 28,
        },
      ],
      hypotheses: [
        {
          title: "Connection leak in the reindex worker",
          description:
            "The reindex worker opens a new connection per batch without releasing it, exhausting the shared db-primary pool.",
          confidence: 0.91,
          evidenceTitles: ["Connection pool exhausted", "search-service v3.2.1 rollout", "Blocked query timeouts"],
          contradictingTitles: ["db-primary node health stayed green during the window"],
          missingEvidence: ["Connection count per worker over the window"],
          nextStep: "Correlate pool occupancy with worker batch counts.",
        },
        {
          title: "Pool size misconfiguration",
          description:
            "Connection limit was reduced at the same time. Weak: limit unchanged and growth tracks index batch count.",
          confidence: 0.22,
          evidenceTitles: ["Connection pool exhausted"],
          missingEvidence: ["Config history for db-primary max_connections"],
          nextStep: "Check configuration history for the pool limit.",
        },
      ],
      plan: {
        summary:
          "Reduce search indexing parallelism to free pooled connections, then apply the connection-release fix and restore parallelism.",
        planStatus: "executed",
        approvedAgo: 26 * 60 + 12,
        actions: [
          {
            description: "Scale search index workers from 20 to 4.",
            expectedImpact: "Pool usage drops below 50% within 10 minutes; blocked queries clear.",
            risk: "medium",
            rollback: "Scale workers back to 20.",
            resources: ["deployment/search-index-worker"],
            reason: "Immediately relieves pool pressure while a code fix is prepared.",
            evidenceTitles: ["Connection pool exhausted"],
            approvalRequired: true,
            blastRadius: "Search indexing throughput only — queries stay online.",
            prerequisites: ["Deploy permissions for search-index-worker"],
          },
          {
            description: "Deploy search-service v3.2.2 with connection-release fix.",
            expectedImpact: "Prevents the leak at the source; idle-in-transaction connections return to 0.",
            risk: "low",
            rollback: "Revert to v3.2.1 (with reduced workers).",
            resources: ["deployment/search-service"],
            reason: "Fixes root cause identified in the correlation step.",
            evidenceTitles: ["search-service v3.2.1 rollout"],
            approvalRequired: true,
            blastRadius: "All search-service traffic briefly during rollout.",
            prerequisites: ["v3.2.2 image built and tagged", "CI pipeline green"],
          },
          {
            description: "Restore index worker count to 20 after 30 minutes of stable pool usage.",
            expectedImpact: "Full indexing throughput restored.",
            risk: "low",
            rollback: "Scale back down if pool pressure returns.",
            resources: ["deployment/search-index-worker"],
            reason: "Restores capacity after verifying the fix.",
            evidenceTitles: [],
            approvalRequired: false,
            blastRadius: "Search indexing throughput only.",
            prerequisites: ["30 minutes of pool usage below 60%"],
          },
        ],
      },
    },

    {
      incident: {
        id: "INC-0168",
        title: "Search results latency spike",
        service: "search-service",
        severity: "SEV-3",
        status: "open",
        description:
          "p95 search latency increased from 220ms to 1.1s. No errors, no outage. Suspected during reindex window.",
        startedAgo: 42,
        resolvedAgo: null,
        deploymentId: null,
        repository: "acme-shop/search-service",
        alertPayload: null,
      },
      deployment: {
        id: "DEP-9999",
        service: "search-service",
        version: "v3.2.1",
        commit: "9d1a7f3",
        author: "Jordan Reyes",
        deployedAgo: 60 * 26,
      },
      events: [
        { type: "incident_created", title: "Incident created", description: "Created manually by Ava Chen.", atAgo: 42 },
      ],
      evidence: [],
      hypotheses: [],
      plan: null,
    },

    {
      incident: {
        id: "INC-0171",
        title: "Login page favicon 404 on Safari",
        service: "web-frontend",
        severity: "SEV-4",
        status: "resolved",
        description:
          "Favicon returned 404 in Safari after asset pipeline update. Cosmetic only; no auth impact.",
        startedAgo: 40 * 60 + 15,
        resolvedAgo: 39 * 60 + 40,
        deploymentId: null,
        repository: "acme-shop/web",
        alertPayload: null,
      },
      deployment: {
        id: "DEP-9998",
        service: "web-frontend",
        version: "v5.1.0",
        commit: "8aa22d1",
        author: "Maya Patel",
        deployedAgo: 41 * 60,
      },
      events: [
        { type: "incident_created", title: "Incident created", description: "Created by Jordan Reyes.", atAgo: 40 * 60 + 15 },
        { type: "note", title: "Manual investigation", description: "Confirmed asset hash mismatch; fix deployed within 30 minutes.", atAgo: 39 * 60 + 55 },
        { type: "remediation_executed", title: "Remediation executed", description: "Re-ran asset pipeline and purged CDN cache.", atAgo: 39 * 60 + 45 },
        { type: "incident_resolved", title: "Incident resolved", description: "Favicon served correctly.", atAgo: 39 * 60 + 40 },
      ],
      evidence: [],
      hypotheses: [],
      plan: null,
    },
  ];
}
