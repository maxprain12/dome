import type { Node, Edge } from 'reactflow';

export type CanvasNodeType = 'textInput' | 'imageInput' | 'documentInput' | 'agentNode' | 'outputNode';

export interface TextInputData {
  label: string;
  text: string;
}

export interface ImageInputData {
  label: string;
  resourceId?: string;
  imageUrl?: string;
  fileName?: string;
}

export interface DocumentInputData {
  label: string;
  resourceId?: string;
  resourceTitle?: string;
  resourceType?: string;
}

export interface AgentNodeData {
  label: string;
  agentId: string;
  agentName: string;
  agentIcon?: number;
  systemInstructions?: string;
  status?: 'idle' | 'running' | 'done' | 'error';
  output?: string;
}

export interface OutputNodeData {
  label: string;
  content?: string;
  status?: 'idle' | 'waiting' | 'done';
}

export type CanvasNodeData =
  | TextInputData
  | ImageInputData
  | DocumentInputData
  | AgentNodeData
  | OutputNodeData;

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  author: string;
  tags: string[];
  featured: boolean;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface WorkflowExecutionResult {
  nodeId: string;
  output: string;
  status: 'success' | 'error';
  error?: string;
}
