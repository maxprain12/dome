/* eslint-disable no-console */
/**
 * Additional AI tool implementations for LangGraph (main process only).
 * Keeps ai-tools-handler.cjs smaller; required from there.
 */
const fs = require('fs');
const path = require('path');
const database = require('./database.cjs');
const bundledCatalog = require('./marketplace-bundled-catalog.cjs');
const marketplaceIpc = require('./ipc/marketplace.cjs');
const marketplaceConfig = require('./marketplace-config.cjs');
const browserContextService = require('./browser-context-service.cjs');
const cropImage = require('./crop-image.cjs');
const { sanitizePath } = require('./security.cjs');

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeWorkflowNodeType(type) {
  if (typeof type !== 'string') return 'text-input';
  const normalized = type.trim().toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'text' || normalized === 'textinput' || normalized === 'input') return 'text-input';
  if (normalized === 'doc' || normalized === 'document' || normalized === 'documents') return 'document';
  if (normalized === 'img' || normalized === 'picture') return 'image';
  if (normalized === 'llm') return 'agent';
  if (normalized === 'result') return 'output';
  if (['text-input', 'document', 'image', 'agent', 'output'].includes(normalized)) return normalized;
  return 'text-input';
}

function normalizeWorkflowNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node, index) => {
    if (!node || typeof node !== 'object') return node;
    const record = node;
    const data = record.data && typeof record.data === 'object' ? { ...record.data } : {};
    const normalizedType = normalizeWorkflowNodeType(record.type ?? data.type);
    return {
      ...record,
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `node-${index + 1}`,
      type: normalizedType,
      position: record.position && typeof record.position === 'object'
        ? record.position
        : { x: 100 + index * 40, y: 100 },
      data: {
        ...data,
        type: normalizedType,
      },
    };
  });
}

async function loadAllCatalogAgents() {
  const bundled = bundledCatalog.loadBundledAgentsFull();
  let remote = [];
  try {
    remote = await marketplaceIpc.fetchAgents(marketplaceConfig.DEFAULT_SOURCES);
  } catch {
    remote = [];
  }
  const byId = new Map();
  for (const a of bundled) {
    if (a && typeof a.id === 'string') byId.set(a.id, a);
  }
  for (const a of remote) {
    if (a && typeof a.id === 'string' && !byId.has(a.id)) byId.set(a.id, a);
  }
  return Array.from(byId.values());
}

async function loadAllCatalogWorkflows() {
  const bundled = bundledCatalog.loadBundledWorkflowsFull();
  let remote = [];
  try {
    remote = await marketplaceIpc.fetchWorkflows(marketplaceConfig.DEFAULT_SOURCES);
  } catch {
    remote = [];
  }
  const byId = new Map();
  for (const w of bundled) {
    if (w && typeof w.id === 'string') byId.set(w.id, w);
  }
  for (const w of remote) {
    if (w && typeof w.id === 'string' && !byId.has(w.id)) byId.set(w.id, w);
  }
  return Array.from(byId.values());
}

function agentInstalledMap() {
  const q = database.getQueries();
  const projectId = 'default';
  const rows = q.listManyAgents.all(projectId) || [];
  /** @type {Record<string, boolean>} */
  const byMp = {};
  for (const row of rows) {
    if (row.marketplace_id) byMp[row.marketplace_id] = true;
  }
  return byMp;
}

function workflowInstalledMap() {
  const q = database.getQueries();
  const rows = q.listCanvasWorkflows.all('default') || [];
  /** @type {Record<string, boolean>} */
  const byTpl = {};
  for (const row of rows) {
    if (row.marketplace_json) {
      try {
        const m = JSON.parse(row.marketplace_json);
        if (m && typeof m.templateId === 'string') byTpl[m.templateId] = true;
      } catch { /* ignore */ }
    }
  }
  return byTpl;
}

