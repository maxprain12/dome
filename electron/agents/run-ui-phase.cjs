'use strict';

/**
 * Authoritative UI phase labels for agent runs (main process → renderer via runs:chunk type:phase).
 */

const UI_PHASES = Object.freeze([
  'queued',
  'starting',
  'thinking',
  'tool_running',
  'tool_progress',
  'generating',
  'compacting',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

const LABEL_KEY_BY_PHASE = Object.freeze({
  queued: 'chat.processing',
  starting: 'chat.thinking_evaluating_tools',
  thinking: 'chat.thinking',
  tool_running: 'chat.tool_running',
  tool_progress: 'chat.tool_running',
  generating: 'chat.generating_response',
  compacting: 'chat.compacting_context',
  waiting_approval: 'chat.waiting_approval',
  completed: 'chat.processing',
  failed: 'chat.processing',
  cancelled: 'chat.processing',
});

/** Map incoming legacy chunk types to a UI phase (null = no transition). */
function phaseFromChunkType(chunkType) {
  switch (chunkType) {
    case 'budget':
      return 'starting';
    case 'thinking':
      return 'thinking';
    case 'text':
      return 'generating';
    case 'tool_call':
      return 'tool_running';
    case 'tool_progress':
      return 'tool_progress';
    case 'compaction':
      return 'compacting';
    case 'interrupt':
      return 'waiting_approval';
    case 'error':
      return 'failed';
    case 'done':
      return 'completed';
    default:
      return null;
  }
}

function labelKeyForPhase(phase, detail) {
  if (phase === 'tool_running' && typeof detail === 'string' && detail.trim()) {
    return null;
  }
  return LABEL_KEY_BY_PHASE[phase] ?? 'chat.processing';
}

function isUiPhase(value) {
  return typeof value === 'string' && UI_PHASES.includes(value);
}

module.exports = {
  UI_PHASES,
  LABEL_KEY_BY_PHASE,
  phaseFromChunkType,
  labelKeyForPhase,
  isUiPhase,
};
