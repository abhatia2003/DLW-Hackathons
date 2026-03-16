# SandboxMind — Methodology, Architecture & Observations

> **docs/REPORT.md** — detailed technical documentation  
> Part of the SandboxMind MVP (2026)

---

## 1. Problem Statement

AI coding agents like Codex are powerful but risky when given unrestricted write access to a production codebase. The goal is to maximise agent leverage across the full SDLC (design, development, deployment, incident response, communication, governance) while keeping a human in the loop at every consequential decision.

**Key tension**: Enough automation to be useful; enough governance to be safe.

---

## 2. Approach

### 2.1 Sandbox-First Isolation

We use **git worktree** to create a lightweight branch that shares the repo's object store but has an independent working directory. This means:

- The agent *physically cannot write files* to the original repo — it has no path to them.
- Creating a sandbox takes milliseconds (no file copying).
- Discarding drops the branch and directory — no residue.
- `git diff --cached` against the worktree gives a clean, auditable diff.

Alternative considered: tmpdir clone (`git clone`). Rejected because it is slow (copies all objects) and the `.git` separation creates confusion in large repos.

### 2.2 Agent Loop Design

The loop mirrors the inner workings of a real Codex agent but with explicit, inspectable steps:

```
Plan → Retrieve Context → Edit → Run Checks → Policy Eval → Patch Proposal → Approval
```

Each step produces an **Evidence Object** containing:
- `diff` (git patch text)
- `files` (changed paths)
- `logs` (stdout/stderr)
- `flags` (policy violations)
- `riskScore` (0–100 aggregate)

This evidence is stored server-side and polled by the frontend every second, driving the mind map in real time.

### 2.3 Codex Adapter Design

The adapter (`src/lib/codexAdapter.js`) exposes a single async function:

```javascript
runCodex({ mode: 'plan'|'edit', prompt, context, scenario }) → { plan?, edits?, rawOutput, stub }
```

**STUB mode** (default, no API key):
- Returns deterministic realistic edits based on the scenario name (`A`, `B`, or `C`).
- Simulates 600–1400ms latency to feel realistic.
- Produces real file content that the policy engine can actually evaluate.

**REAL mode** (`CODEX_API_KEY` set):
- Calls `POST /v1/responses` on `api.openai.com` using the `codex-1` model.
- Parses the response to extract plan text or JSON file edits.
- Falls back gracefully if the response is malformed.

The stub is clearly logged at startup (`[codexAdapter] ⚠ No CODEX_API_KEY found — running in STUB mode`).

### 2.4 Policy Engine

The policy engine (`src/lib/policyEngine.js`) evaluates a diff + file list and returns:

```javascript
{ passed, blocked, riskScore, flags[], summary }
```

**Checks (in order)**:
1. **Blast radius** — too many files changed.
2. **Forbidden directories** — e.g. `node_modules`, `.git`, `secrets`, `.ssh`.
3. **Deny-list paths** — glob patterns like `config/secrets*`, `**/.env*`.
4. **Forbidden tokens in diff** — scans only `+` lines (additions) for patterns like `eval(`, `rm -rf`, `DROP TABLE`.

Each flag includes a `why` explanation in plain English, surfaced in the UI when a user clicks "Why was this flagged?"

**Risk score** is an additive weighted sum (capped at 100). A patch is **blocked** if `riskScore ≥ 50` OR any `CRITICAL` flag is present.

### 2.5 Governance Model

- **Read-only by default**: Approve/Reject/Export buttons are disabled until the agent completes the Patch Proposal step.
- **Blocked patches** (policy violations) disable the Approve button even at the Approval step — a human cannot click through a blocked patch without modifying the policy config.
- **Audit log**: Every event (sandbox creation, agent run, policy block, approval, export) is appended to `data/audit.json` with actor name, timestamp, and details. The log is append-only (no delete API).
- **Export**: Approved patches are written as `.patch` files to `data/patches/` with metadata headers.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Sidebar  │  │  SVG MindMap │  │    Evidence Drawer   │  │
│  │ Controls │  │  7 nodes     │  │    Diff/Flags/Logs   │  │
│  └──────────┘  └──────────────┘  └──────────────────────┘  │
│        │               │ polling /api/agent/results/:id      │
└────────┼───────────────┼─────────────────────────────────────┘
         │ REST API      │
┌────────▼───────────────▼─────────────────────────────────────┐
│                     Express Server                            │
│  /api/sandbox  /api/agent  /api/audit                        │
│                                                               │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐              │
│  │ sandbox   │  │ agentLoop  │  │ auditLog   │              │
│  │ Manager   │  │ (7 steps)  │  │ (JSON)     │              │
│  └─────┬─────┘  └─────┬──────┘  └────────────┘              │
│        │               │                                      │
│  ┌─────▼──────┐  ┌─────▼──────┐  ┌──────────────┐          │
│  │ git        │  │ codex      │  │ policy       │          │
│  │ worktree   │  │ adapter    │  │ engine       │          │
│  └─────┬──────┘  └────────────┘  └──────────────┘          │
└────────┼───────────────────────────────────────────────────── ┘
         │ git worktree add
