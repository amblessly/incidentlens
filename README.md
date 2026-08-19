# IncidentLens

**Evidence-driven AI incident investigation** — not an incident chatbot.

IncidentLens investigates incidents by querying real infrastructure through [Clanker Cloud MCP](https://github.com/bgdnvk/clanker), correlates operational evidence into a graph, generates ranked root-cause hypotheses, and prepares **human-approved remediation plans** with risk, blast radius and rollback for every action.

> **DevKada × Clanker Cloud Hackathon** — Marketplace Agent Track

## The core workflow

```
Incident → Clanker Agent → Real Infrastructure → Evidence Graph → Root Cause → Remediation Plan → Human Approval
```

## How Clanker Cloud Is Integrated

IncidentLens connects to Clanker via its **MCP (Model Context Protocol) HTTP server**:

```
IncidentLens
     │
     │ MCP HTTP (JSON-RPC 2.0)
     ▼
Clanker CLI (localhost:39393)
     │
     ├── AWS
     ├── GCP
     ├── Azure
     ├── Kubernetes
     ├── Vercel
     ├── Cloudflare
     ├── Railway
     └── etc.
```

Clanker provides **infrastructure intelligence** — natural-language queries against real cloud environments. IncidentLens turns that intelligence into an evidence-driven incident investigation workflow with human-controlled remediation.

### Clanker MCP Tools Used

| Tool | Purpose in IncidentLens |
| --- | --- |
| `clanker_ask` | Natural-language infrastructure queries (service health, metrics, logs) |
| `clanker_k8s_ask_cluster` | Kubernetes cluster investigation |
| `clanker_k8s_logs` | Pod log collection and analysis |
| `clanker_run_command` | Direct CLI execution for inventory/cost queries |

## Provider Architecture

IncidentLens is **provider-agnostic**. The investigation engine depends only on the `InfrastructureProvider` interface:

```
                         IncidentLens
                              │
                   ┌──────────┴──────────┐
                   │ Investigation Engine │
                   └──────────┬──────────┘
                              │
                       Provider Interface
                              │
            ┌─────────┬───────┼────────┬─────────┐
            ↓         ↓       ↓        ↓         ↓
          Mock    Clanker   Generic  Datadog    AWS
        Adapter   (MCP)      API    Adapter  Adapter
```

| Provider | Type | Description |
| --- | --- | --- |
| **MockInfrastructureProvider** | `mock` | Deterministic fixtures for demo/screenshots |
| **ClankerMCPProvider** | `clanker` | Local Clanker CLI via MCP HTTP — real infrastructure queries |
| **ClankerProvider** | `clanker` | Clanker Cloud Sandbox API — production deployments |
| **GenericApiProvider** | `generic` | Any REST/GraphQL endpoint with evidence transforms |

## Investigation Phases

1. **Collecting Evidence** — query the provider for services, health, deployments, logs, metrics, database state, and recent changes
2. **Checking Changes** — inspect recent deployments, config changes, and pipeline runs
3. **Correlating Evidence** — build evidence relationships (causes, confirms, reflects, contradicts)
4. **Evaluating Hypotheses** — score root causes against evidence (supporting + contradicting)
5. **Preparing Remediation** — generate actions with risk, blast radius, rollback strategy, and human approval requirement

## Demo Scenario

The seeded demo tells a real DevOps story:

```
Production API 5xx spike
       │
       ▼
Clanker investigates:
  ✓ Services → api-production CRITICAL
  ✓ Deployments → DEP-9081 (10 min ago)
  ✓ Logs → "connection pool exhausted"
  ✓ Metrics → error rate 18%, p95 latency 4200ms
  ✓ Database → 98/100 connections, 4800ms replication lag
       │
       ▼
Evidence Graph:
  Deployment DEP-9081
       ↓ causes
  DB Connection Pool Exhaustion
       ↓ causes
  API Request Timeouts
       ↓ results in
  5xx Error Spike
       │
       ▼
Hypothesis (92% confidence):
  "Recent deployment introduced unbounded DB queries
   causing connection pool exhaustion"
       │
       ▼
Remediation Plan:
  1. Roll back DEP-9081 to v3.4.0 (medium risk)
  2. Monitor DB connection pool recovery (low risk)
  3. Optimize JOIN queries before re-deploying (low risk)
       │
       ▼
[Human Approval Required] → Execute
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local (demo mode works out of the box)

# Run development server
npm run dev
```

### PostgreSQL Setup (Neon)

The project uses PostgreSQL for persistent storage. Tables are created via migration:

```bash
# Run migration
DATABASE_URL="postgresql://..." npx tsx scripts/migrate-pg.ts

# Seed demo data
DATABASE_URL="postgresql://..." npx tsx scripts/seed-pg.ts
```

### Live Clanker Integration

To connect to real infrastructure:

```bash
# 1. Install and configure Clanker
brew install clanker
clanker config init
clanker onboarding scan --provider aws,gcp,azure,kubernetes

# 2. Start MCP server
clanker mcp --transport http --listen 127.0.0.1:39393

# 3. Update .env.local
INCIDENTLENS_MODE=live
CLANKER_MCP_URL=http://127.0.0.1:39393
```

## Architecture

```
IncidentLens
├── Investigation Engine        ← core logic (no provider imports)
├── Providers
│   ├── ClankerMCPProvider      ← MCP HTTP → Clanker CLI → Cloud
│   ├── ClankerProvider         ← Clanker Cloud Sandbox API
│   ├── GenericApiProvider      ← REST/GraphQL endpoints
│   └── MockProvider            ← demo fixtures
├── Evidence Graph              ← correlated evidence relationships
├── Hypothesis Engine           ← scoring + confidence ranking
├── Remediation Plans           ← risk/blast radius/rollback
├── Human Approval              ← fingerprint-verified approvals
└── Execution Boundary          ← read-only vs approved changes
```

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Database**: PostgreSQL (Neon) + SQLite (local dev)
- **AI Integration**: Clanker Cloud MCP + OpenAI
- **UI**: Tailwind CSS + shadcn/ui + Recharts
- **Validation**: Zod
- **Testing**: Vitest

## Key Files

| Path | Purpose |
| --- | --- |
| `src/lib/investigation/engine.ts` | Evidence-driven investigation engine |
| `src/lib/providers/adapters/clanker/mcp-provider.ts` | Clanker MCP integration |
| `src/lib/providers/adapters/clanker/mcp-client.ts` | MCP HTTP client |
| `src/lib/providers/adapters/mock/mock-provider.ts` | Demo fixtures (deployment → DB → 5xx story) |
| `src/lib/providers/registry.ts` | Provider registration and resolution |
| `src/app/api/incidents/[id]/investigation/route.ts` | Investigation API endpoint |
| `src/components/investigation/evidence-graph.tsx` | Evidence graph visualization |
| `scripts/migrate-pg.ts` | PostgreSQL migration |
| `scripts/seed-pg.ts` | Demo data seeder |

## License

MIT
