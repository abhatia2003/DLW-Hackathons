(function () {
  const STORAGE_KEY = 'codexmap-solution-architecture-v1';

  const modelCatalog = [
    {
      id: 'reasoning',
      label: 'Reasoning Planner',
      role: 'Turns requirements into workflows, plans, and implementation steps.',
      tags: ['planning', 'reasoning', 'workflow'],
    },
    {
      id: 'multimodal',
      label: 'Multimodal OCR',
      role: 'Reads PDFs, diagrams, screenshots, and document-heavy inputs.',
      tags: ['ocr', 'pdf', 'vision', 'documents'],
    },
    {
      id: 'retrieval',
      label: 'Retrieval Embeddings',
      role: 'Indexes chunks for search and RAG lookups across uploaded context.',
      tags: ['rag', 'retrieval', 'embedding', 'vector'],
    },
    {
      id: 'automation',
      label: 'Automation Agent',
      role: 'Handles asynchronous jobs, background orchestration, and queued work.',
      tags: ['queue', 'worker', 'jobs', 'automation'],
    },
  ];

  const componentCatalog = [
    { id: 'client', label: 'Client App', icon: '◧', shape: 'rect', nodeType: 'component', tags: ['client', 'frontend', 'ui'] },
    { id: 'gateway', label: 'API Gateway', icon: '⬣', shape: 'hex', nodeType: 'api', tags: ['gateway', 'api', 'edge'] },
    { id: 'service', label: 'Service', icon: '▣', shape: 'rect', nodeType: 'service', tags: ['service', 'backend', 'app'] },
    { id: 'agent', label: 'Agent Orchestrator', icon: '✦', shape: 'pill', nodeType: 'component', tags: ['agent', 'planner', 'orchestrator', 'reasoning'] },
    { id: 'worker', label: 'Worker', icon: '⟲', shape: 'rect', nodeType: 'component', tags: ['worker', 'job', 'async', 'automation'] },
    { id: 'queue', label: 'Queue', icon: '≋', shape: 'pill', nodeType: 'component', tags: ['queue', 'async', 'buffer'] },
    { id: 'cache', label: 'Cache', icon: '◌', shape: 'pill', nodeType: 'component', tags: ['cache', 'latency', 'performance'] },
    { id: 'database', label: 'Database', icon: '⛁', shape: 'database', nodeType: 'database', tags: ['database', 'storage', 'query'] },
    { id: 'vector', label: 'Vector Store', icon: '◎', shape: 'database', nodeType: 'database', tags: ['vector', 'retrieval', 'rag', 'embedding'] },
    { id: 'storage', label: 'Blob Storage', icon: '⬡', shape: 'rect', nodeType: 'component', tags: ['storage', 'documents', 'files'] },
    { id: 'ocr', label: 'OCR Pipeline', icon: '⌘', shape: 'rect', nodeType: 'component', tags: ['ocr', 'pdf', 'vision', 'extract'] },
    { id: 'monitor', label: 'Observability', icon: '◫', shape: 'rect', nodeType: 'component', tags: ['observability', 'metrics', 'logs', 'tracing'] },
    { id: 'auth', label: 'Auth Layer', icon: '⎈', shape: 'pill', nodeType: 'component', tags: ['auth', 'token', 'oauth', 'identity'] },
    { id: 'policy', label: 'Policy Control', icon: '⚖', shape: 'pill', nodeType: 'policy', tags: ['policy', 'constraint', 'governance'] },
    { id: 'team', label: 'Owning Team', icon: '☷', shape: 'rect', nodeType: 'team', tags: ['team', 'ownership'] },
    { id: 'feature', label: 'Feature Slice', icon: '✚', shape: 'rect', nodeType: 'feature', tags: ['feature', 'roadmap', 'delivery'] },
    { id: 'note', label: 'Note', icon: '✎', shape: 'note', nodeType: 'component', tags: ['note', 'docs'] },
  ];

  const frontierFocus = {
    c7: ['cache', 'observability', 'worker', 'storage', 'retrieval'],
    c10: ['auth', 'gateway', 'client', 'agent', 'token'],
    c12: ['database', 'queue', 'cache', 'worker', 'vector', 'query'],
  };

  function createEmptyDiagram() {
    return {
      version: 1,
      updatedAt: null,
      nodes: [],
      edges: [],
      selectedModels: ['reasoning', 'retrieval'],
      source: 'manual',
      agentNotes: [],
    };
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadDiagram() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDiagram();
    const parsed = safeParse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return createEmptyDiagram();
    return {
      version: 1,
      updatedAt: parsed.updatedAt || null,
      nodes: parsed.nodes,
      edges: parsed.edges,
      selectedModels: Array.isArray(parsed.selectedModels) ? parsed.selectedModels : ['reasoning', 'retrieval'],
      source: parsed.source || 'manual',
      agentNotes: Array.isArray(parsed.agentNotes) ? parsed.agentNotes : [],
    };
  }

  function saveDiagram(diagram) {
    const next = {
      version: 1,
      updatedAt: new Date().toISOString(),
      nodes: Array.isArray(diagram.nodes) ? diagram.nodes : [],
      edges: Array.isArray(diagram.edges) ? diagram.edges : [],
      selectedModels: Array.isArray(diagram.selectedModels) ? diagram.selectedModels : ['reasoning', 'retrieval'],
      source: diagram.source || 'manual',
      agentNotes: Array.isArray(diagram.agentNotes) ? diagram.agentNotes : [],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function clearDiagram() {
    window.localStorage.removeItem(STORAGE_KEY);
    return createEmptyDiagram();
  }

  function getComponentTemplate(componentId) {
    return componentCatalog.find(component => component.id === componentId) || componentCatalog[0];
  }

  function createNode(componentId, x, y, overrides) {
    const template = getComponentTemplate(componentId);
    return {
      id: overrides && overrides.id ? overrides.id : `node-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      componentId: template.id,
      label: overrides && overrides.label ? overrides.label : template.label,
      icon: template.icon,
      shape: template.shape,
      nodeType: overrides && overrides.nodeType ? overrides.nodeType : template.nodeType,
      tags: [...template.tags],
      x,
      y,
      width: template.shape === 'note' ? 160 : 146,
      height: template.shape === 'database' ? 86 : template.shape === 'note' ? 120 : 82,
      metadata: overrides && overrides.metadata ? overrides.metadata : {},
    };
  }

  function deriveThemeNames(context) {
    if (!context || !Array.isArray(context.corpusThemes)) return [];
    return context.corpusThemes.map(theme => String(theme.name).toLowerCase());
  }

  function hasTheme(context, themeKeyword) {
    return deriveThemeNames(context).some(theme => theme.includes(themeKeyword));
  }

  function hasPdf(context) {
    return !!(context && Array.isArray(context.docs) && context.docs.some(doc => doc.kind === 'pdf'));
  }

  function hasCsv(context) {
    return !!(context && Array.isArray(context.docs) && context.docs.some(doc => doc.kind === 'csv'));
  }

  function generateSuggestedDesign(context, options) {
    const selectedModels = options && Array.isArray(options.selectedModels) && options.selectedModels.length
      ? options.selectedModels
      : ['reasoning', 'retrieval', 'multimodal'];

    const nodes = [];
    const edges = [];
    const notes = [];

    const pushNode = (componentId, x, y, overrides) => {
      const node = createNode(componentId, x, y, overrides);
      nodes.push(node);
      return node;
    };
    const connect = (from, to, label) => {
      edges.push({
        id: `edge-${from.id}-${to.id}`,
        from: from.id,
        to: to.id,
        label: label || '',
      });
    };

    const team = pushNode('team', 70, 700, { label: 'Platform Team' });
    const feature = pushNode('feature', 70, 120, { label: 'Architecture Alignment MVP' });
    const client = pushNode('client', 300, 120);
    const gateway = pushNode('gateway', 500, 120);
    const planner = pushNode('agent', 720, 110, { label: 'Codex Planner' });
    const service = pushNode('service', 950, 120, { label: 'Solution API' });
    const storage = pushNode('storage', 950, 320);
    const vector = pushNode('vector', 1180, 320);
    const monitor = pushNode('monitor', 1180, 110);

    connect(team, feature, 'owns');
    connect(feature, planner, 'guides');
    connect(client, gateway, 'requests');
    connect(gateway, planner, 'intent');
    connect(planner, service, 'actions');
    connect(service, storage, 'documents');
    connect(service, vector, 'chunks');
    connect(service, monitor, 'telemetry');

    if (selectedModels.includes('multimodal') || hasPdf(context)) {
      const ocr = pushNode('ocr', 720, 320);
      connect(storage, ocr, 'pdf pages');
      connect(ocr, vector, 'ocr text');
      notes.push('Route uploaded PDFs through OCR before chunking when embedded text is missing.');
    }

    if (selectedModels.includes('retrieval') || hasCsv(context)) {
      const retriever = pushNode('service', 1180, 520, { label: 'RAG Retriever' });
      connect(vector, retriever, 'semantic search');
      connect(retriever, planner, 'grounded context');
      notes.push('Keep document chunks and architecture metadata in the same retrieval path so planning stays grounded.');
    }

    if (selectedModels.includes('automation')) {
      const queue = pushNode('queue', 720, 520);
      const worker = pushNode('worker', 950, 520, { label: 'Async Worker' });
      connect(planner, queue, 'jobs');
      connect(queue, worker, 'events');
      connect(worker, storage, 'processed artifacts');
      notes.push('Use asynchronous workers for OCR, indexing, and design-generation workloads.');
    }

    if (hasTheme(context, 'auth')) {
      const auth = pushNode('auth', 500, 320);
      connect(gateway, auth, 'identity');
      connect(auth, service, 'session claims');
      notes.push('Context points to auth-heavy work, so the suggested design isolates the identity path.');
    }

    if (hasTheme(context, 'latency') || hasTheme(context, 'cache')) {
      const cache = pushNode('cache', 1180, 700);
      connect(service, cache, 'hot reads');
      notes.push('The uploaded corpus mentions latency or caching, so the design reserves a cache tier for critical reads.');
    }

    if (hasTheme(context, 'compliance') || hasTheme(context, 'docs')) {
      const policy = pushNode('policy', 300, 520, { label: 'Policy Constraints' });
      connect(policy, planner, 'constraints');
      notes.push('Compliance-heavy context should be represented explicitly so the planner does not ignore policy constraints.');
    }

    if (selectedModels.includes('reasoning')) {
      const designAgent = pushNode('agent', 500, 700, { label: 'Design Agent' });
      connect(vector, designAgent, 'evidence');
      connect(designAgent, planner, 'recommended architecture');
      notes.push('A reasoning agent synthesizes uploaded docs into solution options before implementation planning.');
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      nodes,
      edges,
      selectedModels,
      source: 'generated',
      agentNotes: notes,
    };
  }

  function summarizeDiagram(diagram) {
    const active = diagram && Array.isArray(diagram.nodes) ? diagram : loadDiagram();
    const tags = new Map();
    active.nodes.forEach(node => {
      (node.tags || []).forEach(tag => tags.set(tag, (tags.get(tag) || 0) + 1));
    });
    const hotspots = Array.from(tags.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([tag, score]) => ({ tag, score }));

    return {
      nodeCount: active.nodes.length,
      edgeCount: active.edges.length,
      source: active.source || 'manual',
      selectedModels: active.selectedModels || [],
      updatedAt: active.updatedAt,
      hotspots,
    };
  }

  function exportDiagram(diagram, options) {
    const active = diagram && Array.isArray(diagram.nodes) ? diagram : loadDiagram();
    const summary = summarizeDiagram(active);
    const contextSummary = options && options.contextSummary ? options.contextSummary : null;

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: active.source || 'manual',
      updatedAt: active.updatedAt || null,
      summary: {
        nodeCount: summary.nodeCount,
        edgeCount: summary.edgeCount,
        selectedModels: summary.selectedModels,
        hotspots: summary.hotspots,
      },
      context: contextSummary,
      selectedModels: Array.isArray(active.selectedModels) ? active.selectedModels : [],
      agentNotes: Array.isArray(active.agentNotes) ? active.agentNotes : [],
      nodes: active.nodes.map(node => ({
        id: node.id,
        componentId: node.componentId || null,
        label: node.label,
        icon: node.icon || null,
        shape: node.shape || null,
        nodeType: node.nodeType || null,
        tags: Array.isArray(node.tags) ? node.tags : [],
        position: {
          x: node.x,
          y: node.y,
        },
        size: {
          width: node.width,
          height: node.height,
        },
        metadata: node.metadata || {},
      })),
      edges: active.edges.map(edge => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label || '',
      })),
    };
  }

  function getArchitectureGuidance(diagram, frontierNode) {
    const active = diagram && Array.isArray(diagram.nodes) ? diagram : loadDiagram();
    if (!frontierNode || !frontierFocus[frontierNode.id] || !active.nodes.length) return [];

    const focus = frontierFocus[frontierNode.id];
    const scoredNodes = active.nodes
      .map(node => {
        const text = `${node.label} ${(node.tags || []).join(' ')}`.toLowerCase();
        const score = focus.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
        return { node, score };
      })
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 2);

    return scoredNodes.map(item => ({
      type: frontierNode.id === 'c10' ? 'feat' : frontierNode.id === 'c12' ? 'refactor' : 'fix',
      risk: item.score >= 3 ? 'med' : 'low',
      title: `Align next step with ${item.node.label}`,
      desc: `The saved architecture includes ${item.node.label}. Use that component boundary to scope the next change on ${frontierNode.hash}.`,
      source: 'architecture',
      score: item.score,
    }));
  }

  function buildNextSteps(diagram, context) {
    const activeDiagram = diagram && Array.isArray(diagram.nodes) ? diagram : loadDiagram();
    const steps = [];
    const hasRetriever = activeDiagram.nodes.some(node => (node.tags || []).includes('retrieval') || (node.tags || []).includes('vector'));
    const hasDocumentPipeline = activeDiagram.nodes.some(node => (node.tags || []).includes('ocr') || (node.tags || []).includes('documents'));
    const hasAgent = activeDiagram.nodes.some(node => (node.tags || []).includes('agent'));

    if (hasDocumentPipeline) {
      steps.push('Wire document ingestion into OCR and chunking so uploaded PDFs become searchable architecture evidence.');
    }
    if (hasRetriever) {
      steps.push('Connect the diagram components to the retrieval layer so planning and frontier proposals are grounded in the same corpus.');
    }
    if (hasAgent) {
      steps.push('Define the handoff between the design agent and the implementation planner so architecture choices flow into next-step recommendations.');
    }
    if (context && Array.isArray(context.docs) && context.docs.length) {
      steps.push(`Map the ${context.docs.length} uploaded context document${context.docs.length === 1 ? '' : 's'} onto services, data stores, and governance controls in the diagram.`);
    }

    return steps.slice(0, 4);
  }

  window.CodexSolutionArchitect = {
    STORAGE_KEY,
    buildNextSteps,
    clearDiagram,
    componentCatalog: clone(componentCatalog),
    createEmptyDiagram,
    createNode,
    generateSuggestedDesign,
    exportDiagram,
    getArchitectureGuidance,
    loadDiagram,
    modelCatalog: clone(modelCatalog),
    saveDiagram,
    summarizeDiagram,
  };
}());
