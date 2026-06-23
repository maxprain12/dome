'use client';

/**
 * Pipelines IPC client — thin wrapper over window.electron for the Kanban model.
 * Mirrors electron/ipc/agents/pipelines.cjs. All methods unwrap the
 * { success, data } envelope and throw on failure.
 */

import type {
  Pipeline,
  PipelineBundle,
  PipelineStage,
  PipelineItem,
  PipelineSource,
  PipelineItemEvent,
  CreatePipelineInput,
  CreateStageInput,
  CreateItemInput,
  CreateSourceInput,
} from './types';

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ensureElectron() {
  if (typeof window === 'undefined' || !window.electron?.invoke) {
    throw new Error('Electron no disponible');
  }
  return window.electron;
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const electron = ensureElectron();
  const result = (await electron.invoke(channel, payload)) as Result<T>;
  if (!result?.success) {
    throw new Error(result?.error || `Error invoking ${channel}`);
  }
  return result.data as T;
}

export const pipelinesClient = {
  // Pipelines
  list: (projectId: string) => invoke<Pipeline[]>('pipelines:list', projectId),
  get: (pipelineId: string) => invoke<PipelineBundle>('pipelines:get', pipelineId),
  create: (input: CreatePipelineInput) => invoke<Pipeline>('pipelines:create', input),
  update: (input: { id: string } & Partial<Pipeline>) => invoke<Pipeline>('pipelines:update', input),
  remove: (pipelineId: string) => invoke<void>('pipelines:delete', pipelineId),
  export: (pipelineId: string) =>
    invoke<{ filePath?: string; cancelled?: boolean }>('pipelines:export', pipelineId),
  import: (projectId: string) =>
    invoke<Pipeline | { cancelled: true }>('pipelines:import', projectId),

  // Stages
  listStages: (pipelineId: string) => invoke<PipelineStage[]>('pipelines:stages:list', pipelineId),
  createStage: (input: CreateStageInput) => invoke<PipelineStage>('pipelines:stages:create', input),
  updateStage: (input: { id: string } & Partial<PipelineStage>) =>
    invoke<PipelineStage>('pipelines:stages:update', input),
  reorderStages: (pipelineId: string, orderedStageIds: string[]) =>
    invoke<PipelineStage[]>('pipelines:stages:reorder', { pipelineId, orderedStageIds }),
  removeStage: (stageId: string) => invoke<void>('pipelines:stages:delete', stageId),

  // Items
  listItems: (pipelineId: string) => invoke<PipelineItem[]>('pipelines:items:list', { pipelineId }),
  createItem: (input: CreateItemInput) => invoke<PipelineItem>('pipelines:items:create', input),
  updateItem: (input: { id: string } & Partial<PipelineItem>) =>
    invoke<PipelineItem>('pipelines:items:update', input),
  moveItem: (id: string, toStageId: string, toPosition?: number) =>
    invoke<PipelineItem>('pipelines:items:move', { id, toStageId, toPosition }),
  getItem: (itemId: string) =>
    invoke<{ item: PipelineItem; stageTitle: string | null; pipelineName: string | null }>(
      'pipelines:items:get',
      itemId,
    ),
  runItem: (id: string) => invoke<PipelineItem>('pipelines:items:run', { id }),
  generateReport: (id: string) => invoke<{ runId: string }>('pipelines:items:generateReport', { id }),
  resolveItem: (id: string) => invoke<PipelineItem>('pipelines:items:resolve', { id }),
  removeItem: (itemId: string) => invoke<void>('pipelines:items:delete', itemId),

  // Item events (activity log)
  listItemEvents: (itemId: string) => invoke<PipelineItemEvent[]>('pipelines:items:listEvents', itemId),
  addItemEvent: (input: { itemId: string; eventType: string; actor?: string; summary?: string; detail?: Record<string, unknown>; runId?: string }) =>
    invoke<{ id: string }>('pipelines:items:addEvent', input),

  // Sources
  listSources: (pipelineId: string) => invoke<PipelineSource[]>('pipelines:sources:list', pipelineId),
  createSource: (input: CreateSourceInput) => invoke<PipelineSource>('pipelines:sources:create', input),
  updateSource: (input: { id: string } & Partial<PipelineSource>) =>
    invoke<PipelineSource>('pipelines:sources:update', input),
  removeSource: (sourceId: string) => invoke<void>('pipelines:sources:delete', sourceId),
  syncSource: (sourceId: string) => invoke<{ created: number }>('pipelines:sources:sync', sourceId),
};

type Unsub = () => void;

function on<T>(channel: string, cb: (payload: T) => void): Unsub {
  const electron = ensureElectron();
  return electron.on(channel, cb) as Unsub;
}

export const pipelinesEvents = {
  onPipelineUpdated: (cb: (p: { pipeline?: Pipeline; deletedId?: string }) => void) =>
    on('pipelines:updated', cb),
  onStageUpdated: (cb: (p: { stage?: PipelineStage; deletedId?: string; pipelineId?: string; reordered?: boolean }) => void) =>
    on('pipelines:stage:updated', cb),
  onItemUpdated: (cb: (p: { item?: PipelineItem; deletedId?: string; stageId?: string; movedFrom?: string }) => void) =>
    on('pipelines:item:updated', cb),
  onSourceUpdated: (cb: (p: { source?: PipelineSource; deletedId?: string; pipelineId?: string }) => void) =>
    on('pipelines:source:updated', cb),
  onReportReady: (
    cb: (p: { itemId: string; resourceId?: string; title?: string; runId?: string; error?: string }) => void,
  ) => on('pipelines:report:ready', cb),
};
