# SandboxMind

> **Safe, human-governed AI coding agent system** — maximises the leverage of Codex across SDLC stages while keeping a human in the governance loop at every critical decision point.

**Access the app at: [http://localhost:3000](http://localhost:3000)**

---

## What is SandboxMind?

SandboxMind is a local web application that:

1. **Creates a git worktree sandbox** so Codex can *never* touch your real repo.
2. **Runs a 7-step AI agent loop** (Plan → Retrieve Context → Edit → Run Checks → Policy Eval → Patch Proposal → Approval) and shows you real-time evidence at every step.
3. **Visualises the loop as a clickable mind map** where every node reveals the diff, logs, policy flags, and risk score for that step.
4. **Enforces governance policies** — forbidden dirs, dangerous code tokens, blast-radius limits — and blocks patches that exceed your risk threshold.
5. **Records every action** in an append-only JSON audit log.
6. **Lets you approve** (export a `.patch` file) or **reject** any proposed change with full audit trail.

---

## Key Architecture Points

| Component | Technology | Notes |
|---|---|---|
| Backend | Node.js + Express | REST API on port 3000 |
| Sandbox | `git worktree` | Completely isolated branch |
| AI Adapter | Codex stub / real API | Swap with `CODEX_API_KEY` |
| Policy Engine | Pure JS | Config-driven via `config/policy.json` |
| Storage | JSON files | `data/audit.json`, `data/patches/` |
| Frontend | Vanilla HTML/CSS/JS | SVG mind map, no build step |

---

## Setup

### Prerequisites

- macOS with Git installed (`git --version` should work)
- Node.js ≥ 16 (`node --version`)
- npm installed (`npm --version`)

### 1 — Clone / extract the project

The project is already at:
```
/Users/Aravinth/DeepLearning(Beginner)/DLW/sandboxmind/
```

### 2 — Install dependencies

```bash
cd "/Users/Aravinth/DeepLearning(Beginner)/DLW/sandboxmind"
npm install
```

### 3 — Initialise the demo-repo

The demo-repo needs to be a proper git repository so the sandbox can create a worktree:

```bash
cd "/Users/Aravinth/DeepLearning(Beginner)/DLW/sandboxmind/demo-repo"
git init
git add -A
git commit -m "Initial demo repo"
cd ..
```

### 4 — Run the server

```bash
# From the sandboxmind directory:
npm start
```

You should see:
```
  ╔═══════════════════════════════════════╗
  ║         🧠  SandboxMind v1.0          ║
  ╚═══════════════════════════════════════╝

  🌐  http://localhost:3000
  🤖  Codex mode : ⚠️  STUB (set CODEX_API_KEY to use real Codex)
  🧪  Check cmd  : (not set — checks step will be skipped)
```

### 5 — Open the app

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Environment Variables (all optional)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `CODEX_API_KEY` | not set | OpenAI API key — enables real Codex; stub used if absent |
| `CHECK_CMD` | not set | Command to run as automated checks, e.g. `npm test` |
| `SANDBOX_BASE_DIR` | `/tmp/sandboxmind` | Where worktrees are created |

Example with real Codex and checks:
```bash
CODEX_API_KEY=sk-... CHECK_CMD="npm test" npm start
```

---

## Demo Script (2–3 minutes)

### Step 1 — Create the Sandbox (~20 seconds)

1. In the **Sandbox** section (left sidebar), enter the **absolute path** to the demo-repo:
   ```
   /Users/Aravinth/DeepLearning(Beginner)/DLW/sandboxmind/demo-repo
   ```
2. Leave base branch as `HEAD`.
3. Click **➕ Create Sandbox**.
4. ✅ A green status badge appears with the worktree path in `/tmp/sandboxmind/`.

---

### Step 2 — Run Scenario A (Safe change) (~30 seconds)

1. In **Demo Scenarios**, click **"✅ Safe Change — Add Documentation"** (Scenario A).
2. Click **⚡ Run Agent**.
3. Watch the **Execution Graph**: nodes light up one at a time (Plan → Context → Edit → Checks → Policy → Patch → Approval).
4. Click the **Edit** node → see the diff of documentation comments added to `src/utils.js`.
5. Click the **PolicyEval** node → see "✅ All policy checks passed. Risk score: 0/100".
6. The Approval node glows amber: **"⏳ Awaiting Approval"**.
7. Click **✅ Approve Patch** → audit log shows the approval event.
8. Click **📦 Export Patch File** → a `.patch` file is written to `data/patches/`.

---

### Step 3 — Run Scenario B (Blocked change) (~30 seconds)

1. In **Demo Scenarios**, click **"🚫 Risky Change — Secrets + eval()"** (Scenario B).
2. Click **⚡ Run Agent**.
3. Watch the **PolicyEval** node turn **red (blocked)**.
4. Click the **PolicyEval** node → see 2 flags:
   - `DENYLIST_PATH` — `config/secrets.js` is on the deny list.
   - `FORBIDDEN_TOKEN` — `eval(` found in the diff.
   - Risk score: **75/100**
5. The **Approve** button is **disabled** — governance blocks it.
6. Audit log shows `policy_blocked` event.

---

### Step 4 — "Why was this flagged?" (Scenario C) (~20 seconds)

1. Select **"⚠️ Multi-file Change — Forbidden Path"** (Scenario C).
2. Run the agent.
3. Click the **PolicyEval** node → observe the `FORBIDDEN_DIRECTORY` flag.
4. Read the **"Why flagged?"** explanation: `/etc/` is on the forbidden directory list; automated agents cannot modify system directories.

---

### Step 5 — Re-prompt a step (~20 seconds)

1. After any run, click the **Plan** node.
2. In the **Re-prompt** box, type: *"Only add comments to the `sum` and `average` functions"*.
3. Click **🔄 Re-run from this step** — the agent re-runs the full loop with the refined instruction.

---

### Step 6 — Check the Audit Log (~10 seconds)

1. Click the **Audit** tab in the right drawer.
2. See a timestamped list of every event: `sandbox_created`, `agent_run_started`, `policy_blocked`, `patch_approved`, `patch_exported`.

---

### Step 7 — Discard sandbox (~5 seconds)

1. Click **🗑 Discard** in the Sandbox section.
2. The worktree in `/tmp/sandboxmind/` is removed. The original repo is untouched.

---

## Metrics Panel

The bottom bar of the main panel shows after each run:

| Metric | Description |
|---|---|
| ⏱ Time-to-patch | Seconds from Plan start to PatchProposal finish |
| 🚩 Policy flags | Count of governance violations |
| 🧪 Checks | Pass / Fail / Skipped |
| 📄 Files changed | Number of files in the diff |
| ⚠️ Risk bar | Visual 0–100 risk score (green→amber→red) |

---

## Troubleshooting

### git worktree errors

**Error: `fatal: invalid reference: HEAD`**
> The demo-repo has no commits. Run:
> ```bash
> cd .../sandboxmind/demo-repo && git init && git add -A && git commit -m "init"
> ```

**Error: `fatal: '/tmp/sandboxmind/sandbox-...' already exists`**
> Previous sandbox was not cleaned up. Run:
> ```bash
> rm -rf /tmp/sandboxmind
> ```
> Then click **Discard Sandbox** and recreate.

**Error: `git: worktree is already checked out`**
> Stale worktree reference. Run:
> ```bash
> cd /path/to/repo && git worktree prune
> ```

---

### Base branch not found

**Error: `fatal: not a valid object name: 'main'`**
> Your repo's default branch may be `master`. Either:
> - Change the **Base branch** field to `master`, or
> - Leave it as `HEAD` (always works).

---

### Permissions on /tmp

**Error: `EACCES: permission denied, mkdir '/tmp/sandboxmind'`**
> Set a different sandbox directory:
> ```bash
> SANDBOX_BASE_DIR="$HOME/sandboxmind-tmp" npm start
> ```

---

### Missing CHECK_CMD

The **Run Checks** step will show "CHECK_CMD not configured — skipping". This is expected and non-blocking. To enable:
```bash
CHECK_CMD="npm test" npm start
# or for Python projects:
CHECK_CMD="pytest" npm start
```

---

### Port 3000 already in use

```bash
PORT=3001 npm start
# Then open http://localhost:3001
```

---

## What is REAL vs. STUBBED?

| Feature | Status | Notes |
|---|---|---|
| git worktree sandbox | ✅ REAL | Full git worktree create/discard |
| 7-step agent loop | ✅ REAL | Runs sequentially, real timing |
| File edits in sandbox | ✅ REAL | Files are written to worktree |
| Git diff | ✅ REAL | `git diff --cached` output |
| Policy engine | ✅ REAL | Checks real diff content |
| Audit log | ✅ REAL | Appended to `data/audit.json` |
| Patch export | ✅ REAL | File written to `data/patches/` |
| CHECK_CMD execution | ✅ REAL | `child_process.spawnSync` |
| Codex AI calls | ⚠️ STUB (default) | Deterministic realistic edits; real with `CODEX_API_KEY` |

---

## Policy Configuration

Edit `config/policy.json` to customise:

```json
{
  "forbiddenDirs": ["node_modules", ".git", "secrets"],
  "forbiddenTokens": ["rm -rf", "eval(", "exec("],
  "maxFilesChanged": 5,
  "denyListPaths": ["config/secrets*", "**/.env*"]
}
```

---

## Project Structure

```
sandboxmind/
├── server.js                 ← Express server entry
├── package.json
├── config/
│   ├── policy.json           ← Governance policy rules
│   └── default.json          ← Server defaults
├── src/
│   ├── lib/
│   │   ├── codexAdapter.js   ← Codex API (stub + real)
│   │   ├── sandboxManager.js ← git worktree operations
│   │   ├── policyEngine.js   ← Governance checks
│   │   ├── agentLoop.js      ← 7-step orchestrator
│   │   ├── auditLog.js       ← Append-only JSON log
│   │   └── scenarioRunner.js ← 3 demo scenarios
│   └── routes/
│       ├── sandbox.js        ← /api/sandbox/*
│       ├── agent.js          ← /api/agent/*
│       └── audit.js          ← /api/audit/*
├── public/
│   ├── index.html            ← Main SPA shell
│   ├── css/style.css         ← Dark glassmorphism styles
│   └── js/
│       ├── app.js            ← State machine + API calls
│       ├── mindmap.js        ← SVG graph renderer
│       ├── metrics.js        ← Metrics bar
│       └── governance.js     ← Approve/reject/export
├── demo-repo/                ← Ready-to-use sandbox target
│   ├── src/utils.js          ← Target for Scenario A
│   ├── src/dataProcessor.js  ← Target for Scenario C
│   └── config/secrets.js     ← Target for Scenario B
├── data/
│   ├── audit.json            ← Audit log (auto-appended)
│   └── patches/              ← Exported patch files
└── docs/
    └── REPORT.md             ← Methodology & architecture
```

---

## See Also

- [docs/REPORT.md](docs/REPORT.md) — detailed methodology and architecture
