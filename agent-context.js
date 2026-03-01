(function () {
  const STORAGE_KEY = 'codexmap-agent-context-v1';
  const MAX_TEXT_LENGTH = 18000;
  const CHUNK_SIZE = 260;
  const CHUNK_OVERLAP = 48;
  const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'had', 'has', 'have',
    'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'there', 'they',
    'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your', 'after', 'before', 'during', 'using', 'use',
    'via', 'than', 'then', 'them', 'can', 'could', 'would', 'should', 'also', 'about', 'over', 'under',
    'across', 'per', 'api', 'http', 'https', 'www', 'com'
  ]);

  const THEME_CATALOG = [
    { name: 'Auth & Identity', keywords: ['auth', 'oauth', 'session', 'token', 'pkce', 'identity', 'login', 'jwt'] },
    { name: 'Cache & Memory', keywords: ['cache', 'memory', 'eviction', 'heap', 'redis', 'leak'] },
    { name: 'Latency & Performance', keywords: ['latency', 'query', 'throughput', 'perf', 'performance', 'index', 'slow', 'p95'] },
    { name: 'Observability', keywords: ['trace', 'tracing', 'metric', 'metrics', 'logging', 'log', 'telemetry', 'alert'] },
    { name: 'Reliability', keywords: ['incident', 'error', 'retry', 'failure', 'availability', 'sla', 'timeout'] },
    { name: 'Compliance & Docs', keywords: ['policy', 'compliance', 'doc', 'docs', 'documentation', 'audit', 'runbook'] },
    { name: 'Testing & QA', keywords: ['test', 'tests', 'qa', 'regression', 'coverage', 'validation'] },
  ];

  function createEmptyContext() {
    return {
      version: 1,
      updatedAt: null,
      docs: [],
      corpusThemes: [],
      totalChunks: 0,
    };
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function loadContext() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyContext();
    const parsed = safeJsonParse(raw);
    if (!parsed || !Array.isArray(parsed.docs)) return createEmptyContext();
    return {
      version: 1,
      updatedAt: parsed.updatedAt || null,
      docs: parsed.docs,
      corpusThemes: Array.isArray(parsed.corpusThemes) ? parsed.corpusThemes : [],
      totalChunks: Number(parsed.totalChunks) || parsed.docs.reduce((sum, doc) => sum + (doc.chunks || []).length, 0),
    };
  }

  function saveContext(context) {
    const nextContext = {
      version: 1,
      updatedAt: context.updatedAt || new Date().toISOString(),
      docs: context.docs || [],
      corpusThemes: context.corpusThemes || [],
      totalChunks: Number(context.totalChunks) || 0,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextContext));
    return nextContext;
  }

  function clearContext() {
    window.localStorage.removeItem(STORAGE_KEY);
    return createEmptyContext();
  }

  function inferExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function inferDocumentKind(file) {
    const extension = inferExtension(file.name);
    if (extension === 'csv') return 'csv';
    if (extension === 'pdf') return 'pdf';
    if (extension === 'json') return 'json';
    if (['txt', 'md', 'markdown', 'log'].includes(extension)) return 'text';
    return 'text';
  }

  function normalizeWhitespace(text) {
    return String(text || '')
      .replace(/\u0000/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function shorten(text, length) {
    const normalized = normalizeWhitespace(text);
    if (normalized.length <= length) return normalized;
    return `${normalized.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
  }

  function tokenize(text) {
    return normalizeWhitespace(text)
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9/_-]{1,}/g) || [];
  }

  function deriveKeywords(text, limit = 8) {
    const counts = new Map();
    tokenize(text).forEach(token => {
      if (STOPWORDS.has(token) || token.length < 3) return;
      counts.set(token, (counts.get(token) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([token]) => token);
  }

  function splitCsvLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  function summarizeCsv(text) {
    const lines = normalizeWhitespace(text).split('\n').filter(Boolean);
    if (!lines.length) {
      return {
        text: 'CSV uploaded with no readable rows.',
        metadata: { rows: 0, columns: 0, headers: [] },
      };
    }

    const headers = splitCsvLine(lines[0]);
    const rows = lines.slice(1, 7).map(splitCsvLine);
    const previewRows = rows.map((row, rowIndex) => headers.map((header, columnIndex) => `${header || `column_${columnIndex + 1}`}: ${row[columnIndex] || ''}`).join(' | '));
    const summaryText = [
      `CSV dataset with ${Math.max(lines.length - 1, 0)} data rows and ${headers.length} columns.`,
      headers.length ? `Headers: ${headers.join(', ')}.` : 'No headers detected.',
      previewRows.length ? `Sample rows: ${previewRows.join(' || ')}.` : 'No sample rows available.',
    ].join(' ');

    return {
      text: shorten(summaryText, MAX_TEXT_LENGTH),
      metadata: {
        rows: Math.max(lines.length - 1, 0),
        columns: headers.length,
        headers,
      },
    };
  }

  function extractPdfText(buffer) {
    const bytes = new Uint8Array(buffer);
    let decoded = '';
    try {
      decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (error) {
      decoded = '';
    }
    if (!decoded.trim()) {
      decoded = new TextDecoder('latin1').decode(bytes);
    }

    const parentheticalBlocks = Array.from(decoded.matchAll(/\(([^()]{20,})\)/g)).map(match => match[1]);
    const textRuns = decoded.match(/[A-Za-z0-9][A-Za-z0-9,.;:%()/_\- \n]{28,}/g) || [];
    const extracted = normalizeWhitespace([...parentheticalBlocks, ...textRuns].join('\n')).slice(0, MAX_TEXT_LENGTH);

    return {
      text: extracted || 'No embedded PDF text was extractable in-browser. The prototype would route this file to OCR before retrieval.',
      mode: extracted ? 'embedded-text-preview' : 'ocr-required',
      pageEstimate: Math.max(1, Math.round(bytes.length / 52000)),
    };
  }

  function chunkText(text) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
      const chunkTextValue = normalized.slice(start, start + CHUNK_SIZE);
      const cleanChunk = chunkTextValue.trim();
      if (cleanChunk) {
        chunks.push({
          id: `chunk-${chunks.length + 1}`,
          text: cleanChunk,
          keywords: deriveKeywords(cleanChunk, 6),
        });
      }
      if (start + CHUNK_SIZE >= normalized.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
  }

  async function extractDocument(file) {
    const kind = inferDocumentKind(file);
    if (kind === 'csv') {
      const raw = await file.text();
      const summary = summarizeCsv(raw);
      return {
        kind,
        extractedText: summary.text,
        metadata: summary.metadata,
        pipeline: {
          ocr: 'not-needed',
          retrieval: 'chunked',
          extractor: 'csv-preview',
        },
      };
    }

    if (kind === 'pdf') {
      const buffer = await file.arrayBuffer();
      const extracted = extractPdfText(buffer);
      return {
        kind,
        extractedText: extracted.text,
        metadata: {
          pageEstimate: extracted.pageEstimate,
        },
        pipeline: {
          ocr: extracted.mode === 'ocr-required' ? 'queued' : 'preview-complete',
          retrieval: 'chunked',
          extractor: extracted.mode,
        },
      };
    }

    const raw = await file.text();
    return {
      kind,
      extractedText: shorten(raw, MAX_TEXT_LENGTH),
      metadata: {},
      pipeline: {
        ocr: 'not-needed',
        retrieval: 'chunked',
        extractor: 'plain-text',
      },
    };
  }

  function deriveCorpusThemes(docs) {
    const tokenCounts = new Map();
    docs.forEach(doc => {
      const keywords = new Set([...(doc.keywords || []), ...((doc.chunks || []).flatMap(chunk => chunk.keywords || []))]);
      keywords.forEach(keyword => {
        tokenCounts.set(keyword, (tokenCounts.get(keyword) || 0) + 1);
      });
    });

    const themeScores = THEME_CATALOG.map(theme => ({
      name: theme.name,
      score: theme.keywords.reduce((score, keyword) => score + (tokenCounts.get(keyword) || 0), 0),
    })).filter(theme => theme.score > 0);

    if (themeScores.length) {
      return themeScores.sort((left, right) => right.score - left.score).slice(0, 5);
    }

    return Array.from(tokenCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, score]) => ({ name, score }));
  }

  async function processFile(file) {
    const extraction = await extractDocument(file);
    const chunks = chunkText(extraction.extractedText);
    const keywords = deriveKeywords(extraction.extractedText, 10);

    return {
      id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: file.name,
      extension: inferExtension(file.name),
      kind: extraction.kind,
      size: file.size,
      addedAt: new Date().toISOString(),
      excerpt: shorten(extraction.extractedText, 180),
      extractedText: extraction.extractedText,
      metadata: extraction.metadata,
      pipeline: extraction.pipeline,
      keywords,
      chunks,
    };
  }

  async function ingestFiles(files, existingContext) {
    const workingContext = existingContext ? {
      version: 1,
      updatedAt: existingContext.updatedAt || null,
      docs: Array.isArray(existingContext.docs) ? [...existingContext.docs] : [],
      corpusThemes: Array.isArray(existingContext.corpusThemes) ? [...existingContext.corpusThemes] : [],
      totalChunks: Number(existingContext.totalChunks) || 0,
    } : loadContext();

    const processedDocs = [];
    const fileList = Array.from(files || []);

    for (const file of fileList) {
      const processed = await processFile(file);
      workingContext.docs.unshift(processed);
      processedDocs.push(processed);
    }

    workingContext.updatedAt = new Date().toISOString();
    workingContext.totalChunks = workingContext.docs.reduce((sum, doc) => sum + (doc.chunks || []).length, 0);
    workingContext.corpusThemes = deriveCorpusThemes(workingContext.docs);
    saveContext(workingContext);

    return {
      context: workingContext,
      processedDocs,
    };
  }

  function removeDocument(docId, existingContext) {
    const workingContext = existingContext ? { ...existingContext, docs: [...existingContext.docs] } : loadContext();
    workingContext.docs = workingContext.docs.filter(doc => doc.id !== docId);
    workingContext.totalChunks = workingContext.docs.reduce((sum, doc) => sum + (doc.chunks || []).length, 0);
    workingContext.corpusThemes = deriveCorpusThemes(workingContext.docs);
    workingContext.updatedAt = new Date().toISOString();
    saveContext(workingContext);
    return workingContext;
  }

  function queryContext(context, queryText, options) {
    const activeContext = context && Array.isArray(context.docs) ? context : loadContext();
    const limit = options && options.limit ? options.limit : 3;
    const queryKeywords = deriveKeywords(queryText, 10);
    const loweredQuery = queryKeywords.join(' ');

    const results = [];
    activeContext.docs.forEach(doc => {
      (doc.chunks || []).forEach((chunk, index) => {
        const overlap = (chunk.keywords || []).filter(keyword => queryKeywords.includes(keyword));
        const lexicalHits = queryKeywords.reduce((score, keyword) => score + (chunk.text.toLowerCase().includes(keyword) ? 1 : 0), 0);
        const titleHits = queryKeywords.reduce((score, keyword) => score + (String(doc.name).toLowerCase().includes(keyword) ? 1 : 0), 0);
        const score = overlap.length * 5 + lexicalHits * 2 + titleHits;

        if (!score && loweredQuery && !chunk.text.toLowerCase().includes(loweredQuery)) return;

        results.push({
          docId: doc.id,
          docName: doc.name,
          kind: doc.kind,
          chunkId: chunk.id || `chunk-${index + 1}`,
          text: chunk.text,
          keywords: chunk.keywords || [],
          overlap,
          score: score || 1,
          pipeline: doc.pipeline,
        });
      });
    });

    return results
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  function summarizeContext(context) {
    const activeContext = context && Array.isArray(context.docs) ? context : loadContext();
    return {
      docCount: activeContext.docs.length,
      chunkCount: activeContext.totalChunks,
      themes: activeContext.corpusThemes || [],
      updatedAt: activeContext.updatedAt,
    };
  }

  window.CodexContextStore = {
    STORAGE_KEY,
    clearContext,
    createEmptyContext,
    ingestFiles,
    loadContext,
    queryContext,
    removeDocument,
    saveContext,
    summarizeContext,
  };
}());
