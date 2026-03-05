import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';
import type { CanvasNodeData, CanvasWorkflow, NodeExecutionState } from '@/types/canvas';

export type CanvasExecutionStatus = 'idle' | 'running' | 'done' | 'error';

interface CanvasState {
  // ReactFlow nodes and edges
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  setNodes: (nodes: Node<CanvasNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNode: (nodeId: string, data: Partial<CanvasNodeData>) => void;

  // Active workflow metadata
  activeWorkflowId: string | null;
  activeWorkflowName: string;
  isDirty: boolean;
  setActiveWorkflow: (workflow: CanvasWorkflow | null) => void;
  setWorkflowName: (name: string) => void;
  markDirty: () => void;
  markClean: () => void;

  // Execution state
  executionStatus: CanvasExecutionStatus;
  executionStates: Record<string, NodeExecutionState>;
  setExecutionStatus: (status: CanvasExecutionStatus) => void;
  setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void;
  resetExecution: () => void;

  // Canvas UI state
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Actions
  addNode: (node: Node<CanvasNodeData>) => void;
  removeNode: (nodeId: string) => void;
  clearCanvas: () => void;
  loadWorkflow: (workflow: CanvasWorkflow) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  edges: [],
  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),
  updateNode: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } as CanvasNodeData } : n
      ),
      isDirty: true,
    })),

  activeWorkflowId: null,
  activeWorkflowName: 'Nuevo Workflow',
  isDirty: false,
  setActiveWorkflow: (workflow) =>
    set(
      workflow
        ? { activeWorkflowId: workflow.id, activeWorkflowName: workflow.name, isDirty: false }
        : { activeWorkflowId: null, activeWorkflowName: 'Nuevo Workflow', isDirty: false }
    ),
  setWorkflowName: (name) => set({ activeWorkflowName: name, isDirty: true }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  executionStatus: 'idle',
  executionStates: {},
  setExecutionStatus: (status) => set({ executionStatus: status }),
  setNodeExecutionState: (nodeId, state) =>
    set((s) => ({ executionStates: { ...s.executionStates, [nodeId]: state } })),
  resetExecution: () =>
    set((state) => ({
      executionStatus: 'idle',
      executionStates: {},
      nodes: state.nodes.map((n) => {
        if (n.data.type === 'agent') {
          return {
            ...n,
            data: { ...n.data, status: 'idle', outputText: null, errorMessage: null } as CanvasNodeData,
          };
        }
        if (n.data.type === 'output') {
          return { ...n, data: { ...n.data, content: null, status: 'idle' } as CanvasNodeData };
        }
        return n;
      }),
    })),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node], isDirty: true })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      isDirty: true,
    })),
  clearCanvas: () =>
    set({ nodes: [], edges: [], activeWorkflowId: null, activeWorkflowName: 'Nuevo Workflow', isDirty: false }),

  loadWorkflow: (workflow) =>
    set({
      nodes: workflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })) as Node<CanvasNodeData>[],
      edges: workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
      activeWorkflowId: workflow.id,
      activeWorkflowName: workflow.name,
      isDirty: false,
      executionStatus: 'idle',
      executionStates: {},
    }),
}));
