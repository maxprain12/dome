import { create } from 'zustand';
import { pipelinesClient, pipelinesEvents } from '@/lib/pipelines/client';
import { useAppStore } from '@/lib/store/useAppStore';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import type {
  Pipeline,
  PipelineStage,
  PipelineItem,
  PipelineSource,
  CreateStageInput,
  CreateItemInput,
  CreateSourceInput,
} from '@/lib/pipelines/types';

/** Lightweight executor options shown in the stage config selectors. */
export interface ExecutorOption {
  id: string;
  name: string;
}

function activeProjectId(): string {
  return useAppStore.getState().currentProject?.id ?? 'default';
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

/** Tracks in-flight run IPC calls to prevent duplicate agent launches. */
const runInFlight = new Set<string>();

interface PipelinesState {
  pipelines: Pipeline[];
  activePipelineId: string | null;
  stages: PipelineStage[];
  items: PipelineItem[];
  sources: PipelineSource[];

  agents: ExecutorOption[];
  workflows: ExecutorOption[];

  loadingList: boolean;
  loadingBoard: boolean;
  error: string | null;
  _subscribed: boolean;
  /** Optimistic run-in-flight ids (manual Ejecutar) until IPC/broadcast catches up. */
  runInFlightIds: Record<string, true>;

  init: () => Promise<void>;
  loadExecutors: () => Promise<void>;
  loadPipelines: () => Promise<void>;
  selectPipeline: (id: string) => Promise<void>;
  reloadActive: () => Promise<void>;

  createPipeline: (name: string) => Promise<Pipeline | null>;
  createPipelineWithStages: (
    name: string,
    stages: Array<{ title: string; executionPolicy?: PipelineStage['executionPolicy']; isTerminal?: boolean }>,
  ) => Promise<Pipeline | null>;
  renamePipeline: (id: string, name: string) => Promise<void>;
  deletePipeline: (id: string) => Promise<void>;
  exportPipeline: (id: string) => Promise<boolean>;
  importPipeline: () => Promise<Pipeline | null>;

  createStage: (input: Omit<CreateStageInput, 'pipelineId'>) => Promise<void>;
  updateStage: (input: { id: string } & Partial<PipelineStage>) => Promise<void>;
  reorderStages: (orderedStageIds: string[]) => Promise<void>;
  deleteStage: (stageId: string) => Promise<void>;

  createItem: (input: Omit<CreateItemInput, 'pipelineId'>) => Promise<void>;
  updateItem: (input: { id: string } & Partial<PipelineItem>) => Promise<void>;
  moveItem: (id: string, toStageId: string, toPosition?: number) => Promise<void>;
  runItem: (id: string) => Promise<void>;
  resolveItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;

  createSource: (input: Omit<CreateSourceInput, 'pipelineId'>) => Promise<void>;
  updateSource: (input: { id: string } & Partial<PipelineSource>) => Promise<void>;
  deleteSource: (id: string) => Promise<void>;
  syncSource: (id: string) => Promise<void>;
}

export const usePipelinesStore = create<PipelinesState>((set, get) => ({
  pipelines: [],
  activePipelineId: null,
  stages: [],
  items: [],
  sources: [],
  agents: [],
  workflows: [],
  loadingList: false,
  loadingBoard: false,
  error: null,
  _subscribed: false,
  runInFlightIds: {},

  loadExecutors: async () => {
    try {
      const projectId = activeProjectId();
      const [agents, workflows] = await Promise.all([getManyAgents(projectId), getWorkflows(projectId)]);
      set({
        agents: agents.map((a) => ({ id: a.id, name: a.name })),
        workflows: workflows.map((w) => ({ id: w.id, name: w.name })),
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  init: async () => {
    if (!get()._subscribed) {
      set({ _subscribed: true });
      // Live updates from the main process. Only apply events for the active pipeline.
      pipelinesEvents.onItemUpdated(handleItemUpdated);
      pipelinesEvents.onStageUpdated(handleStageUpdated);
      pipelinesEvents.onSourceUpdated(handleSourceUpdated);
      pipelinesEvents.onPipelineUpdated(() => {
        void get().loadPipelines();
      });
    }
    await Promise.all([get().loadPipelines(), get().loadExecutors()]);
    const { pipelines, activePipelineId } = get();
    // Re-runs when the active project changes (currentProject loads async on
    // boot). Keep a valid selection: if the active pipeline no longer belongs
    // to the freshly loaded list, select the first one (or clear the board).
    const stillValid = !!activePipelineId && pipelines.some((p) => p.id === activePipelineId);
    if (!stillValid) {
      if (pipelines.length > 0) {
        await get().selectPipeline(pipelines[0].id);
      } else {
        set({ activePipelineId: null, stages: [], items: [], sources: [] });
      }
    }
  },

  loadPipelines: async () => {
    set({ loadingList: true, error: null });
    try {
      const pipelines = await pipelinesClient.list(activeProjectId());
      set({ pipelines, loadingList: false });
    } catch (e) {
      set({ error: (e as Error).message, loadingList: false });
    }
  },

  selectPipeline: async (id: string) => {
    set({ activePipelineId: id, loadingBoard: true, error: null });
    try {
      const bundle = await pipelinesClient.get(id);
      set({
        stages: bundle.stages,
        items: bundle.items,
        sources: bundle.sources,
        loadingBoard: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loadingBoard: false });
    }
  },

  reloadActive: async () => {
    const id = get().activePipelineId;
    if (id) await get().selectPipeline(id);
  },

  createPipeline: async (name: string) => {
    try {
      const pipeline = await pipelinesClient.create({ projectId: activeProjectId(), name });
      set((s) => ({ pipelines: upsert(s.pipelines, pipeline) }));
      await get().selectPipeline(pipeline.id);
      return pipeline;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  createPipelineWithStages: async (name, stageSpecs) => {
    try {
      const pipeline = await pipelinesClient.create({ projectId: activeProjectId(), name });
      set((s) => ({ pipelines: upsert(s.pipelines, pipeline) }));
      // Create stages in order so positions are sequential.
      for (let i = 0; i < stageSpecs.length; i += 1) {
        const spec = stageSpecs[i];
        await pipelinesClient.createStage({
          pipelineId: pipeline.id,
          title: spec.title,
          position: i,
          executionPolicy: spec.executionPolicy ?? 'manual_resolve',
          isTerminal: spec.isTerminal ?? false,
        });
      }
      await get().loadPipelines();
      await get().selectPipeline(pipeline.id);
      return pipeline;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  renamePipeline: async (id, name) => {
    await pipelinesClient.update({ id, name });
    set((s) => ({ pipelines: s.pipelines.map((p) => (p.id === id ? { ...p, name } : p)) }));
  },

  deletePipeline: async (id) => {
    await pipelinesClient.remove(id);
    set((s) => {
      const pipelines = s.pipelines.filter((p) => p.id !== id);
      const wasActive = s.activePipelineId === id;
      return {
        pipelines,
        activePipelineId: wasActive ? (pipelines[0]?.id ?? null) : s.activePipelineId,
      };
    });
    const next = get().activePipelineId;
    if (next) await get().selectPipeline(next);
    else set({ stages: [], items: [], sources: [] });
  },

  exportPipeline: async (id) => {
    try {
      const res = await pipelinesClient.export(id);
      return !res?.cancelled;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  importPipeline: async () => {
    try {
      const res = await pipelinesClient.import(activeProjectId());
      if (!res || ('cancelled' in res && res.cancelled)) return null;
      const pipeline = res as Pipeline;
      set((s) => ({ pipelines: upsert(s.pipelines, pipeline) }));
      await get().selectPipeline(pipeline.id);
      return pipeline;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  createStage: async (input) => {
    const pipelineId = get().activePipelineId;
    if (!pipelineId) return;
    const stage = await pipelinesClient.createStage({ ...input, pipelineId });
    set((s) => ({ stages: upsert(s.stages, stage) }));
  },

  updateStage: async (input) => {
    const stage = await pipelinesClient.updateStage(input);
    set((s) => ({ stages: upsert(s.stages, stage) }));
  },

  reorderStages: async (orderedStageIds) => {
    const pipelineId = get().activePipelineId;
    if (!pipelineId) return;
    // optimistic
    set((s) => ({
      stages: s.stages
        .map((st) => ({ ...st, position: orderedStageIds.indexOf(st.id) }))
        .sort((a, b) => a.position - b.position),
    }));
    const stages = await pipelinesClient.reorderStages(pipelineId, orderedStageIds);
    set({ stages });
  },

  deleteStage: async (stageId) => {
    await pipelinesClient.removeStage(stageId);
    set((s) => ({
      stages: s.stages.filter((st) => st.id !== stageId),
      items: s.items.filter((i) => i.stageId !== stageId),
    }));
  },

  createItem: async (input) => {
    const pipelineId = get().activePipelineId;
    if (!pipelineId) return;
    const item = await pipelinesClient.createItem({ ...input, pipelineId });
    set((s) => ({ items: upsert(s.items, item) }));
  },

  updateItem: async (input) => {
    const item = await pipelinesClient.updateItem(input);
    set((s) => ({ items: upsert(s.items, item) }));
  },

  moveItem: async (id, toStageId, toPosition) => {
    const prev = get().items;
    const fromItem = prev.find((i) => i.id === id);
    const fromStageId = fromItem?.stageId;
    const targetStage = get().stages.find((s) => s.id === toStageId);
    const willAutoRun =
      Boolean(fromStageId && fromStageId !== toStageId && targetStage?.executionPolicy === 'auto_agent');

    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              stageId: toStageId,
              ...(willAutoRun ? { execStatus: 'running' as const } : null),
            }
          : i,
      ),
      runInFlightIds: willAutoRun ? { ...s.runInFlightIds, [id]: true } : s.runInFlightIds,
    }));
    try {
      const item = await pipelinesClient.moveItem(id, toStageId, toPosition);
      set((s) => {
        const merged = upsert(s.items, item);
        if (!willAutoRun) return { items: merged };
        return {
          items: merged.map((i) => (i.id === id ? { ...i, execStatus: 'running' } : i)),
        };
      });
    } catch (e) {
      set((s) => ({
        items: prev,
        runInFlightIds: (() => {
          if (!willAutoRun) return s.runInFlightIds;
          const next = { ...s.runInFlightIds };
          delete next[id];
          return next;
        })(),
        error: (e as Error).message,
      }));
    }
  },

  runItem: async (id) => {
    const existing = get().items.find((i) => i.id === id);
    if (existing?.execStatus === 'running') return;
    if (runInFlight.has(id)) return;

    const previousStatus = existing?.execStatus ?? 'pending';
    runInFlight.add(id);
    set((s) => ({
      runInFlightIds: { ...s.runInFlightIds, [id]: true },
      items: s.items.map((i) => (i.id === id ? { ...i, execStatus: 'running' } : i)),
    }));
    try {
      const item = await pipelinesClient.runItem(id);
      set((s) => {
        const merged = upsert(s.items, item);
        if (!s.runInFlightIds[id] || item.execStatus === 'running') return { items: merged };
        return {
          items: merged.map((i) => (i.id === id ? { ...i, execStatus: 'running' } : i)),
        };
      });
    } catch (e) {
      set((s) => {
        const runInFlightIds = { ...s.runInFlightIds };
        delete runInFlightIds[id];
        return {
          error: (e as Error).message,
          runInFlightIds,
          items: s.items.map((i) =>
            i.id === id ? { ...i, execStatus: previousStatus } : i,
          ),
        };
      });
      throw e;
    } finally {
      runInFlight.delete(id);
    }
  },

  resolveItem: async (id) => {
    const item = await pipelinesClient.resolveItem(id);
    set((s) => ({ items: upsert(s.items, item) }));
  },

  deleteItem: async (id) => {
    await pipelinesClient.removeItem(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  createSource: async (input) => {
    const pipelineId = get().activePipelineId;
    if (!pipelineId) return;
    const source = await pipelinesClient.createSource({ ...input, pipelineId });
    set((s) => ({ sources: upsert(s.sources, source) }));
  },

  updateSource: async (input) => {
    const source = await pipelinesClient.updateSource(input);
    set((s) => ({ sources: upsert(s.sources, source) }));
  },

  deleteSource: async (id) => {
    await pipelinesClient.removeSource(id);
    set((s) => ({ sources: s.sources.filter((src) => src.id !== id) }));
  },

  syncSource: async (id) => {
    try {
      await pipelinesClient.syncSource(id);
      await get().reloadActive();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));

/** Item event handler — keeps the board in sync with main-process broadcasts. */
function handleItemUpdated(p: {
  item?: PipelineItem;
  deletedId?: string;
  stageId?: string;
  movedFrom?: string;
}): void {
  const activeId = usePipelinesStore.getState().activePipelineId;
  if (p.deletedId) {
    usePipelinesStore.setState((s) => ({
      items: s.items.filter((i) => i.id !== p.deletedId),
    }));
    return;
  }
  if (p.item && p.item.pipelineId === activeId) {
    usePipelinesStore.setState((s) => {
      const runInFlightIds = { ...s.runInFlightIds };
      if (p.item!.execStatus === 'ready' || p.item!.execStatus === 'failed') {
        delete runInFlightIds[p.item!.id];
      }
      return {
        items: upsert(s.items, p.item!),
        runInFlightIds,
      };
    });
  }
}

/** Stage event handler — keeps the board in sync with main-process broadcasts. */
function handleStageUpdated(p: {
  stage?: PipelineStage;
  deletedId?: string;
  pipelineId?: string;
  reordered?: boolean;
}): void {
  const activeId = usePipelinesStore.getState().activePipelineId;
  if (p.deletedId) {
    usePipelinesStore.setState((s) => ({
      stages: s.stages.filter((st) => st.id !== p.deletedId),
    }));
    return;
  }
  if (p.reordered && p.pipelineId === activeId) {
    void usePipelinesStore.getState().reloadActive();
    return;
  }
  if (p.stage && p.stage.pipelineId === activeId) {
    usePipelinesStore.setState((s) => ({ stages: upsert(s.stages, p.stage!) }));
  }
}

/** Source event handler — keeps the board in sync with main-process broadcasts. */
function handleSourceUpdated(p: {
  source?: PipelineSource;
  deletedId?: string;
  pipelineId?: string;
}): void {
  const activeId = usePipelinesStore.getState().activePipelineId;
  if (p.deletedId) {
    usePipelinesStore.setState((s) => ({
      sources: s.sources.filter((src) => src.id !== p.deletedId),
    }));
    return;
  }
  if (p.source && p.source.pipelineId === activeId) {
    usePipelinesStore.setState((s) => ({
      sources: upsert(s.sources, p.source!),
    }));
  }
}
