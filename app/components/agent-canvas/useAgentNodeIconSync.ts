import { useEffect } from 'react';
import type { AgentNodeData, WorkflowNode } from '@/types/canvas';
import { getManyAgents } from '@/lib/agents/api';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

export function useAgentNodeIconSync(hubProjectId: string) {
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodes = useCanvasStore((s) => s.setNodes);

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
}