┌────────▼─────────────────────────────────────┐
│  /tmp/sandboxmind/sandbox-<id>/               │
│  (isolated worktree — no path to real repo)   │
└──────────────────────────────────────────────┘
```

---

## 4. What is Real vs. Stubbed

| Component | Reality |
|---|---|
| `git worktree` create/discard | ✅ **REAL** — actual shell commands via `child_process` |
| File edits applied | ✅ **REAL** — written to the worktree filesystem |
| `git diff --cached` | ✅ **REAL** — actual git output |
| Policy engine checks | ✅ **REAL** — evaluates real diff content |
| Audit log persistence | ✅ **REAL** — appended to `data/audit.json` |
| Patch file export | ✅ **REAL** — written to `data/patches/` |
| `CHECK_CMD` execution | ✅ **REAL** — `spawnSync` with 30s timeout |
| Codex AI (default) | ⚠️ **STUB** — deterministic edits, simulated latency |
| Codex AI (with key) | ✅ **REAL** — `POST /v1/responses` to OpenAI API |
| Context retrieval | ✅ **REAL** — walks sandbox filesystem |

---

## 5. Demo Scenarios — Design Rationale

### Scenario A — Safe Change
- Edits only `src/utils.js` (documentation, no logic change).
- 1 file, 0 policy flags, risk score 0.
- Demonstrates the "happy path": agent works, policy clears, human approves.

### Scenario B — Blocked Change
- Edits `config/secrets.js` (deny-listed path) and introduces `eval(userInput)` (forbidden token).
- 2 policy flags (CRITICAL severity), risk score 75.
- Approve button disabled. Demonstrates governance blocking automated agents.

### Scenario C — Explanation Flow
- Optimises data pipeline but references `/etc/sandboxmind/data` (forbidden dir).
- 3 files touched, 1 policy flag (`FORBIDDEN_DIRECTORY`).
- Demonstrates the "why was this flagged?" evidence flow — clicking the PolicyEval node shows plain-English explanation.

---

## 6. Testing Approach

### Manual Verification (Primary)

The app is verified by running it end-to-end via the browser:
1. Create sandbox → confirm worktree exists in `/tmp/sandboxmind/`.
2. Run Scenario A → confirm files are written in the worktree, diff is non-empty, audit log updated.
3. Run Scenario B → confirm Approve button is disabled, `policy_blocked` in audit log.
4. Discard sandbox → confirm directory removed.

### Structural Tests (Manual CLI)

```bash
# Verify server starts
npm start &
curl http://localhost:3000/api/health

# Verify sandbox creation (requires demo-repo to have commits)
curl -X POST http://localhost:3000/api/sandbox/create \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/path/to/demo-repo"}'

# Verify scenarios endpoint
curl http://localhost:3000/api/agent/scenarios

# Verify audit log
curl http://localhost:3000/api/audit
```

### What We Did Not Automate (Limitations)
- No unit tests for the backend library modules (out of hackathon scope).
- No end-to-end test suite (Playwright/Cypress not included).
- The real Codex API response parsing is best-effort (no schema validation).

---

## 7. Limitations & Future Work

| Limitation | Description |
|---|---|
| Single sandbox at a time | Server keeps one `activeSandbox` in memory; multi-user would need a session map |
| No auth | Any user on the network can approve patches — fine for local demo |
| Polling-based updates | Would be nicer with SSE/WebSockets for real-time step streaming |
| Codex response parsing | Real API responses require more robust JSON extraction from markdown fences |
| No test suite | Unit tests for `policyEngine.js` and `sandboxManager.js` should be added |
| Reprompt runs full loop | Ideally only re-run from the selected step, not from Plan |

---

## 8. Observations

1. **git worktree is the right primitive** — it's fast, clean, and maps directly to the "sandbox" mental model.
2. **Evidence objects are the core abstraction** — making every step produce structured evidence unlocks the entire UI (mind map, drawer, metrics, audit).
3. **Policy engine catches real issues** — even with deterministic stub output, the engine flagged `eval(` and `/etc/` paths correctly, demonstrating that the governance layer is functional, not cosmetic.
4. **Stub mode is more useful than it sounds** — because the edits are realistic (real file content, real paths), every downstream component (diff, policy, metrics, export) exercises real code paths.
5. **Human-in-the-loop UX matters** — keeping the Approve button disabled until the agent finishes, and disabling it entirely for blocked patches, makes the governance gate feel genuine rather than advisory.
