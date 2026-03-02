/**
 * metrics.js — Metrics Panel
 * ===========================
 * Displays aggregate statistics from the agent run:
 *   • Time-to-patch (ms)
 *   • Policy flags count
 *   • Checks pass/fail
 *   • Files changed
 *   • Risk score visual bar
 */

'use strict';

function updateMetrics(steps) {
    if (!steps || steps.length === 0) {
        resetMetrics();
        return;
    }

    // Time-to-patch: from Plan started to PatchProposal finished
    const planStep = steps.find(s => s.step === 'Plan');
    const patchStep = steps.find(s => s.step === 'PatchProposal');
    let timeToPatch = '—';
    if (planStep?.startedAt && patchStep?.finishedAt) {
        const ms = new Date(patchStep.finishedAt) - new Date(planStep.startedAt);
        timeToPatch = ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—';
    }

    // Policy flags
    const policyStep = steps.find(s => s.step === 'PolicyEval');
    const flagCount = policyStep?.flags?.length ?? 0;
    const riskScore = policyStep?.riskScore ?? 0;

    // Checks
    const checksStep = steps.find(s => s.step === 'RunChecks');
    let checksLabel = '—';
    if (checksStep) {
        checksLabel = checksStep.status === 'done' ? '✅ Pass' : checksStep.status === 'failed' ? '❌ Fail' : '⏭ Skipped';
    }

    // Files changed
    const filesChanged = patchStep?.files?.length ?? 0;

    // Update DOM
    setMetric('metric-ttp', timeToPatch);
    setMetric('metric-flags', flagCount, flagCount > 0 ? 'risk-high' : 'risk-low');
    setMetric('metric-checks', checksLabel);
    setMetric('metric-files', filesChanged);
    setMetric('metric-risk', `${riskScore}/100`, riskScore >= 50 ? 'risk-high' : riskScore >= 25 ? 'risk-medium' : 'risk-low');

    // Risk bar
    const bar = document.getElementById('risk-bar-fill');
    if (bar) {
        bar.style.width = `${riskScore}%`;
        bar.style.backgroundColor = riskScore >= 50
            ? '#ef4444'
            : riskScore >= 25
                ? '#f59e0b'
                : '#10b981';
    }
}

function resetMetrics() {
    ['metric-ttp', 'metric-flags', 'metric-checks', 'metric-files', 'metric-risk'].forEach(id => {
        setMetric(id, '—');
    });
    const bar = document.getElementById('risk-bar-fill');
    if (bar) { bar.style.width = '0%'; }
}

function setMetric(id, value, className) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.className = 'metric-value';
    if (className) el.classList.add(className);
}

window.MetricsPanel = { update: updateMetrics, reset: resetMetrics };
