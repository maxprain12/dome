/**
 * Pipelines — shared renderer types.
 *
 * Mirrors the SQLite tables created in migration 52 (`pipelines`,
 * `pipeline_stages`, `pipeline_items`, `pipeline_sources`). Camel-cased for the
 * renderer; the IPC layer (electron/ipc/agents/pipelines.cjs) maps snake_case
 * rows to these shapes.
 */

export type ExecutionPolicy = 'auto_agent' | 'manual_agent' | 'manual_resolve';
export type ExecStatus = 'pending' | 'running' | 'ready' | 'failed' | 'blocked';
export type AssignedKind = 'unassigned' | 'agent' | 'manual' | 'auto';
export type SourceType =
  | 'internal_resources'
  | 'excel'
  | 'manual'
  | 'external_db'
  | 'prompt_mcp';

export interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  iconIndex: number;
  color?: string | null;
  folderId?: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  projectId: string;
  title: string;
  position: number;
  executionPolicy: ExecutionPolicy;
  assignedAgentId?: string | null;
  assignedWorkflowId?: string | null;
  runInputTemplate?: string | null;
  provider?: string | null;
  model?: string | null;
  isTerminal: boolean;
  wipLimit?: number | null;
  /** Parsed JSON; e.g. { advanceOnComplete?: boolean }. */
  config?: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface PipelineItem {
  id: string;
  pipelineId: string;
  projectId: string;
  stageId: string;
  sourceId?: string | null;
  title: string;
  position: number;
  /** Parsed business payload the assigned agent processes. */
  data?: Record<string, unknown> | null;
  execStatus: ExecStatus;
  assignedKind: AssignedKind;
  assignedAgentId?: string | null;
  currentRunId?: string | null;
  lastOutput?: string | null;
  startAt?: number | null;
  endAt?: number | null;
  calendarEventId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface PipelineSource {
  id: string;
  pipelineId: string;
  projectId: string;
  name: string;
  sourceType: SourceType;
  /** Parsed config; shape depends on sourceType. Secrets live in safeStorage, referenced by secretRef. */
  config?: Record<string, unknown> | null;
  targetStageId?: string | null;
  enabled: boolean;
  lastSyncAt?: number | null;
  lastSyncStatus?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A pipeline with its stages, items and sources hydrated (pipelines:get). */
export interface PipelineBundle {
  pipeline: Pipeline;
  stages: PipelineStage[];
  items: PipelineItem[];
  sources: PipelineSource[];
}

/* ---------------------------------------------------------------------------
 * Inputs accepted by the IPC layer (server fills id + timestamps).
 * ------------------------------------------------------------------------- */

export interface CreatePipelineInput {
  projectId: string;
  name: string;
  description?: string;
  iconIndex?: number;
  color?: string;
}

export interface CreateStageInput {
  pipelineId: string;
  title: string;
  position?: number;
  executionPolicy?: ExecutionPolicy;
  assignedAgentId?: string | null;
  assignedWorkflowId?: string | null;
  runInputTemplate?: string | null;
  provider?: string | null;
  model?: string | null;
  isTerminal?: boolean;
  wipLimit?: number | null;
  config?: Record<string, unknown> | null;
}

export interface CreateItemInput {
  pipelineId: string;
  stageId: string;
  title: string;
  sourceId?: string | null;
  data?: Record<string, unknown> | null;
  startAt?: number | null;
  endAt?: number | null;
  assignedKind?: AssignedKind;
  assignedAgentId?: string | null;
}

export interface CreateSourceInput {
  pipelineId: string;
  name: string;
  sourceType: SourceType;
  config?: Record<string, unknown> | null;
  targetStageId?: string | null;
  enabled?: boolean;
}

export const PIPELINE_ITEM_DRAG_TYPE = 'application/x-dome-pipeline-item';
export const PIPELINE_STAGE_DRAG_TYPE = 'application/x-dome-pipeline-stage';

/**
 * Reserved `assignedAgentId` value meaning "run this stage with Many" (the
 * default Dome assistant, run via `ownerType: 'many'`) instead of a custom
 * agent row. Agent ids are generated tokens, so this string never collides.
 */
export const MANY_EXECUTOR_ID = 'many';

export interface PipelineItemEvent {
  id: string;
  itemId: string;
  eventType: string;
  actor: string | null;
  summary: string | null;
  detail: Record<string, unknown> | null;
  runId: string | null;
  createdAt: number;
}
