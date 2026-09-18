'use strict';

const crypto = require('node:crypto');
const { powerSaveBlocker } = require('electron');
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');
const { startAgentRun, abortRun, resumeRun, getRun } = require('../agents/run-engine.cjs');
const { subscribeRunEvents } = require('../agents/run-listeners.cjs');
const { listPublicSessions, buildCapabilities, getPublicSession, modelLabel } = require('./many-public.cjs');
const { isCommandType } = require('./protocol.cjs');
const { extractRemoteVisual } = require('./visuals.cjs');
const { listPublicRefs, normalizePins, normalizeSkills, normalizeMcp } = require('./refs.cjs');
const { previewPublicRef, parseResourceHref } = require('./preview.cjs');
const { exportPublicRefChunk } = require('./export.cjs');
const { buildSkillPromptOverlay, prependSystemOverlay } = require('./skill-overlay.cjs');
const {
  parseManyAgentMode,
  filterToolDefinitionsForMode,
  applyAgentModeToMessages,
} = require('../agents/many-agent-mode.cjs');
const {
  extractPlanDocument,
  markCompletedSteps,
  publicApprovalPayload,
  publicPlanPayload,
  resumeDecisionsFromRemotePayload,
} = require('../agents/many-plan.cjs');

const activeByThread = new Map();
const modeByThread = new Map();
const planByThread = new Map();
let blockerId = null;
let blockerCount = 0;

function publishPlanProgress(publishEvent, meta) {
  const text = meta?.text || '';
  const mode = parseManyAgentMode(meta?.agentMode);
  const document = extractPlanDocument(text);
  let todos = planByThread.get(meta.threadId) || [];
  let phase = 'choose';
  if (mode === 'plan') {
    if (document?.todos?.length) todos = document.todos;
  } else if (todos.length > 0) {
    todos = markCompletedSteps(text, todos);
    phase = 'executing';
  }
  if (todos.length === 0) return;
  planByThread.set(meta.threadId, todos);
  publishEvent({
    type: 'plan',
    threadId: meta.threadId,
    runId: meta.runId,
    pairingId: meta.pairingId,
    targetDeviceId: meta.targetDeviceId,
    payload: publicPlanPayload(todos, phase, document),
  });
}

function startBlocker() {
  blockerCount += 1;
  if (blockerId == null) {
    try {
      blockerId = powerSaveBlocker.start('prevent-app-suspension');
    } catch {
      blockerId = null;
    }
  }
}

function stopBlocker() {
  blockerCount = Math.max(0, blockerCount - 1);
  if (blockerCount === 0 && blockerId != null) {
    try {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
    } catch {
      /* ignore */
    }
    blockerId = null;
  }
}

function mapChunk(chunk) {
  if (!chunk || typeof chunk !== 'object') return null;
  switch (chunk.type) {
    case 'text':
      return { type: 'text', payload: { text: chunk.text || '' } };
    case 'thinking':
    case 'tool_progress':
    case 'phase':
      return null;
    case 'tool_call':
      return { type: 'tool_call', payload: { toolCall: chunk.toolCall, agentName: chunk.agentName || null } };
    case 'tool_result': {
      const toolName = chunk.toolName || chunk.toolCall?.name || null;
      return {
        type: 'tool_result',
        payload: {
          toolCallId: chunk.toolCallId,
          toolName,
          isError: Boolean(chunk.isError),
          visual: chunk.isError ? null : extractRemoteVisual(toolName, chunk.result),
        },
      };
    }
    case 'interrupt':
      return {
        type: 'approval',
        payload: publicApprovalPayload({
          kind: chunk.kind,
          actionRequests: chunk.actionRequests,
          pendingToolCall: chunk.pendingToolCall,
        }),
      };
    case 'error':
      return { type: 'error', payload: { error: chunk.error || 'run_failed' } };
    case 'done':
      return { type: 'done', payload: {} };
    default:
      return null;
  }
}

