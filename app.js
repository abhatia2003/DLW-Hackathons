/**
 * app.js — SandboxMind Main Application
 * =======================================
 * State machine connecting all modules.
 *
 * States: IDLE → SANDBOX_CREATED → RUNNING → AWAITING_APPROVAL → APPROVED / REJECTED
 *
 * Key responsibilities:
 *  - Sandbox create/discard
 *  - Run agent loop (polling /api/agent/results/:runId every second)
 *  - Render evidence in the drawer when a node is clicked
 *  - Wire approve/reject/export buttons
 *  - Drive the mind map and metrics panel
 */

'use strict';

const App = (() => {

    // ── State ─────────────────────────────────────────────────────────────────
    let state = 'IDLE';
    let mindMap = null;
    let currentRunId = null;
    let currentSteps = [];
    let pollTimer = null;
    let sandboxPath = null;
    let selectedScenario = 'A';
    let activeNodeId = null;
    let codexMode = 'STUB';

    // ── DOM Refs ──────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        // Health check to get Codex mode
        try {
            const h = await fetch('/api/health').then(r => r.json());
            codexMode = h.codexMode || 'STUB';
            const badge = $('codex-mode-badge');
            if (badge) {
                badge.className = `codex-badge ${codexMode === 'REAL' ? 'real' : 'stub'}`;
                badge.innerHTML = codexMode === 'REAL'
                    ? '<span>●</span> Codex REAL'
                    : '<span>◌</span> Codex STUB';
            }
        } catch { }

        // Init mind map
        const svg = $('mindmap-svg');
        if (svg) {
            mindMap = new MindMap(svg, onNodeClick);
        }

        // Load scenarios
        loadScenarios();

        // Wire buttons
        wireButtons();

        // Load audit log
        Governance.refreshAuditLog();

        // Check sandbox status
        refreshSandboxStatus();
    }

    // ── Load Scenarios ────────────────────────────────────────────────────────
    async function loadScenarios() {
        try {
            const data = await fetch('/api/agent/scenarios').then(r => r.json());
            const container = $('scenario-list');
            if (!container) return;
            container.innerHTML = '';

            data.scenarios.forEach(s => {
                const card = document.createElement('div');
                card.className = `scenario-card ${s.id === selectedScenario ? 'selected' : ''}`;
                card.setAttribute('tabindex', '0');
                card.setAttribute('role', 'radio');
                card.setAttribute('aria-checked', s.id === selectedScenario ? 'true' : 'false');
                card.dataset.id = s.id;
                card.innerHTML = `
          <span class="scenario-outcome ${s.expectedOutcome}">${s.expectedOutcome === 'pass' ? 'PASS' : 'BLOCKED'}</span>
          <h4>${s.name}</h4>
          <p>${s.description}</p>
        `;
                card.addEventListener('click', () => selectScenario(s.id));
                card.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectScenario(s.id); }
                });
                container.appendChild(card);
            });
        } catch (err) {
            console.warn('Could not load scenarios:', err);
        }
    }

    function selectScenario(id) {
        selectedScenario = id;
        document.querySelectorAll('.scenario-card').forEach(c => {
            const selected = c.dataset.id === id;
            c.classList.toggle('selected', selected);
            c.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
    }

    // ── Wire Buttons ──────────────────────────────────────────────────────────
    function wireButtons() {
        // Sandbox
        $('btn-create-sandbox')?.addEventListener('click', createSandbox);
        $('btn-discard-sandbox')?.addEventListener('click', discardSandbox);

        // Agent
        $('btn-run-agent')?.addEventListener('click', runAgent);

        // Governance
        $('btn-approve')?.addEventListener('click', async () => {
            const ok = await Governance.approve();
            if (ok) { setState('APPROVED'); }
        });
        $('btn-reject')?.addEventListener('click', async () => {
            await Governance.reject();
            setState('REJECTED');
        });
        $('btn-export')?.addEventListener('click', () => Governance.exportPatch());

        // Reprompt
        $('btn-reprompt-submit')?.addEventListener('click', repromptStep);

        // Audit log refresh
        $('btn-refresh-audit')?.addEventListener('click', () => Governance.refreshAuditLog());

        // Demo repo button
        $('btn-use-demo')?.addEventListener('click', () => {
            const demoPath = window.location.origin.includes('localhost')
                ? window.__demoRepoPath || ''
                : '';
            $('repo-path').value = demoPath || 'Use the absolute path shown in the server console';
        });
    }

    // ── Sandbox Operations ────────────────────────────────────────────────────
    async function createSandbox() {
        const repoPath = $('repo-path')?.value?.trim();
        const branch = $('base-branch')?.value?.trim() || 'HEAD';

        if (!repoPath) {
            showToast('Please enter a repository path', 'error');
            return;
        }

        setLoading('btn-create-sandbox', true);
        try {
            const res = await fetch('/api/sandbox/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoPath, baseBranch: branch }),
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                showToast(`Sandbox error: ${data.error}`, 'error');
                return;
            }

            sandboxPath = data.sandboxPath;
            setState('SANDBOX_CREATED');
            showToast(`✅ Sandbox created at ${data.sandboxPath}`, 'success');
            updateSandboxStatus(data);
        } catch (err) {
            showToast(`Network error: ${err.message}`, 'error');
        } finally {
            setLoading('btn-create-sandbox', false);
        }
    }

    async function discardSandbox() {
        setLoading('btn-discard-sandbox', true);
        try {
            const res = await fetch('/api/sandbox/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            sandboxPath = null;
            setState('IDLE');
            showToast('🗑  Sandbox discarded', 'info');
            updateSandboxStatus(null);
            resetUI();
        } catch (err) {
            showToast(`Discard error: ${err.message}`, 'error');
        } finally {
            setLoading('btn-discard-sandbox', false);
        }
    }

    async function refreshSandboxStatus() {
        try {
            const data = await fetch('/api/sandbox/status').then(r => r.json());
            if (data.active) {
                sandboxPath = data.sandboxPath;
                setState('SANDBOX_CREATED');
                updateSandboxStatus(data);
            }
        } catch { }
    }

    function updateSandboxStatus(data) {
        const el = $('sandbox-status-text');
        if (!el) return;
        if (data) {
            el.className = 'sandbox-status active';
            el.innerHTML = `<span>✅</span> ${data.sandboxPath || 'Active'}`;
        } else {
            el.className = 'sandbox-status inactive';
            el.textContent = 'No sandbox active';
        }
    }

    // ── Run Agent ─────────────────────────────────────────────────────────────
    async function runAgent() {
        if (!sandboxPath) {
            showToast('Create a sandbox first', 'error');
            return;
        }

        const taskPrompt = $('task-prompt')?.value?.trim() || '';
        resetUI();
        setState('RUNNING');
        setLoading('btn-run-agent', true);

        try {
            const res = await fetch('/api/agent/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scenario: selectedScenario,
                    taskPrompt,
                    sandboxPath,
                    actor: $('actor-name')?.value?.trim() || 'user',
                }),
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                showToast(`Agent error: ${data.error}`, 'error');
                setState('SANDBOX_CREATED');
                return;
            }

            currentRunId = data.runId;
            showToast(`🤖 Agent started (Run ${currentRunId.slice(0, 8)}…)`, 'info');
            startPolling(currentRunId);
        } catch (err) {
            showToast(`Network error: ${err.message}`, 'error');
            setState('SANDBOX_CREATED');
        } finally {
            setLoading('btn-run-agent', false);
        }
    }

    // ── Polling ───────────────────────────────────────────────────────────────
    function startPolling(runId) {
        stopPolling();
        pollTimer = setInterval(async () => {
            try {
                const data = await fetch(`/api/agent/results/${runId}`).then(r => r.json());
                if (data.error) { stopPolling(); return; }

                currentSteps = data.steps || [];
                mindMap?.update(currentSteps);
                MetricsPanel.update(currentSteps);
                Governance.update(data);

                // Re-render active node drawer if open
                if (activeNodeId) {
                    renderDrawer(activeNodeId);
                }

                if (data.status === 'awaiting_approval' || data.status === 'blocked' || data.status === 'error') {
                    stopPolling();
                    setState(data.blocked ? 'BLOCKED' : 'AWAITING_APPROVAL');
                    const msg = data.blocked
                        ? '🚫 Agent blocked by policy. Review flags in PolicyEval node.'
                        : '⏳ Agent complete. Review the Patch Proposal and click Approve or Reject.';
                    showToast(msg, data.blocked ? 'warning' : 'success');
                }
            } catch { }
        }, 1000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // ── Node Click → Drawer ───────────────────────────────────────────────────
    function onNodeClick(stepId) {
        activeNodeId = stepId;
        renderDrawer(stepId);

        // Highlight selected node
        document.querySelectorAll('.mm-node').forEach(n => n.classList.remove('selected-node'));
        $(`node-${stepId}`)?.classList.add('selected-node');
    }

    function renderDrawer(stepId) {
        const step = currentSteps.find(s => s.step === stepId);
        const stepDef = window.STEPS?.find(s => s.id === stepId);

        // Header
        const headerTitle = $('drawer-step-name');
        const headerBadge = $('drawer-step-badge');
        if (headerTitle) headerTitle.textContent = `${stepDef?.icon || ''} ${stepId}`;
        if (headerBadge) {
            const status = step?.status || 'idle';
            headerBadge.outerHTML = `<span id="drawer-step-badge" class="badge badge-${status}">${status}</span>`;
        }

        if (!step) {
            // No data yet
            $('tab-overview').innerHTML = `<div class="empty-state"><div class="icon">⏳</div><p>This step hasn't run yet. Start the agent to see evidence here.</p></div>`;
            $('tab-diff').innerHTML = `<div class="empty-state"><p>No diff yet</p></div>`;
            $('tab-flags').innerHTML = `<div class="empty-state"><p>No policy flags yet</p></div>`;
            $('tab-logs').innerHTML = `<div class="empty-state"><p>No logs yet</p></div>`;
            return;
        }

        // Overview tab
        renderOverview(step, stepId);

        // Diff tab
        renderDiff(step);

        // Flags tab
        renderFlags(step);

        // Logs tab
        renderLogs(step);

        // Reprompt availability
        const repromptArea = $('reprompt-area');
        if (repromptArea) {
            repromptArea.style.display = (stepId === 'Plan' || stepId === 'Edit') ? 'block' : 'none';
            const label = $('reprompt-step-label');
            if (label) label.textContent = `Re-prompt: ${stepId}`;
        }
    }

    function renderOverview(step, stepId) {
        const el = $('tab-overview');
        if (!el) return;

        const rows = [
            ['Status', `<span class="badge badge-${step.status}">${step.status}</span>`],
            ['Duration', step.durationMs ? `${(step.durationMs / 1000).toFixed(2)}s` : '—'],
            ['Files', step.files?.length || 0],
            ['Risk score', step.riskScore != null ? `<span class="${step.riskScore >= 50 ? 'risk-high' : step.riskScore >= 25 ? 'risk-medium' : 'risk-low'}">${step.riskScore}/100</span>` : '—'],
        ];

        let html = `<div class="section-title">Overview</div>`;
        rows.forEach(([k, v]) => {
            html += `<div class="info-row"><span class="key">${k}</span><span class="value">${v}</span></div>`;
        });

        if (step.plan) {
            html += `<div class="section-title" style="margin-top:16px">Plan</div><div class="plan-text">${escHtml(step.plan)}</div>`;
        }

        if (step.edits?.length > 0) {
            html += `<div class="section-title" style="margin-top:16px">Edits (${step.edits.length})</div><ul class="files-list">`;
            step.edits.forEach(e => {
                html += `<li>📝 ${escHtml(e.path)}<span style="color:var(--text-muted);margin-left:8px">${escHtml(e.description || '')}</span></li>`;
            });
            html += '</ul>';
        }

        if (step.policyResult?.summary) {
            html += `<div class="section-title" style="margin-top:16px">Policy Summary</div>
        <div style="padding:12px;background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:8px;font-size:0.82rem;line-height:1.6;color:var(--text-secondary)">
          ${escHtml(step.policyResult.summary)}
        </div>`;
        }

        el.innerHTML = html;
    }

    function renderDiff(step) {
        const el = $('tab-diff');
        if (!el) return;
        if (!step.diff || step.diff === '(no changes detected)') {
            el.innerHTML = `<div class="empty-state"><p>No diff available for this step.</p></div>`;
            return;
        }
        const highlighted = colorDiff(step.diff);
        el.innerHTML = `<pre>${highlighted}</pre>`;
    }

    function renderFlags(step) {
        const el = $('tab-flags');
        if (!el) return;
        if (!step.flags || step.flags.length === 0) {
            el.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>No policy flags for this step.</p></div>`;
            return;
        }

        el.innerHTML = step.flags.map(f => `
      <div class="flag-card ${(f.severity || '').toLowerCase()}">
        <h4>
          <span>${escHtml(f.type)}</span>
          <span class="badge badge-blocked">${f.severity}</span>
        </h4>
        <p>${escHtml(f.description)}</p>
        <div class="evidence">${escHtml(f.evidence || '')}</div>
        <div class="why">💡 Why flagged? ${escHtml(f.why || '')}</div>
      </div>
    `).join('');
    }

    function renderLogs(step) {
        const el = $('tab-logs');
        if (!el) return;
        el.innerHTML = `<pre>${escHtml(step.logs || '(no logs)')}</pre>`;
    }

    // ── Reprompt ──────────────────────────────────────────────────────────────
    async function repromptStep() {
        const prompt = $('reprompt-prompt')?.value?.trim();
        if (!prompt) { showToast('Enter a new prompt first', 'error'); return; }

        setLoading('btn-reprompt-submit', true);
        try {
            const res = await fetch('/api/agent/reprompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId: currentRunId,
                    stepName: activeNodeId,
                    prompt,
                    sandboxPath,
                    scenario: selectedScenario,
                    actor: $('actor-name')?.value?.trim() || 'user',
                }),
            });
            const data = await res.json();
            if (data.runId) {
                currentRunId = data.runId;
                resetUI();
                setState('RUNNING');
                startPolling(data.runId);
                showToast(`🔄 Re-running from ${activeNodeId}…`, 'info');
                $('reprompt-prompt').value = '';
            }
        } catch (err) {
            showToast(`Reprompt error: ${err.message}`, 'error');
        } finally {
            setLoading('btn-reprompt-submit', false);
        }
    }

    // ── Approval helpers ──────────────────────────────────────────────────────
    function approveCurrentRun() {
        // Update the approval step status in the mind map
        const approvalStep = currentSteps.find(s => s.step === 'Approval');
        if (approvalStep) approvalStep.status = 'approved';
        mindMap?.setApproved();
        mindMap?.update(currentSteps);
        setState('APPROVED');

        // Enable export
        const btnExport = $('btn-export');
        if (btnExport) btnExport.disabled = false;
    }

    // ── State Machine ─────────────────────────────────────────────────────────
    function setState(newState) {
        state = newState;

        const btnRun = $('btn-run-agent');
        const btnCreate = $('btn-create-sandbox');
        const btnDiscard = $('btn-discard-sandbox');

        const hasSandbox = !!sandboxPath;

        if (btnCreate) btnCreate.disabled = hasSandbox;
        if (btnDiscard) btnDiscard.disabled = !hasSandbox;
        if (btnRun) btnRun.disabled = !hasSandbox || state === 'RUNNING';

        // Update page title status
        const statusTitle = $('run-status-label');
        const statusMap = {
            IDLE: 'Idle',
            SANDBOX_CREATED: '🏗 Sandbox Ready',
            RUNNING: '⚡ Agent Running…',
            AWAITING_APPROVAL: '⏳ Awaiting Approval',
            BLOCKED: '🚫 Blocked by Policy',
            APPROVED: '✅ Approved',
            REJECTED: '❌ Rejected',
        };
        if (statusTitle) statusTitle.textContent = statusMap[newState] || newState;

        // Governance update
        Governance.update({
            id: currentRunId,
            blocked: newState === 'BLOCKED',
            scenario: selectedScenario,
            steps: currentSteps,
        });
    }

    // ── Reset UI ──────────────────────────────────────────────────────────────
    function resetUI() {
        currentSteps = [];
        activeNodeId = null;
        mindMap?.update([]);
        MetricsPanel.reset();

        // Clear drawer
        $('drawer-step-name').textContent = 'Select a node';
        $('tab-overview').innerHTML = `<div class="empty-state"><div class="icon">🗺</div><p>Click any node in the graph to view evidence, diffs, logs, and policy flags.</p></div>`;
        $('tab-diff').innerHTML = `<div class="empty-state"><p>No diff yet</p></div>`;
        $('tab-flags').innerHTML = `<div class="empty-state"><p>No policy flags yet</p></div>`;
        $('tab-logs').innerHTML = `<div class="empty-state"><p>No logs yet</p></div>`;
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(msg, type = 'info') {
        const container = $('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4200);
    }

    // ── Tab switching ─────────────────────────────────────────────────────────
    function initTabs() {
        document.querySelectorAll('.drawer-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const pane = document.getElementById(tab.dataset.tab);
                if (pane) pane.classList.add('active');
            });
            tab.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tab.click(); }
            });
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '\n');
    }

    function colorDiff(diff) {
        return diff.split('\n').map(line => {
            if (line.startsWith('+++') || line.startsWith('---')) return `<span class="diff-head">${escHtml(line)}</span>`;
            if (line.startsWith('+')) return `<span class="diff-add">${escHtml(line)}</span>`;
            if (line.startsWith('-')) return `<span class="diff-del">${escHtml(line)}</span>`;
            if (line.startsWith('@@')) return `<span class="diff-meta">${escHtml(line)}</span>`;
            return escHtml(line);
        }).join('\n');
    }

    function setLoading(btnId, loading) {
        const btn = $(btnId);
        if (!btn) return;
        if (loading) {
            btn._originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span> Working…';
            btn.disabled = true;
        } else {
            if (btn._originalText) btn.innerHTML = btn._originalText;
            btn.disabled = false;
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initTabs();
        init();
    });

    // Public API
    return { showToast, approveCurrentRun, setState };

})();

window.App = App;