async function marketplaceSearch(args = {}) {
  const query = String(args.query || '').toLowerCase().trim();
  const type = String(args.type || 'all').toLowerCase();
  const agents =
    type === 'workflows' ? [] : (await loadAllCatalogAgents()).filter((a) => {
      if (!query) return true;
      const t = `${a.name || ''} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
      return t.includes(query);
    });
  const workflows =
    type === 'agents' ? [] : (await loadAllCatalogWorkflows()).filter((w) => {
      if (!query) return true;
      const t = `${w.name || ''} ${w.description || ''} ${(w.tags || []).join(' ')}`.toLowerCase();
      return t.includes(query);
    });

  const agInst = agentInstalledMap();
  const wfInst = workflowInstalledMap();

  return {
    status: 'success',
    query: args.query || '',
    type,
    agents: agents.slice(0, 15).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      author: a.author,
      tags: a.tags || [],
      isInstalled: !!agInst[a.id],
    })),
    workflows: workflows.slice(0, 15).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      author: w.author,
      tags: w.tags || [],
      isInstalled: !!wfInst[w.id],
    })),
  };
}

async function marketplaceInstall(args = {}) {
  const marketplaceId = String(args.marketplaceId || args.marketplace_id || '').trim();
  const kind = String(args.type || '').toLowerCase();
  if (!marketplaceId) return { status: 'error', error: 'marketplaceId is required' };
  if (kind !== 'agent' && kind !== 'workflow') {
    return { status: 'error', error: 'type must be "agent" or "workflow"' };
  }

  const queries = database.getQueries();
  const now = Date.now();
  const projectId = typeof args.project_id === 'string' && args.project_id.trim()
    ? args.project_id.trim()
    : 'default';

  if (kind === 'agent') {
    const agents = await loadAllCatalogAgents();
    const template = agents.find((a) => a.id === marketplaceId);
    if (!template) return { status: 'error', error: `Agent not found in catalog: ${marketplaceId}` };

    const name = String(template.name || 'Agent').trim();
    const description = String(template.description || '');
    const systemInstructions = String(template.systemInstructions || template.system_instructions || '');
    const toolIds = Array.isArray(template.toolIds) ? template.toolIds : [];
    const mcpServerIds = Array.isArray(template.mcpServerIds) ? template.mcpServerIds : [];
    const skillIds = Array.isArray(template.skillIds) ? template.skillIds : [];
    const iconIndex = typeof template.iconIndex === 'number' ? Math.max(1, Math.min(18, template.iconIndex)) : Math.floor(Math.random() * 18) + 1;
    const version = String(template.version || '1.0.0');
    const author = String(template.author || 'Unknown');
    const source = template.source === 'community' ? 'community' : 'official';

    const existingRows = queries.listManyAgents.all(projectId) || [];
    const existingByMp = existingRows.find((r) => r.marketplace_id === marketplaceId);
    const existingByName = existingRows.find((r) => !r.marketplace_id && r.name === name);

    let agentId;
    if (existingByMp) {
      agentId = existingByMp.id;
      queries.updateManyAgent.run(
        projectId,
        name,
        description,
        systemInstructions,
        JSON.stringify(toolIds),
        JSON.stringify(mcpServerIds),
        JSON.stringify(skillIds),
        iconIndex,
        marketplaceId,
        existingByMp.folder_id,
        existingByMp.favorite,
        now,
        agentId,
      );
    } else if (existingByName) {
      agentId = existingByName.id;
      queries.updateManyAgent.run(
        projectId,
        name,
        description,
        systemInstructions,
        JSON.stringify(toolIds),
        JSON.stringify(mcpServerIds),
        JSON.stringify(skillIds),
        iconIndex,
        marketplaceId,
        existingByName.folder_id,
        existingByName.favorite,
        now,
        agentId,
      );
    } else {
      agentId = generateId();
      queries.createManyAgent.run(
        agentId,
        projectId,
        name,
        description,
        systemInstructions,
        JSON.stringify(toolIds),
        JSON.stringify(mcpServerIds),
        JSON.stringify(skillIds),
        iconIndex,
        marketplaceId,
        null,
        0,
        now,
        now,
      );
    }

    queries.upsertMarketplaceAgentInstall.run(
      marketplaceId,
      agentId,
      version,
      author,
      source,
      now,
      now,
      '[]',
      '[]',
    );

    const payload = {
      entityType: 'agent',
      id: agentId,
      name,
      description,
      config: { source: 'marketplace', marketplaceId },
    };
    return `ENTITY_CREATED:${JSON.stringify(payload)}`;
  }

  const workflows = await loadAllCatalogWorkflows();
  const template = workflows.find((w) => w.id === marketplaceId);
  if (!template) return { status: 'error', error: `Workflow not found in catalog: ${marketplaceId}` };

  const wfName = String(template.name || 'Workflow').trim();
  const wfDescription = String(template.description || '');
  const nodes = normalizeWorkflowNodes(Array.isArray(template.nodes) ? template.nodes : []);
  const edges = Array.isArray(template.edges) ? template.edges : [];
  const marketplaceJson = JSON.stringify({
    templateId: marketplaceId,
    version: String(template.version || '1.0.0'),
    author: String(template.author || 'Unknown'),
    source: template.source === 'community' ? 'community' : 'official',
    capabilities: [],
    resourceAffinity: [],
  });

  const rows = queries.listCanvasWorkflows.all(projectId) || [];
  let wfRow = rows.find((r) => {
    if (!r.marketplace_json) return false;
    try {
      const m = JSON.parse(r.marketplace_json);
      return m && m.templateId === marketplaceId;
    } catch {
      return false;
    }
  });
  let workflowId;
  if (wfRow) {
    workflowId = wfRow.id;
    queries.updateCanvasWorkflow.run(
      projectId,
      wfName,
      wfDescription,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      marketplaceJson,
      wfRow.folder_id,
      now,
      workflowId,
    );
  } else {
    workflowId = generateId();
    queries.createCanvasWorkflow.run(
      workflowId,
      projectId,
      wfName,
      wfDescription,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      marketplaceJson,
      null,
      now,
      now,
    );
  }

  queries.upsertMarketplaceWorkflowInstall.run(
    marketplaceId,
    workflowId,
    String(template.version || '1.0.0'),
    String(template.author || 'Unknown'),
    template.source === 'community' ? 'community' : 'official',
    now,
    now,
    '[]',
    '[]',
  );

  const payload = {
    entityType: 'workflow',
    id: workflowId,
    name: wfName,
    description: wfDescription,
    config: { source: 'marketplace', marketplaceId },
  };
  return `ENTITY_CREATED:${JSON.stringify(payload)}`;
}

async function browserGetActiveTab() {
  return browserContextService.getActiveBrowserTabMacOS();
}

async function workflowCreate(args = {}, windowManagerRef) {
  const queries = database.getQueries();
  const name = String(args.name || '').trim();
  if (!name) return { status: 'error', error: 'name is required' };
  const description = String(args.description || '');
  const nodes = normalizeWorkflowNodes(Array.isArray(args.nodes) ? args.nodes : []);
  const edges = Array.isArray(args.edges) ? args.edges : [];
  const projectId = typeof args.project_id === 'string' && args.project_id.trim()
    ? args.project_id.trim()
    : 'default';
  const now = Date.now();
  const workflowId = generateId();
  queries.createCanvasWorkflow.run(
    workflowId,
    projectId,
    name,
    description,
    JSON.stringify(nodes),
    JSON.stringify(edges),
    null,
    null,
    now,
    now,
  );
  if (windowManagerRef) {
    windowManagerRef.broadcast('dome:workflows-changed');
  }
  const payload = {
    entityType: 'workflow',
    id: workflowId,
    name,
    description,
    config: { nodos: nodes.length, conexiones: edges.length },
  };
  return `ENTITY_CREATED:${JSON.stringify(payload)}`;
}

async function imageCropForTool(args = {}) {
  const rawPath = args.imagePath || args.image_path || args.filePath || args.file_path;
  if (!rawPath || typeof rawPath !== 'string') return { status: 'error', error: 'imagePath is required' };
  let filePath;
  try {
    filePath = sanitizePath(rawPath, true);
  } catch (e) {
    return { status: 'error', error: e.message || 'Invalid path' };
  }
  if (!filePath || !fs.existsSync(filePath)) return { status: 'error', error: 'File not found' };
  const x = Number(args.x) || 0;
  const y = Number(args.y) || 0;
  const width = Number(args.width);
  const height = Number(args.height);
  const format = (args.format || 'jpeg').toString().toLowerCase();
  const quality = Math.max(1, Math.min(100, Number(args.quality) || 90));
  const maxWidth = args.maxWidth != null ? Number(args.maxWidth) : undefined;
  const maxHeight = args.maxHeight != null ? Number(args.maxHeight) : undefined;
  return cropImage.cropImage(filePath, { x, y, width, height, format, quality, maxWidth, maxHeight });
}

async function imageThumbnailForTool(args = {}) {
  const rawPath = args.imagePath || args.image_path || args.filePath || args.file_path;
  if (!rawPath || typeof rawPath !== 'string') return { status: 'error', error: 'imagePath is required' };
  let filePath;
  try {
    filePath = sanitizePath(rawPath, true);
  } catch (e) {
    return { status: 'error', error: e.message || 'Invalid path' };
  }
  if (!filePath || !fs.existsSync(filePath)) return { status: 'error', error: 'File not found' };
  const maxWidth = Number(args.width || args.maxWidth) || 256;
  const maxHeight = Number(args.height || args.maxHeight) || 256;
  const format = (args.format || 'jpeg').toString().toLowerCase();
  const quality = Math.max(1, Math.min(100, Number(args.quality) || 85));
  return cropImage.generateThumbnail(filePath, { maxWidth, maxHeight, format, quality });
}

async function gatherStudioMindmapContext(args = {}, resourceGetFn, resourceListFn) {
  const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
  const topic = typeof args.topic === 'string' ? args.topic : '';
  const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.filter((x) => typeof x === 'string') : [];
  const sourceContent = [];

  if (sourceIds.length > 0 && resourceGetFn) {
    for (const sourceId of sourceIds) {
      try {
        const result = await resourceGetFn(sourceId, { includeContent: true, maxContentLength: 5000 });
        if (result?.success && result.resource) {
          sourceContent.push({
            id: result.resource.id,
            title: result.resource.title,
            snippet: String(result.resource.content || result.resource.summary || '').slice(0, 500),
          });
        }
      } catch { /* skip */ }
    }
  } else if (projectId && resourceListFn && resourceGetFn) {
    const listResult = await resourceListFn({ project_id: projectId, limit: 10, sort: 'updated_at' });
    if (listResult?.success && Array.isArray(listResult.resources)) {
      for (const r of listResult.resources) {
        try {
          const result = await resourceGetFn(r.id, { includeContent: true, maxContentLength: 5000 });
          if (result?.success && result.resource) {
            sourceContent.push({
              id: result.resource.id,
              title: result.resource.title,
              snippet: String(result.resource.content || result.resource.summary || '').slice(0, 500),
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  return {
    status: 'success',
    message:
      'Source content gathered for mind map generation. Return a structured mind map (nodes/edges) or use artifact:diagram in follow-up.',
    topic: topic || 'General overview',
    source_count: sourceContent.length,
    sources: sourceContent,
    output_format: {
      type: 'mindmap',
      schema: {
        nodes: '[{ id: string, label: string, description?: string }]',
        edges: '[{ id: string, source: string, target: string, label?: string }]',
      },
    },
  };
}

async function gatherStudioQuizContext(args = {}, resourceGetFn, resourceListFn) {
  const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
  const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.filter((x) => typeof x === 'string') : [];
  const numQuestions = Math.max(1, Math.min(20, Math.floor(Number(args.num_questions) || 5)));
  const difficulty = ['easy', 'medium', 'hard'].includes(String(args.difficulty || '').toLowerCase())
    ? String(args.difficulty).toLowerCase()
    : 'medium';

  const sourceContent = [];

  if (sourceIds.length > 0 && resourceGetFn) {
    for (const sourceId of sourceIds) {
      try {
        const result = await resourceGetFn(sourceId, { includeContent: true, maxContentLength: 8000 });
        if (result?.success && result.resource) {
          sourceContent.push({
            id: result.resource.id,
            title: result.resource.title,
            content: String(
              result.resource.content || result.resource.transcription || result.resource.summary || '',
            ).slice(0, 3000),
          });
        }
      } catch { /* skip */ }
    }
  } else if (projectId && resourceListFn && resourceGetFn) {
    const listResult = await resourceListFn({ project_id: projectId, limit: 5, sort: 'updated_at' });
    if (listResult?.success && Array.isArray(listResult.resources)) {
      for (const r of listResult.resources) {
        try {
          const result = await resourceGetFn(r.id, { includeContent: true, maxContentLength: 5000 });
          if (result?.success && result.resource) {
            sourceContent.push({
              id: result.resource.id,
              title: result.resource.title,
              content: String(
                result.resource.content || result.resource.transcription || result.resource.summary || '',
              ).slice(0, 3000),
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  if (sourceContent.length === 0) {
    return {
      status: 'error',
      error: 'No source content found. Specify source_ids or project_id with resources.',
    };
  }

  return {
    status: 'success',
    message: `Source content gathered for quiz. Generate ${numQuestions} questions at ${difficulty} difficulty.`,
    num_questions: numQuestions,
    difficulty,
    source_count: sourceContent.length,
    sources: sourceContent,
    output_format: {
      type: 'quiz',
      schema: {
        questions:
          '[{ id: string, type: "multiple_choice" | "true_false", question: string, options?: string[], correct: number, explanation: string }]',
      },
    },
  };
}

module.exports = {
  marketplaceSearch,
  marketplaceInstall,
  browserGetActiveTab,
  workflowCreate,
  imageCropForTool,
  imageThumbnailForTool,
  gatherStudioMindmapContext,
  gatherStudioQuizContext,
};
