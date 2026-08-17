# IncidentLens

**Evidence-driven AI incident investigation** — not an incident chatbot.

IncidentLens is an AI incident investigation agent that uses Clanker to inspect infrastructure context, correlate operational evidence, generate ranked root-cause hypotheses, and prepare **human-approved remediation plans**. It never blindly modifies production infrastructure.

## The core workflow

```
Investigation → Evidence → Root cause → Plan → Human approval → Execution boundary
```

Everything is separated: the agent investigates read-only, evidence is correlated into a graph, remediation is proposed with risk/blast-radius/rollback for every action, and nothing executes without an explicit human approval that is verified against a plan fingerprint at execution time.

## Demo flow (2–3 minutes)

1. **Create an incident** — e.g. "Production API — 5xx spike" — and start the investigation.
2. **Agent investigates** with Clanker as the infrastructure intelligence layer (service health, deployments, error logs, database state, correlation).
3. **Evidence graph** — the centerpiece. Every node maps to real collected evidence: deployment → error spike → API failures → DB connection pressure. Click a node or relationship to see source, timestamp, observation, relevance, confidence and related evidence.
4. **Remediation plan** — each action shows proposed change, why, evidence, expected impact, risk, blast radius, rollback strategy and approval requirement. The plan preview is shown as a terminal-style checklist.
5. **Approval** — "Review required before infrastructure changes." Approving is not executing: a separate execution boundary requires a valid, non-expired approval, an unchanged plan hash, and an explicit user action.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first run the app seeds demo incidents, including the `INC-0142` "Production API — 5xx spike" walkthrough. The app ships in **demo mode** by default — the investigation agent runs against a built-in simulated Clanker environment with no credentials required.

### Live Clanker setup

```bash
# 1. Install the Clanker CLI and verify your environment
clanker onboarding scan

# 2. Verify you can query infrastructure
clanker ask "what services and resources are currently running?"

# 3. Point IncidentLens at Clanker Cloud
cp .env.example .env
# Set CLANKER_MODE=live and fill in CLANKER_API_URL / CLANKER_API_KEY / CLANKER_AGENT_ID
```

Credentials live only in the Clanker/server environment. They are **never** placed in `Next.js` server-side env used by the browser, never logged, and never committed.

## Project structure

Next.js App Router (under `src/`):

```
src/
├── app/
│   ├── dashboard/
│   ├── incidents/
│   │   ├── new/
│   │   └── [id]/
│   │       ├── investigation/
│   │       └── plan/
│   └── settings/
├── components/
│   ├── incidents/
│   ├── investigation/        # agent panel, evidence list, hypotheses, evidence graph
│   ├── plan/                 # remediation review (approval/execution UI)
│   └── ui/
├── lib/
│   ├── clanker/              # client, investigation agent, prompts, types
│   ├── db/                   # sqlite schema, migrations, seed scenarios
│   ├── demo/                 # demo incident scenarios + generator
│   └── services/             # incidents, plans, execution boundary, plan hash
└── ...
```

## Configuration

See [.env.example](.env.example). Supported variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `INCIDENTLENS_DB_PATH` | SQLite database path | `./data/incidentlens.db` |
| `CLANKER_MODE` | `demo` or `live` | `demo` |
| `CLANKER_API_URL` / `CLANKER_API_KEY` / `CLANKER_AGENT_ID` | Clanker Cloud credentials (live mode) | — |
| `CLANKER_DEMO_STEP_DELAY_MS` | Simulated investigation step pacing | `420` |
| `CLANKER_TIMEOUT_MS` | Clanker API timeout | `120000` |
| `APPROVAL_TTL_MS` | How long an approval stays valid before execution is refused | `3600000` |

## Safety model

- Investigation is read-only; the agent only queries infrastructure state.
- Every mutable remediation action defines a rollback strategy, blast radius and approval requirement.
- Actions that cannot define a rollback are marked **"Manual recovery required"** and one-click execution is blocked.
- The plan is fingerprinted at generation time. Execution recomputes the hash and refuses to run if the plan changed after approval, or if the approval expired.
- Credentials are never exposed to the browser and never placed in logs.
