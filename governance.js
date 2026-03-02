/**
 * governance.js — Approval Flow Controller
 * =========================================
 * Handles the approve / reject / export-patch governance actions.
 * Enforces read-only state until the Patch Proposal step is reached.
 * Manages the Audit Log panel rendering.
 */

'use strict';

const Governance = {
    currentRunId: null,
    currentDiff: '',
    currentScenario: '',
    isBlocked: false,

    /**
     * Update governance controls based on the run state.
     * @param {{ runId, blocked, steps: Evidence[] }} runState
     */
    update(runState) {
        this.currentRunId = runState.id || runState.runId;
        this.isBlocked = runState.blocked;
        this.currentScenario = runState.scenario;

        const patchStep = (runState.steps || []).find(s => s.step === 'PatchProposal');
        const approvalStep = (runState.steps || []).find(s => s.step === 'Approval');

        this.currentDiff = patchStep?.diff || approvalStep?.diff || '';

        const hasReachedPatch = !!patchStep && patchStep.status !== 'running';
        const isAwaiting = approvalStep?.status === 'awaiting';
        const isApproved = approvalStep?.status === 'approved';

        // Update button states
        const btnApprove = document.getElementById('btn-approve');
        const btnReject = document.getElementById('btn-reject');
        const btnExport = document.getElementById('btn-export');

        if (btnApprove) {
            btnApprove.disabled = !isAwaiting || this.isBlocked;
            btnApprove.title = this.isBlocked
                ? 'Cannot approve: patch is blocked by policy. Review flags first.'
                : !isAwaiting
                    ? 'Waiting for agent to complete...'
                    : 'Approve and export this patch';
        }

        if (btnReject) {
            btnReject.disabled = !isAwaiting;
        }

        if (btnExport) {
            btnExport.disabled = !isApproved;
        }

        // Status display in governance section
        const statusEl = document.getElementById('governance-status');
        if (statusEl) {
            if (isApproved) {
                statusEl.innerHTML = '<span class="badge badge-approved">✅ Approved</span>';
            } else if (this.isBlocked && isAwaiting) {
                statusEl.innerHTML = '<span class="badge badge-blocked">🚫 Blocked</span>';
            } else if (isAwaiting) {
                statusEl.innerHTML = '<span class="badge badge-awaiting">⏳ Awaiting Approval</span>';
            } else {
                statusEl.innerHTML = '<span class="badge badge-idle">🔒 Read-only</span>';
            }
        }
    },

    /**
     * Send approve action to the backend.
     */
    async approve() {
        if (!this.currentRunId) return;
        const actor = document.getElementById('actor-name')?.value.trim() || 'user';

        try {
            const res = await fetch('/api/audit/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId: this.currentRunId,
                    diff: this.currentDiff,
                    actor,
                    scenario: this.currentScenario,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                window.App?.showToast('✅ Patch approved and recorded in audit log', 'success');
                // Mark approval step as approved in the mind map
                window.App?.approveCurrentRun();
                // Reload audit log
                this.refreshAuditLog();
                return true;
            }
        } catch (err) {
            window.App?.showToast(`Approve failed: ${err.message}`, 'error');
        }
        return false;
    },

    /**
     * Send reject action.
     */
    async reject() {
        if (!this.currentRunId) return;
        const actor = document.getElementById('actor-name')?.value.trim() || 'user';
        const reason = prompt('Optional: enter reject reason') || '';

        try {
            const res = await fetch('/api/audit/reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId: this.currentRunId, actor, reason }),
            });
            const data = await res.json();
            if (data.ok) {
                window.App?.showToast('❌ Patch rejected', 'warning');
                this.refreshAuditLog();
            }
        } catch (err) {
            window.App?.showToast(`Reject failed: ${err.message}`, 'error');
        }
    },

    /**
     * Export the patch file.
     */
    async exportPatch() {
        if (!this.currentRunId) return;
        const actor = document.getElementById('actor-name')?.value.trim() || 'user';

        try {
            const res = await fetch('/api/audit/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId: this.currentRunId,
                    diff: this.currentDiff,
                    actor,
                    scenario: this.currentScenario,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                window.App?.showToast(`📦 Patch exported: ${data.filename}`, 'success');
                this.refreshAuditLog();
            }
        } catch (err) {
            window.App?.showToast(`Export failed: ${err.message}`, 'error');
        }
    },

    /**
     * Refresh and render the audit log table.
     */
    async refreshAuditLog() {
        const container = document.getElementById('audit-log-body');
        if (!container) return;

        try {
            const res = await fetch('/api/audit');
            const data = await res.json();
            const entries = (data.entries || []).slice().reverse(); // newest first

            if (entries.length === 0) {
                container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No audit events yet</td></tr>';
                return;
            }

            container.innerHTML = entries.map(e => {
                const ts = new Date(e.timestamp).toLocaleTimeString();
                const details = typeof e.details === 'object'
                    ? Object.entries(e.details)
                        .filter(([k]) => k !== 'diff')
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                        .join(' | ')
                    : '';
                return `
          <tr>
            <td class="audit-ts">${ts}</td>
            <td><span class="audit-type">${e.type}</span></td>
            <td style="color:var(--text-secondary);font-size:0.75rem;">${e.actor}</td>
            <td style="color:var(--text-muted);font-size:0.72rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${details}">${details}</td>
          </tr>
        `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<tr><td colspan="4" style="color:var(--brand-danger)">Failed to load: ${err.message}</td></tr>`;
        }
    },
};

window.Governance = Governance;
