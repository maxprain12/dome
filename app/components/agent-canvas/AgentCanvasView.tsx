'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { CanvasNodeData, WorkflowExecution, AgentNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getManyAgents } from '@/lib/agents/api';
import { useAppStore } from '@/lib/store/useAppStore';
import { createWorkflow, updateWorkflow, saveExecution, getExecutionsByWorkflow } from '@/lib/agent-canvas/api';
import { generateId } from '@/lib/utils';
import { executeWorkflow, type ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import { showToast } from '@/lib/store/useToastStore';
import { showPrompt } from '@/lib/store/usePromptStore';
import CanvasToolbar from './CanvasToolbar';
import CanvasSidebar from './CanvasSidebar';
import CanvasWorkspace from './CanvasWorkspace';
import PropertiesPanel from './PropertiesPanel';
import ExecutionLog from './ExecutionLog';

function AgentCanvasInner() {
  const store = useCanvasStore();
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const edges = useCanvasStore((s) => s.edges);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [executionHistory, setExecutionHistory] = useState<WorkflowExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNodeData>[]) => {
      setNodes(applyNodeChanges(changes, useCanvasStore.getState().nodes));
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(applyEdgeChanges(changes, useCanvasStore.getState().edges));
    },
    [setEdges]
  );

  // Load from store when workflow changes externally (e.g. load from disk, open from library)
  useEffect(() => {
    const state = useCanvasStore.getState();
    setNodes(state.nodes);
    setEdges(state.edges);
  }, [store.activeWorkflowId, setNodes, setEdges]);

  // Resolve agentIconIndex for agent nodes that have agentId but iconIndex 0 (e.g. loaded from old workflow)
  useEffect(() => {
    const agentNodesNeedingIcon = nodes.filter(
      (n): n is Node<AgentNodeData> =>
        n.data?.type === 'agent' &&
        (n.data as AgentNodeData).agentId != null &&
        ((n.data as AgentNodeData).agentIconIndex ?? 0) === 0
    );
    if (agentNodesNeedingIcon.length === 0) return;

    getManyAgents().then((agents) => {
      const updates: { nodeId: string; iconIndex: number }[] = [];
      for (const node of agentNodesNeedingIcon) {
        const agentData = node.data as AgentNodeData;
        const agent = agents.find((a) => a.id === agentData.agentId);
        if (agent && agent.iconIndex > 0) {
          updates.push({ nodeId: node.id, iconIndex: agent.iconIndex });
        }
      }
      if (updates.length === 0) return;

      const currentNodes = useCanvasStore.getState().nodes;
      const newNodes = currentNodes.map((n) => {
        const upd = updates.find((u) => u.nodeId === n.id);
        if (upd && n.data?.type === 'agent') {
          return {
            ...n,
            data: { ...n.data, agentIconIndex: upd.iconIndex } as AgentNodeData,
          };
        }
        return n;
      });
      setNodes(newNodes);
    });
  }, [nodes, setNodes]);

  // Load execution history when workflow changes
  useEffect(() => {
    if (store.activeWorkflowId) {
      getExecutionsByWorkflow(store.activeWorkflowId).then(setExecutionHistory);
      setSelectedExecutionId(null);
    } else {
      setExecutionHistory([]);
      setSelectedExecutionId(null);
    }
  }, [store.activeWorkflowId]);

  const handleConnect = useCallback(
    (params: Connection | Edge) => {
      setEdges(addEdge({ ...params, type: 'smoothstep' }, useCanvasStore.getState().edges));
    },
    [setEdges]
  );

  const handleAddNode = useCallback(
    (node: Node<CanvasNodeData>) => {
      setNodes([...useCanvasStore.getState().nodes, node]);
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes(useCanvasStore.getState().nodes.filter((n) => n.id !== nodeId));
      setEdges(useCanvasStore.getState().edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  const handleRun = useCallback(async () => {
    if (store.executionStatus === 'running') return;
    const { nodes: storeNodes, edges: storeEdges } = useCanvasStore.getState();
    if (storeNodes.length === 0) {
      showToast('error', 'El canvas está vacío');
      return;
    }
    const executionId = generateId();
    const startedAt = Date.now();
    setExecutionLog([]);
    setRunStartTime(startedAt);
    setSelectedExecutionId(null);
    const storeSnapshot = useCanvasStore.getState();
    const entries: ExecutionLogEntry[] = [];
    try {
      await executeWorkflow(storeNodes, storeEdges, storeSnapshot, (entry) => {
        entries.push(entry);
        setExecutionLog((prev) => [...prev, entry]);
      });
      if (storeSnapshot.activeWorkflowId) {
        const nodeOutputs = Object.fromEntries(
          Object.entries(useCanvasStore.getState().executionStates).map(([nodeId, state]) => [
            nodeId,
            {
              output: state.output,
              error: state.error,
              payload: state.payload,
            },
          ])
        );
        const execution: WorkflowExecution = {
          id: executionId,
          workflowId: storeSnapshot.activeWorkflowId,
          workflowName: storeSnapshot.activeWorkflowName,
          startedAt,
          finishedAt: Date.now(),
          status: 'done',
          entries,
          nodeOutputs,
        };
        await saveExecution(execution);
        setExecutionHistory((prev) => [execution, ...prev]);
      }
    } catch (err) {
      if (storeSnapshot.activeWorkflowId) {
        const nodeOutputs = Object.fromEntries(
          Object.entries(useCanvasStore.getState().executionStates).map(([nodeId, state]) => [
            nodeId,
            {
              output: state.output,
              error: state.error,
              payload: state.payload,
            },
          ])
        );
        const execution: WorkflowExecution = {
          id: executionId,
          workflowId: storeSnapshot.activeWorkflowId,
          workflowName: storeSnapshot.activeWorkflowName,
          startedAt,
          finishedAt: Date.now(),
          status: 'error',
          entries,
          nodeOutputs,
        };
        await saveExecution(execution);
        setExecutionHistory((prev) => [execution, ...prev]);
      }
      showToast('error', 'Error durante la ejecución del workflow');
    }
  }, [store.executionStatus]);

  const handleStop = useCallback(() => {
    store.resetExecution();
    window.electron?.invoke('ai:langgraph:abort').catch(() => {});
  }, [store]);

  const handleSave = useCallback(async () => {
    const { nodes: storeNodes, edges: storeEdges } = useCanvasStore.getState();
    if (storeNodes.length === 0) {
      showToast('error', 'No hay nodos en el canvas');
      return;
    }

    const serializedNodes = storeNodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'textInput',
      position: n.position,
      data: n.data,
    }));
    const serializedEdges = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    }));

    if (store.activeWorkflowId) {
      const result = await updateWorkflow(store.activeWorkflowId, {
        name: store.activeWorkflowName,
        nodes: serializedNodes,
        edges: serializedEdges,
      });
      if (result.success) {
        store.markClean();
        showToast('success', 'Workflow guardado');
      } else {
        showToast('error', result.error ?? 'Error al guardar');
      }
    } else {
      const result = await createWorkflow({
        name: store.activeWorkflowName,
        description: '',
        nodes: serializedNodes,
        edges: serializedEdges,
      });
      if (result.success && result.data) {
        store.setActiveWorkflow(result.data);
        showToast('success', 'Workflow guardado');
      } else {
        showToast('error', result.error ?? 'Error al guardar');
      }
    }
  }, [store]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    store.clearCanvas();
    setSelectedNodeId(null);
  }, [setNodes, setEdges, store]);

  const handleRename = useCallback(async () => {
    const newName = await showPrompt('Nombre del workflow', store.activeWorkflowName);
    if (newName?.trim()) {
      store.setWorkflowName(newName.trim());
    }
  }, [store]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--dome-bg)' }}>
      {/* Top toolbar */}
      <CanvasToolbar
        onRun={handleRun}
        onStop={handleStop}
        onSave={handleSave}
        onClear={handleClear}
        onBackToLibrary={() => setHomeSidebarSection('automations-hub')}
        onRename={handleRename}
      />

      {/* Main area: sidebar + canvas + properties */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left sidebar — node palette */}
        <CanvasSidebar onAddNode={handleAddNode} />

        {/* Canvas */}
        <CanvasWorkspace
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeSelect={setSelectedNodeId}
          onNodesUpdate={setNodes}
          onEdgesUpdate={setEdges}
        />

        {/* Right panel — node properties */}
        {selectedNode && (
          <PropertiesPanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleDeleteNode}
          />
        )}
      </div>

      {/* Execution log panel — bottom of canvas */}
      <ExecutionLog
        entries={executionLog}
        status={store.executionStatus}
        startTime={runStartTime}
        history={executionHistory}
        selectedExecutionId={selectedExecutionId}
        onSelectExecution={setSelectedExecutionId}
      />

      {/* Empty state overlay */}
      {nodes.length === 0 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ left: 220, top: 56 }}
        >
          <div className="text-center space-y-3 opacity-40">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <svg className="w-8 h-8" style={{ color: 'var(--dome-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
              Arrastra nodos desde el panel izquierdo
            </p>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Conecta inputs → agentes → resultados
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentCanvasView() {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner />
    </ReactFlowProvider>
  );
}
