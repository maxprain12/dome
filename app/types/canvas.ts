// ============================================
// CANVAS WORKFLOW TYPES
// ============================================

export type CanvasNodeType = 'text-input' | 'document' | 'image' | 'agent' | 'output';

export type CanvasNodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface CanvasResourceReference {
  resourceId: string;
  resourceType: string;
  resourceTitle: string;
  resourceContent?: string | null;
  resourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CanvasNodePayload {
  kind: 'text' | 'resource' | 'bundle';
  text: string;
  resources?: CanvasResourceReference[];
  metadata?: Record<string, unknown>;
}

// Data stored inside each ReactFlow node's `data` field
export interface TextInputNodeData {
  type: 'text-input';
  label: string;
  value: string;
}

export interface DocumentNodeData {
  type: 'document';
  label: string;
  resourceId: string | null;
  resourceType?: string | null;
  resourceTitle: string | null;
  resourceContent: string | null;
  resourceMetadata?: Record<string, unknown> | null;
}

export interface ImageNodeData {
  type: 'image';
  label: string;
  resourceId: string | null;
  resourceType?: string | null;
  resourceTitle: string | null;
  resourceUrl: string | null;
  resourceMetadata?: Record<string, unknown> | null;
}

export type SystemAgentRole = 'research' | 'library' | 'writer' | 'data' | 'presenter' | 'curator';

export interface AgentNodeData {
  type: 'agent';
  label: string;
  agentId: string | null;
  systemAgentRole?: SystemAgentRole;
  agentName: string | null;
  agentIconIndex: number;
  status: CanvasNodeStatus;
  outputText: string | null;
  errorMessage: string | null;
}

export interface OutputNodeData {
  type: 'output';
  label: string;
  content: string | null;
  status: CanvasNodeStatus;
}

export type CanvasNodeData =
  | TextInputNodeData
  | DocumentNodeData
  | ImageNodeData
  | AgentNodeData
  | OutputNodeData;

// Serialized workflow stored in SQLite
export interface CanvasWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  marketplace?: {
    templateId?: string;
    version?: string;
    source?: 'official' | 'community' | 'local';
    author?: string;
    capabilities?: string[];
    resourceAffinity?: string[];
  };
  createdAt: number;
  updatedAt: number;
}

export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: CanvasNodeData;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// Marketplace workflow template
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  author: string;
  version: string;
  tags: string[];
  featured: boolean;
  downloads: number;
  createdAt: number;
  estimatedTime?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  inputTypes?: string[];
  outputType?: string;
  category?: string;
  useCases?: string[];
  source?: 'official' | 'community';
  capabilities?: string[];
  resourceAffinity?: string[];
  compatibility?: {
    minAppVersion?: string;
    minSchemaVersion?: number;
  };
  /** Pre-configured nodes for this template */
  nodes: SerializedNode[];
  /** Pre-configured edges for this template */
  edges: SerializedEdge[];
}

// Execution state for a single agent node during workflow run
export interface NodeExecutionState {
  nodeId: string;
  status: CanvasNodeStatus;
  output: string;
  payload?: CanvasNodePayload;
  error?: string;
}

/** Execution log entry for the real-time panel and persisted history */
export interface ExecutionLogEntry {
  id: string;
  nodeId: string;
  nodeLabel: string;
  message: string;
  type: 'info' | 'tool_call' | 'done' | 'error';
  timestamp: number;
}

/** Persisted workflow execution for traceability */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'done' | 'error';
  entries: ExecutionLogEntry[];
  nodeOutputs?: Record<string, { output?: string; error?: string; payload?: CanvasNodePayload }>;
}