function createExecutor({ database, publishEvent }) {
  const runMeta = new Map();

  subscribeRunEvents((channel, payload) => {
    if (channel === 'runs:chunk') {
      const meta = runMeta.get(payload?.runId);
      if (!meta) return;
      if (payload?.type === 'text' && payload.text) {
        meta.text = `${meta.text || ''}${payload.text}`;
      }
      const mapped = mapChunk(payload);
      if (!mapped) return;
      publishEvent({
        ...mapped,
        threadId: meta.threadId,
        runId: payload.runId,
        pairingId: meta.pairingId,
        targetDeviceId: meta.targetDeviceId,
      });
      return;
    }
    if (channel === 'runs:updated') {
      const run = payload?.run;
      const meta = run ? runMeta.get(run.id) : null;
      if (!meta || !run) return;
      if (run.status === 'waiting_approval') {
        publishEvent({
          type: 'approval',
          threadId: meta.threadId,
          runId: run.id,
          pairingId: meta.pairingId,
          targetDeviceId: meta.targetDeviceId,
          payload: publicApprovalPayload({
            ...(run.metadata?.pendingApproval || {}),
            runId: run.id,
          }),
        });
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        publishEvent({
          type: 'run.status',
          threadId: meta.threadId,
          runId: run.id,
          pairingId: meta.pairingId,
          targetDeviceId: meta.targetDeviceId,
          payload: { status: run.status, error: run.error || null },
        });
      }
      if (run.status === 'completed') {
        publishPlanProgress(publishEvent, meta);
      }
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        runMeta.delete(run.id);
        activeByThread.delete(meta.threadId);
        stopBlocker();
      }
    }
  });

  async function handleCommand(command, ctx) {
    if (!command || !isCommandType(command.type)) {
      throw new Error('unknown_command');
    }
    const pairingId = ctx.pairingId;
    const targetDeviceId = ctx.targetDeviceId;
    const projectId = command.payload?.projectId || 'default';

    if (command.type === 'capabilities.request') {
      return {
        type: 'capabilities',
        pairingId,
        targetDeviceId,
        payload: await buildCapabilities(database, { includeModels: true }),
      };
    }

    if (command.type === 'model.set') {
      const model = String(command.payload?.model || '').trim();
      if (!model) throw new Error('model_required');
      const queries = database.getQueries();
      queries.setSetting.run('ai_model', model, Date.now());
      const caps = await buildCapabilities(database, { includeModels: true });
      return {
        type: 'capabilities',
        pairingId,
        targetDeviceId,
        payload: { ...caps, model, modelLabel: modelLabel(model) },
      };
    }

    if (command.type === 'session.list') {
      const listed = await listPublicSessions();
      return {
        type: 'session.list',
        pairingId,
        targetDeviceId,
        payload: listed,
      };
    }

    if (command.type === 'session.get') {
      const threadId = command.threadId || command.payload?.threadId;
      const loaded = await getPublicSession(threadId);
      return {
        type: 'session.list',
        threadId: loaded.threadId,
        pairingId,
        targetDeviceId,
        payload: loaded,
      };
    }

    if (command.type === 'session.start') {
      const threadId = command.payload?.threadId || crypto.randomUUID();
      return {
        type: 'session.list',
        threadId,
        pairingId,
        targetDeviceId,
        payload: { started: true, threadId },
      };
    }

    if (command.type === 'run.cancel') {
      const runId = command.payload?.runId || activeByThread.get(command.threadId)?.runId;
      if (runId) abortRun(runId);
      return {
        type: 'run.status',
        threadId: command.threadId,
        runId,
        pairingId,
        targetDeviceId,
        payload: { status: 'cancelled' },
      };
    }

    if (command.type === 'run.resume' || command.type === 'approval.decide') {
      const runId = command.payload?.runId;
      if (!runId) throw new Error('runId_required');
      const run = await resumeRun(runId, resumeDecisionsFromRemotePayload(command.payload));
      return {
        type: 'run.status',
        threadId: command.threadId || run?.threadId,
        runId,
        pairingId,
        targetDeviceId,
        payload: { status: run?.status || 'running' },
      };
    }

    if (command.type === 'refs.list') {
      const listed = await listPublicRefs(database, command.payload?.query);
      return {
        type: 'refs',
        pairingId,
        targetDeviceId,
        payload: listed,
      };
    }

    if (command.type === 'refs.preview') {
      const resourceId = parseResourceHref(command.payload?.href)
        || String(command.payload?.resourceId || command.payload?.id || '').trim();
      const preview = await previewPublicRef(database, resourceId);
      if (!preview) throw new Error('preview_unavailable');
      return {
        type: 'refs',
        pairingId,
        targetDeviceId,
        payload: { preview },
      };
    }

    if (command.type === 'refs.export') {
      const resourceId = parseResourceHref(command.payload?.href)
        || String(command.payload?.resourceId || command.payload?.id || '').trim();
      const offset = Math.max(0, Math.floor(Number(command.payload?.offset) || 0));
      const file = exportPublicRefChunk(database, { resourceId, offset });
      if (!file) {
        return {
          type: 'refs',
          pairingId,
          targetDeviceId,
          payload: { file: { error: 'unavailable', viewable: false } },
        };
      }
      return {
        type: 'refs',
        pairingId,
        targetDeviceId,
        payload: { file },
      };
    }

    if (command.type === 'mode.set') {
      const mode = parseManyAgentMode(command.payload?.mode);
      if (command.threadId) modeByThread.set(command.threadId, mode);
      const caps = await buildCapabilities(database, { includeModels: true });
      return {
        type: 'capabilities',
        threadId: command.threadId,
        pairingId,
        targetDeviceId,
        payload: { ...caps, agentMode: mode },
      };
    }

    if (command.type === 'message.send') {
      const pins = normalizePins(command.payload?.pinnedResources);
      const skills = normalizeSkills(command.payload?.skills);
      const text = String(command.payload?.text || '').trim();
      if (!text && pins.length === 0 && skills.length === 0) throw new Error('empty_message');
      const threadId = command.threadId || command.payload?.threadId || crypto.randomUUID();
      const agentMode = parseManyAgentMode(command.payload?.mode || modeByThread.get(threadId));
      modeByThread.set(threadId, agentMode);
      const mcpServerIds = normalizeMcp(command.payload?.mcpServerIds);
      const toolDefinitions = filterToolDefinitionsForMode(getAllToolDefinitions(), agentMode);
      const userText = text || (pins.length > 0 ? 'Analyze the pinned context.' : 'Follow the attached skills.');
      let messages = applyAgentModeToMessages(
        [{ role: 'user', content: userText, pinnedResources: pins, skills }],
        agentMode,
      );
      messages = prependSystemOverlay(messages, await buildSkillPromptOverlay(skills));
      startBlocker();
      const run = await startAgentRun({
        ownerType: 'many',
        ownerId: threadId,
        title: text.slice(0, 80) || 'Many',
        messages,
        toolDefinitions,
        mcpServerIds,
        threadId,
        projectId,
        skipHitl: false,
        agentMode,
      });
      runMeta.set(run.id, {
        threadId,
        pairingId,
        targetDeviceId,
        agentMode,
        text: '',
        runId: run.id,
      });
      activeByThread.set(threadId, { runId: run.id });
      return {
        type: 'start',
        threadId,
        runId: run.id,
        pairingId,
        targetDeviceId,
        payload: { runId: run.id, threadId, status: run.status },
      };
    }

    return getRun(command.payload?.runId) || null;
  }

  return { handleCommand };
}

module.exports = { createExecutor, mapChunk };
