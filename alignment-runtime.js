(function () {
  const STORAGE_KEY = 'codexmap-alignment-runtime-v1';

  const RULE_DEFINITIONS = [
    {
      id: 'service_dependency_mismatch',
      label: 'Service dependency mismatch',
      weight: 24,
      description: 'A change introduces a dependency path that is not represented in the architecture graph.',
    },
    {
      id: 'architecture_boundary_violation',
      label: 'Architecture boundary violation',
      weight: 26,
      description: 'A change bypasses a required architecture boundary such as the gateway, agent, or approved service seams.',
    },
    {
      id: 'policy_constraint_breach',
      label: 'Policy constraint breach',
      weight: 22,
      description: 'A change conflicts with an active policy or governance rule.',
    },
    {
      id: 'unsupported_component_usage',
      label: 'Unsupported component usage',
      weight: 18,
      description: 'A change pulls in a component that is not supported by the architecture or platform policy.',
    },
    {
      id: 'orphan_feature_implementation',
      label: 'Orphan feature implementation',
      weight: 16,
      description: 'A feature is being implemented without a linked architecture feature or service ownership path.',
    },
  ];

  const CODE_INDEX = [
    {
      id: 'cache_module',
      file: 'src/cache/cache.js',
      module: 'cache-layer',
      summary: 'Shared cache abstraction with eviction hooks and telemetry wrappers.',
      tags: ['cache', 'memory', 'telemetry', 'service'],
      dependencies: ['metrics-sdk', 'storage-client'],
    },
    {
      id: 'gateway_auth',
      file: 'src/auth/oauth.ts',
      module: 'gateway-auth',
      summary: 'Gateway-managed OAuth entrypoint, PKCE enforcement, and token minting.',
      tags: ['auth', 'oauth', 'gateway', 'pkce', 'token'],
      dependencies: ['identity-sdk', 'session-store'],
    },
    {
      id: 'session_layer',
      file: 'src/auth/session-store.ts',
      module: 'session-store',
      summary: 'Session persistence and refresh-token handling for auth-v2.',
      tags: ['auth', 'session', 'token', 'storage'],
      dependencies: ['database-driver'],
    },
    {
      id: 'query_optimizer',
      file: 'src/db/query-optimizer.ts',
      module: 'query-optimizer',
      summary: 'Index-aware query optimization and latency guardrails for the perf branch.',
      tags: ['performance', 'query', 'index', 'database', 'latency'],
      dependencies: ['database-driver', 'cache-layer'],
    },
    {
      id: 'ingestion_worker',
      file: 'src/ingestion/worker.ts',
      module: 'ingestion-worker',
      summary: 'Background OCR, chunking, and indexing pipeline for uploaded documents.',
      tags: ['ocr', 'worker', 'retrieval', 'documents'],
      dependencies: ['queue-client', 'vector-sdk'],
    },
    {
      id: 'planner_agent',
      file: 'src/planner/codex-harness.ts',
      module: 'codex-harness',
      summary: 'Builds Codex invocations from architecture, code context, dependency maps, and risk rules.',
      tags: ['codex', 'planner', 'harness', 'risk', 'mcp'],
      dependencies: ['architecture-mcp', 'policy-mcp', 'code-context-mcp'],
    },
  ];

  const SCENARIOS = {
    c7: {
      id: 'scenario-cache-bypass',
      nodeId: 'c7',
      title: 'Cache fix bypasses observability wrapper',
      summary: 'A developer patches the cache leak directly in the cache module and introduces a local cache library that skips the shared telemetry path.',
      changedFiles: ['src/cache/cache.js', 'src/api/router.js'],
      changedComponents: ['Cache', 'Solution API'],
      introducedDependencies: ['local-lru'],
      unsupportedComponents: ['local-lru'],
      bypassedBoundaries: ['Observability'],
      featureLabel: 'Cache Leak Remediation',
      requiredPolicies: ['telemetry-required', 'approved-components-only'],
      desiredTags: ['cache', 'observability'],
    },
    c10: {
      id: 'scenario-auth-boundary',
      nodeId: 'c10',
      title: 'Mobile OAuth rollout bypasses gateway controls',
      summary: 'The implementation adds a direct client-side provider flow without the gateway-auth path and misses the PKCE policy requirement.',
      changedFiles: ['src/auth/oauth.ts', 'src/client/mobile-auth.ts'],
      changedComponents: ['Client App', 'Auth Layer'],
      introducedDependencies: ['oauth-widget'],
      unsupportedComponents: ['oauth-widget'],
      bypassedBoundaries: ['API Gateway'],
      featureLabel: 'Mobile Auth Rollout',
      requiredPolicies: ['gateway-auth-required', 'mobile-pkce-required'],
      desiredTags: ['auth', 'gateway', 'feature'],
    },
    c12: {
      id: 'scenario-perf-orphan',
      nodeId: 'c12',
      title: 'Performance spike lands without a governed feature slice',
      summary: 'A latency optimization branch adds a raw query adapter and cache tuning without a linked feature node, rollout guard, or approved performance service boundary.',
      changedFiles: ['src/db/query-optimizer.ts', 'src/perf/index.ts'],
      changedComponents: ['Database', 'Cache'],
      introducedDependencies: ['raw-sql-adapter'],
      unsupportedComponents: ['raw-sql-adapter'],
      bypassedBoundaries: ['Feature Governance'],
      featureLabel: 'Latency Reduction Spike',
      requiredPolicies: ['perf-rollout-guard', 'approved-components-only'],
      desiredTags: ['performance', 'database', 'feature'],
    },
  };

  const SYNTHETIC_FEATURES = [
    { id: 'feature-cache', label: 'Cache Leak Remediation', tags: ['feature', 'cache'], frontier: 'c7' },
    { id: 'feature-auth', label: 'Mobile Auth Rollout', tags: ['feature', 'auth'], frontier: 'c10' },
    { id: 'feature-perf', label: 'Latency Reduction Spike', tags: ['feature', 'performance'], frontier: 'c12' },
  ];

  function createEmptyState() {
    return {
      approvals: {},
      lastScenarioId: null,
      updatedAt: null,
    };
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function loadState() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed) return createEmptyState();
    return {
      approvals: parsed.approvals || {},
      lastScenarioId: parsed.lastScenarioId || null,
      updatedAt: parsed.updatedAt || null,
    };
  }

  function saveState(state) {
    const next = {
      approvals: state.approvals || {},
      lastScenarioId: state.lastScenarioId || null,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function getStores() {
    return {
      contextStore: window.CodexContextStore || null,
      architectStore: window.CodexSolutionArchitect || null,
    };
  }

  function loadContext() {
    const stores = getStores();
    return stores.contextStore ? stores.contextStore.loadContext() : { docs: [], corpusThemes: [], totalChunks: 0, updatedAt: null };
  }

  function loadDiagram() {
    const stores = getStores();
    return stores.architectStore ? stores.architectStore.loadDiagram() : { nodes: [], edges: [], selectedModels: [], agentNotes: [] };
  }

  function summarizeContext(context) {
    const stores = getStores();
    if (stores.contextStore) return stores.contextStore.summarizeContext(context);
    return { docCount: 0, chunkCount: 0, themes: [], updatedAt: null };
  }

  function deriveNodeType(node) {
    if (node.nodeType) return node.nodeType;
    if (node.componentId === 'gateway') return 'api';
    if (node.componentId === 'database' || node.componentId === 'vector') return 'database';
    if (node.componentId === 'policy') return 'policy';
    if (node.componentId === 'team') return 'team';
    if (node.componentId === 'feature') return 'feature';
    if (node.componentId === 'service') return 'service';
    return 'component';
  }

  function normalizeLabel(text) {
    return String(text || '').toLowerCase();
  }

  function inferPolicies(context, diagram) {
    const policies = [];
    const themeNames = (context.corpusThemes || []).map(theme => normalizeLabel(theme.name));
    const hasDiagramPolicy = diagram.nodes.some(node => deriveNodeType(node) === 'policy');

    policies.push({
      id: 'approved-components-only',
      label: 'Approved components only',
      severity: 'high',
      rule: 'Only components represented in the architecture graph or approved platform catalog may be introduced.',
    });

    if (themeNames.some(theme => theme.includes('auth'))) {
      policies.push({
        id: 'gateway-auth-required',
        label: 'Gateway-auth boundary required',
        severity: 'high',
        rule: 'Auth-related changes must traverse the API Gateway and Auth Layer components.',
      });
      policies.push({
        id: 'mobile-pkce-required',
        label: 'PKCE required for mobile',
        severity: 'medium',
        rule: 'Mobile auth flows must retain PKCE enforcement.',
      });
    }

    if (themeNames.some(theme => theme.includes('performance')) || themeNames.some(theme => theme.includes('cache'))) {
      policies.push({
        id: 'perf-rollout-guard',
        label: 'Performance rollout guard',
        severity: 'medium',
        rule: 'Performance-sensitive changes need an explicit feature slice and rollout constraint before merge.',
      });
      policies.push({
        id: 'telemetry-required',
        label: 'Telemetry required for cache path',
        severity: 'medium',
        rule: 'Cache and latency-sensitive paths must emit telemetry through the approved observability component.',
      });
    }

    if (context.docs.some(doc => doc.kind === 'pdf')) {
      policies.push({
        id: 'ocr-before-rag',
        label: 'OCR before retrieval',
        severity: 'medium',
        rule: 'PDF sources require OCR or embedded-text extraction before retrieval indexing.',
      });
    }

    if (!hasDiagramPolicy && context.docs.length) {
      policies.push({
        id: 'policy-node-required',
        label: 'Policy node required',
        severity: 'low',
        rule: 'At least one policy node should be represented in the architecture graph when governance documents are present.',
      });
    }

    return policies;
  }

  function buildGraphState(options) {
    const context = options && options.context ? options.context : loadContext();
    const diagram = options && options.diagram ? options.diagram : loadDiagram();
    const policies = inferPolicies(context, diagram);

    const nodes = diagram.nodes.map(node => ({
      id: node.id,
      label: node.label,
      nodeType: deriveNodeType(node),
      tags: node.tags || [],
      source: 'architecture',
      componentId: node.componentId,
    }));

    const edges = diagram.edges.map(edge => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      edgeType: 'communicates_with',
      label: edge.label || '',
      source: 'architecture',
    }));

    if (!nodes.some(node => node.nodeType === 'team')) {
      nodes.push({ id: 'team-platform', label: 'Platform Team', nodeType: 'team', tags: ['team', 'platform'], source: 'synthetic' });
    }

    SYNTHETIC_FEATURES.forEach(feature => {
      if (!nodes.some(node => normalizeLabel(node.label) === normalizeLabel(feature.label))) {
        nodes.push({
          id: feature.id,
          label: feature.label,
          nodeType: 'feature',
          tags: feature.tags,
          source: 'synthetic',
        });
        edges.push({
          id: `owned-by-${feature.id}`,
          from: feature.id,
          to: nodes.find(node => node.nodeType === 'team').id,
          edgeType: 'owned_by',
          label: 'owned_by',
          source: 'synthetic',
        });
      }
    });

    policies.forEach(policy => {
      nodes.push({
        id: `policy-${policy.id}`,
        label: policy.label,
        nodeType: 'policy',
        tags: ['policy', policy.id],
        source: 'policy',
      });
    });

    nodes.filter(node => node.nodeType === 'service' || node.nodeType === 'api' || node.nodeType === 'component' || node.nodeType === 'database')
      .forEach(node => {
        policies.forEach(policy => {
          if (policy.id === 'approved-components-only') return;
          edges.push({
            id: `constraint-${node.id}-${policy.id}`,
            from: node.id,
            to: `policy-${policy.id}`,
            edgeType: 'constrained_by',
            label: 'constrained_by',
            source: 'policy',
          });
        });
      });

    const summary = {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      policyCount: policies.length,
      docCount: context.docs.length,
      diagramNodeCount: diagram.nodes.length,
      updatedAt: new Date().toISOString(),
    };

    return { nodes, edges, policies, summary, context, diagram };
  }

  function queryComponents(graph, query) {
    const text = normalizeLabel(query || '');
    return graph.nodes.filter(node => {
      if (!text) return true;
      return normalizeLabel(node.label).includes(text) || (node.tags || []).some(tag => normalizeLabel(tag).includes(text));
    });
  }

  function fetchDependencies(graph, nodeId) {
    const directEdges = graph.edges.filter(edge => edge.from === nodeId);
    return directEdges.map(edge => {
      const target = graph.nodes.find(node => node.id === edge.to);
      return {
        edgeType: edge.edgeType,
        targetId: edge.to,
        targetLabel: target ? target.label : edge.to,
      };
    });
  }

  function validateBoundaries(graph, scenario) {
    const violations = [];
    if (!scenario) return violations;

    scenario.bypassedBoundaries.forEach(boundary => {
      const exists = graph.nodes.some(node => normalizeLabel(node.label).includes(normalizeLabel(boundary)) || (node.tags || []).some(tag => normalizeLabel(tag).includes(normalizeLabel(boundary))));
      if (exists) {
        violations.push({
          ruleId: 'architecture_boundary_violation',
          severity: 'high',
          title: `${boundary} boundary bypassed`,
          detail: `${scenario.title} should traverse ${boundary}, but the simulated commit bypasses that architecture boundary.`,
        });
      }
    });

    return violations;
  }

  function checkPolicyRules(graph, scenario) {
    const activePolicies = graph.policies;
    const breaches = [];
    if (!scenario) return { activePolicies, breaches };

    scenario.requiredPolicies.forEach(policyId => {
      const policy = activePolicies.find(item => item.id === policyId);
      if (policy) {
        breaches.push({
          ruleId: 'policy_constraint_breach',
          severity: policy.severity,
          title: `${policy.label} breached`,
          detail: `${scenario.title} conflicts with policy: ${policy.rule}`,
          policyId,
        });
      }
    });

    return { activePolicies, breaches };
  }

  function retrieveRelevantFiles(query) {
    const text = normalizeLabel(query || '');
    const queryTokens = text.split(/\s+/).filter(Boolean);
    return CODE_INDEX
      .map(entry => {
        const haystack = normalizeLabel(`${entry.file} ${entry.module} ${entry.summary} ${entry.tags.join(' ')}`);
        const score = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return { entry, score };
      })
      .filter(item => item.score > 0 || !queryTokens.length)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map(item => ({
        id: item.entry.id,
        file: item.entry.file,
        module: item.entry.module,
        summary: item.entry.summary,
        tags: item.entry.tags,
        dependencies: item.entry.dependencies,
        score: item.score,
      }));
  }

  function summarizeModules(files) {
    return files.map(file => ({
      file: file.file,
      module: file.module,
      summary: file.summary,
    }));
  }

  function detectUnsupportedComponents(graph, scenario) {
    const supportedTags = new Set(graph.nodes.flatMap(node => node.tags || []));
    return scenario.unsupportedComponents
      .filter(component => !supportedTags.has(component))
      .map(component => ({
        ruleId: 'unsupported_component_usage',
        severity: 'medium',
        title: `Unsupported component: ${component}`,
        detail: `${component} is not represented in the architecture graph or approved component catalog.`,
      }));
  }

  function detectDependencyMismatch(graph, scenario) {
    const labels = graph.nodes.map(node => normalizeLabel(node.label));
    return scenario.introducedDependencies
      .filter(dependency => !labels.some(label => label.includes(normalizeLabel(dependency))))
      .map(dependency => ({
        ruleId: 'service_dependency_mismatch',
        severity: 'medium',
        title: `Dependency mismatch: ${dependency}`,
        detail: `${scenario.title} introduces ${dependency}, but the dependency map does not include that service or component.`,
      }));
  }

  function detectOrphanFeature(graph, scenario) {
    const featureNode = graph.nodes.find(node => node.nodeType === 'feature' && normalizeLabel(node.label).includes(normalizeLabel(scenario.featureLabel)));
    if (featureNode) return [];
    return [{
      ruleId: 'orphan_feature_implementation',
      severity: 'medium',
      title: `Feature "${scenario.featureLabel}" is orphaned`,
      detail: 'The simulated commit changes code for a feature that is not represented in the architecture graph or owned by a team node.',
    }];
  }

  function computeViolationScores(violations) {
    const byRule = RULE_DEFINITIONS.map(rule => {
      const hits = violations.filter(violation => violation.ruleId === rule.id);
      return {
        ruleId: rule.id,
        label: rule.label,
        status: hits.length ? 'fail' : 'pass',
        score: hits.length ? Math.min(rule.weight, rule.weight - 2 + hits.length * 2) : 0,
        hits,
      };
    });

    const total = byRule.reduce((sum, item) => sum + item.score, 0);
    const severity = total >= 65 ? 'high' : total >= 28 ? 'medium' : 'low';
    return { total, severity, byRule };
  }

  function buildHarnessInvocation(graph, scenario, codeFiles, violations) {
    const architectureSnapshot = {
      services: graph.nodes.filter(node => node.nodeType === 'service').map(node => node.label),
      apis: graph.nodes.filter(node => node.nodeType === 'api').map(node => node.label),
      policies: graph.policies.map(policy => policy.label),
      feature: scenario.featureLabel,
    };

    return {
      architectureGraphContext: architectureSnapshot,
      architectureSnapshot,
      dependencyMap: {
        changedComponents: scenario.changedComponents,
        introducedDependencies: scenario.introducedDependencies,
        graphDependencies: scenario.changedComponents.map(component => queryComponents(graph, component).slice(0, 1)).flat().map(node => ({
          component: node.label,
          dependencies: fetchDependencies(graph, node.id),
        })),
      },
      riskRules: RULE_DEFINITIONS.map(rule => rule.label),
      policyConstraints: graph.policies.map(policy => ({
        id: policy.id,
        label: policy.label,
        rule: policy.rule,
      })),
      relevantCodeContext: summarizeModules(codeFiles),
      activeViolations: violations.map(violation => violation.title),
    };
  }

  function buildPatchPreview(scenario, violations) {
    const previewLines = [
      `// Scenario: ${scenario.title}`,
      `// Violations: ${violations.map(violation => violation.ruleId).join(', ') || 'none'}`,
      '',
    ];

    if (scenario.nodeId === 'c7') {
      previewLines.push(
        'import { telemetryWrap } from "./telemetry";',
        'import { sharedCache } from "./cache";',
        '',
        'export const patchCacheLeak = telemetryWrap(async function patchCacheLeak() {',
        '  return sharedCache.evictStaleEntries();',
        '});'
      );
    } else if (scenario.nodeId === 'c10') {
      previewLines.push(
        'export async function beginMobileOAuth(request) {',
        '  return gatewayAuth.startPkceFlow(request);',
        '}',
        '',
        '// direct client provider code removed'
      );
    } else {
      previewLines.push(
        'export async function runPerfOptimization(featureGuard) {',
        '  await featureGuard.assertEnabled("latency-reduction-spike");',
        '  return optimizer.optimizeWithApprovedAdapter();',
        '}'
      );
    }

    return previewLines.join('\n');
  }

  function buildFixProposal(graph, scenario, violations, codeFiles, risk) {
    const actions = [];

    if (violations.some(violation => violation.ruleId === 'architecture_boundary_violation')) {
      actions.push({
        type: 'refactor',
        title: 'Route the change back through the approved architecture boundary',
        detail: `Use the saved architecture graph to re-introduce ${scenario.bypassedBoundaries.join(', ')} into the implementation path.`,
      });
    }

    if (violations.some(violation => violation.ruleId === 'policy_constraint_breach')) {
      actions.push({
        type: 'patch',
        title: 'Patch the implementation to satisfy policy constraints',
        detail: 'Inject the required policy guardrails before generating or applying code changes.',
      });
    }

    if (violations.some(violation => violation.ruleId === 'unsupported_component_usage')) {
      actions.push({
        type: 'file_generation',
        title: 'Generate replacement integration using approved platform components',
        detail: 'Swap unsupported dependencies for a supported component from the architecture graph.',
      });
    }

    actions.push({
      type: 'code_task',
      title: 'Refresh relevant modules and dependency map for Codex',
      detail: `Attach ${codeFiles.length} relevant module summaries, the dependency map, and risk rules to the CLI harness.`,
    });

    if (risk.total >= 30) {
      actions.push({
        type: 'test_generation',
        title: 'Generate regression tests before merge',
        detail: 'Use the same harness context to generate coverage for the corrected implementation path.',
      });
    }

    return {
      summary: `Codex should fix ${scenario.title.toLowerCase()} with full architecture, code, and policy context attached.`,
      actions,
      patchPreview: buildPatchPreview(scenario, violations),
      approvalPrompt: 'Approve the patch proposal so the CLI harness can execute against the governed context.',
    };
  }

  function listMcpServers(graph, scenario, codeFiles, policyCheck, risk) {
    return [
      {
        id: 'architecture-mcp',
        name: 'Architecture MCP',
        capabilities: ['query components', 'fetch dependencies', 'validate boundaries'],
        lastResult: {
          matchedComponents: scenario.changedComponents.map(component => queryComponents(graph, component).length).reduce((sum, count) => sum + count, 0),
          dependencyLookups: scenario.changedComponents.length,
        },
      },
      {
        id: 'policy-mcp',
        name: 'Policy MCP',
        capabilities: ['check compliance rules', 'enforce constraints'],
        lastResult: {
          activePolicies: policyCheck.activePolicies.length,
          breaches: policyCheck.breaches.length,
        },
      },
      {
        id: 'code-context-mcp',
        name: 'Code Context MCP',
        capabilities: ['retrieve relevant files', 'summarize modules'],
        lastResult: {
          filesRetrieved: codeFiles.length,
          topModule: codeFiles[0] ? codeFiles[0].module : 'none',
        },
      },
      {
        id: 'risk-mcp',
        name: 'Risk MCP',
        capabilities: ['compute violation scores'],
        lastResult: {
          totalRisk: risk.total,
          severity: risk.severity,
        },
      },
    ];
  }

  function getScenarioByNodeId(nodeId) {
    return SCENARIOS[nodeId] || null;
  }

  function analyzeFrontierNode(nodeId) {
    const state = loadState();
    const scenario = getScenarioByNodeId(nodeId);
    if (!scenario) return null;

    const graph = buildGraphState();
    const boundaryViolations = validateBoundaries(graph, scenario);
    const policyCheck = checkPolicyRules(graph, scenario);
    const codeFiles = retrieveRelevantFiles(`${scenario.summary} ${scenario.changedFiles.join(' ')}`);
    const dependencyViolations = detectDependencyMismatch(graph, scenario);
    const unsupportedViolations = detectUnsupportedComponents(graph, scenario);
    const orphanViolations = detectOrphanFeature(graph, scenario);
    const violations = [
      ...boundaryViolations,
      ...policyCheck.breaches,
      ...dependencyViolations,
      ...unsupportedViolations,
      ...orphanViolations,
    ];
    const risk = computeViolationScores(violations);
    const harnessInvocation = buildHarnessInvocation(graph, scenario, codeFiles, violations);
    const codexProposal = buildFixProposal(graph, scenario, violations, codeFiles, risk);
    const approved = !!state.approvals[scenario.id];
    const serverOverview = {
      applicationServer: {
        mode: 'browser-simulated-node-runtime',
        responsibilities: ['graph orchestration', 'ingestion coordination', 'MCP fanout', 'Codex harness prep'],
      },
      mcpServers: listMcpServers(graph, scenario, codeFiles, policyCheck, risk),
    };

    return {
      scenario,
      graph,
      codeFiles,
      policyCheck,
      violations,
      risk,
      harnessInvocation,
      codexProposal,
      approved,
      alignmentStatus: approved ? 'restored' : violations.length ? 'misaligned' : 'aligned',
      ruleResults: risk.byRule,
      serverOverview,
    };
  }

  function approveScenario(nodeId) {
    const scenario = getScenarioByNodeId(nodeId);
    if (!scenario) return loadState();
    const state = loadState();
    state.approvals[scenario.id] = {
      approvedAt: new Date().toISOString(),
      nodeId,
    };
    state.lastScenarioId = scenario.id;
    return saveState(state);
  }

  function resetScenarioApproval(nodeId) {
    const scenario = getScenarioByNodeId(nodeId);
    if (!scenario) return loadState();
    const state = loadState();
    delete state.approvals[scenario.id];
    state.lastScenarioId = scenario.id;
    return saveState(state);
  }

  function getDemoFlow(nodeId) {
    const analysis = analyzeFrontierNode(nodeId);
    if (!analysis) return [];
    const graphSummary = analysis.graph.summary;
    return [
      { id: 'ingest', label: 'Ingest', status: graphSummary.docCount ? 'done' : 'waiting', detail: `${graphSummary.docCount} docs ingested into context.` },
      { id: 'studio', label: 'Architecture Studio', status: graphSummary.diagramNodeCount ? 'done' : 'waiting', detail: `${graphSummary.diagramNodeCount} architecture nodes in the diagram.` },
      { id: 'commit', label: 'Developer Commit', status: 'done', detail: analysis.scenario.title },
      { id: 'analysis', label: 'Codex Analysis', status: analysis.violations.length ? 'alert' : 'done', detail: `${analysis.violations.length} alignment issues detected.` },
      { id: 'proposal', label: 'Agent Fix Proposal', status: analysis.codexProposal.actions.length ? 'done' : 'waiting', detail: `${analysis.codexProposal.actions.length} proposed actions.` },
      { id: 'approval', label: 'Human Approval', status: analysis.approved ? 'done' : 'waiting', detail: analysis.approved ? 'Alignment restored.' : analysis.codexProposal.approvalPrompt },
    ];
  }

  function getJudgePitch() {
    return 'We built a human-governed Codex intelligence layer that keeps architecture, AI code generation, and cross-functional constraints continuously aligned.';
  }

  window.CodexAlignmentRuntime = {
    RULE_DEFINITIONS,
    STORAGE_KEY,
    analyzeFrontierNode,
    approveScenario,
    buildGraphState,
    getDemoFlow,
    getJudgePitch,
    getScenarioByNodeId,
    loadState,
    resetScenarioApproval,
  };
}());
