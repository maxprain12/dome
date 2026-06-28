'use client';

import { useCallback, useState } from 'react';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { createWorkflow, updateWorkflow } from '@/lib/agent-canvas/api';
import { showToast } from '@/lib/store/useToastStore';
import { showPrompt } from '@/lib/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import CanvasToolbar from './CanvasToolbar';
import CanvasSidebar from './CanvasSidebar';
import CanvasWorkspace from './CanvasWorkspace';
import PropertiesPanel from './PropertiesPanel';
import ExecutionLog from './ExecutionLog';
import AgentCanvasEmptyState from './AgentCanvasEmptyState';
import { useAgentNodeIconSync } from './useAgentNodeIconSync';
import { useCanvasDeleteKey } from './useCanvasDeleteKey';
import { useAgentCanvasExecution } from './useAgentCanvasExecution';

export default function AgentCanvasView({ onBackToLibrary }: { onBackToLibrary?: () => void }) {
  const { t } = useTranslation();
  const store = useCanvasStore();
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useAgentNodeIconSync(hubProjectId);
  useCanvasDeleteKey(selectedNodeId, removeNode, () => setSelectedNodeId(null));

  const {
    executionLog,
    runStartTime,
    executionHistory,
    selectedExecutionId,
    handleRun,
    selectExecution,
  } = useAgentCanvasExecution(t);

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

  const handleStop = useCallback(() => {
    store.resetExecution();
    window.electron?.invoke('ai:agent:abort').catch(() => {});
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
        store.markClean();
        showToast('success', t('toast.workflow_created'));
      } else {
        showToast('error', result.error ?? t('toast.workflow_create_error'));
      }
    }
  }, [store, hubProjectId, t]);

  const handleBackToLibrary = useCallback(() => {
    if (onBackToLibrary) {
      onBackToLibrary();
      return;
    }
    setHomeSidebarSection('automations-hub');
  }, [onBackToLibrary, setHomeSidebarSection]);

  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--dome-bg)' }}>
      <CanvasToolbar
        onRun={handleRun}
        onStop={handleStop}
        onSave={handleSave}
        onClear={handleClear}
        onBackToLibrary={handleBackToLibrary}
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
        onSelectExecution={selectExecution}
      />

      {nodes.length === 0 && <AgentCanvasEmptyState />}
    </div>
  );
}
