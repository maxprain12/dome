'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentNodeData, CanvasNodeData, WorkflowExecution, WorkflowNode } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { getManyAgents } from '@/lib/agents/api';
import { useAppStore } from '@/lib/store/useAppStore';
import { createWorkflow, updateWorkflow, saveExecution, getExecutionsByWorkflow } from '@/lib/agent-canvas/api';
import { generateId } from '@/lib/utils';
import { executeWorkflow, type ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import { showToast } from '@/lib/store/useToastStore';
import { showPrompt } from '@/lib/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { CANVAS_PALETTE_WIDTH_PX } from '@/lib/agent-canvas/canvas-layout';
import CanvasToolbar from './CanvasToolbar';
import CanvasSidebar from './CanvasSidebar';
import CanvasWorkspace from './CanvasWorkspace';
import PropertiesPanel from './PropertiesPanel';
import ExecutionLog from './ExecutionLog';

export default function AgentCanvasView() {
  const { t } = useTranslation();
  const store = useCanvasStore();
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [executionHistory, setExecutionHistory] = useState<WorkflowExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  // Resolve agentIconIndex for agent nodes that have agentId but iconIndex 0 (e.g. loaded from old workflow)
  useEffect(() => {
    const agentNodesNeedingIcon = nodes.filter(
      (n): n is WorkflowNode<AgentNodeData> =>
        n.data?.type === 'agent' &&
        (n.data as AgentNodeData).agentId != null &&
        ((n.data as AgentNodeData).agentIconIndex ?? 0) === 0,
    );
    if (agentNodesNeedingIcon.length === 0) return;

    getManyAgents(hubProjectId).then((agents) => {
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
  }, [nodes, setNodes, hubProjectId]);

  useEffect(() => {
    if (store.activeWorkflowId) {
      getExecutionsByWorkflow(store.activeWorkflowId).then(setExecutionHistory);
      setSelectedExecutionId(null);
    } else {
      setExecutionHistory([]);
      setSelectedExecutionId(null);
    }
  }, [store.activeWorkflowId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedNodeId) return;
      e.preventDefault();
      removeNode(selectedNodeId);
      setSelectedNodeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNodeId, removeNode]);

  const handleAddNode = useCallback(
    (node: WorkflowNode<CanvasNodeData>) => {
      setNodes([...useCanvasStore.getState().nodes, node]);
    },
    [setNodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      removeNode(nodeId);
      setSelectedNodeId(null);
    },
    [removeNode],
  );

  const handleRun = useCallback(async () => {
    if (store.executionStatus === 'running') return;
    const { nodes: storeNodes, edges: storeEdges } = useCanvasStore.getState();
    if (storeNodes.length === 0) {
      showToast('error', t('toast.canvas_empty'));
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
          ]),
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
    } catch {
      if (storeSnapshot.activeWorkflowId) {
        const nodeOutputs = Object.fromEntries(
          Object.entries(useCanvasStore.getState().executionStates).map(([nodeId, state]) => [
            nodeId,
            {
              output: state.output,
              error: state.error,
              payload: state.payload,
            },
          ]),
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
      showToast('error', t('toast.workflow_execution_error'));
    }
  }, [store.executionStatus, t]);

  const handleStop = useCallback(() => {
    store.resetExecution();
    window.electron?.invoke('ai:langgraph:abort').catch(() => {});
  }, [store]);

  const handleSave = useCallback(async () => {
    const { nodes: storeNodes, edges: storeEdges } = useCanvasStore.getState();
    if (storeNodes.length === 0) {
      showToast('error', t('toast.no_nodes_in_canvas'));
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
        showToast('success', t('toast.workflow_saved'));
      } else {
        showToast('error', result.error ?? t('toast.workflow_save_error'));
      }
    } else {
      const result = await createWorkflow({
        name: store.activeWorkflowName,
        description: '',
        nodes: serializedNodes,
        edges: serializedEdges,
        projectId: hubProjectId,
      });
      if (result.success && result.data) {
        store.setActiveWorkflow(result.data);
        showToast('success', t('toast.workflow_saved'));
      } else {
        showToast('error', result.error ?? t('toast.workflow_save_error'));
      }
    }
  }, [store, hubProjectId, t]);

  const handleClear = useCallback(() => {
    store.clearCanvas();
    setSelectedNodeId(null);
  }, [store]);

  const handleRename = useCallback(async () => {
    const newName = await showPrompt(t('canvas.rename_workflow_title'), store.activeWorkflowName);
    if (newName?.trim()) {
      store.setWorkflowName(newName.trim());
    }
  }, [store, t]);

  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--dome-bg)' }}>
      <CanvasToolbar
        onRun={handleRun}
        onStop={handleStop}
        onSave={handleSave}
        onClear={handleClear}
        onBackToLibrary={() => setHomeSidebarSection('automations-hub')}
        onRename={handleRename}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <CanvasSidebar onAddNode={handleAddNode} />

        <CanvasWorkspace selectedNodeId={selectedNodeId} onNodeSelect={setSelectedNodeId} />

        {selectedNode && (
          <PropertiesPanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleDeleteNode}
          />
        )}
      </div>

      <ExecutionLog
        entries={executionLog}
        status={store.executionStatus}
        startTime={runStartTime}
        history={executionHistory}
        selectedExecutionId={selectedExecutionId}
        onSelectExecution={setSelectedExecutionId}
      />

      {nodes.length === 0 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ left: CANVAS_PALETTE_WIDTH_PX, top: 56 }}
        >
          <div className="text-center space-y-3 max-w-sm px-6 opacity-50">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <svg
                className="w-7 h-7"
                style={{ color: 'var(--dome-accent)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
                />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
              {t('canvas.empty_canvas_title')}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
              {t('canvas.empty_canvas_subtitle')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
