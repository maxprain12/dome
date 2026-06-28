import type { TFunction } from 'i18next';
import type { ManyAgent } from '@/types';
import { generateId } from '@/lib/utils';
import type {
  CanvasNodeData,
  TextInputNodeData,
  DocumentNodeData,
  ImageNodeData,
  AgentNodeData,
  OutputNodeData,
  SystemAgentRole,
  WorkflowNode,
} from '@/types/canvas';
import { canvasSystemAgentNameKey } from '@/lib/agent-canvas/canvas-layout';

export function createCanvasPaletteNode(
  t: TFunction,
  type: string,
  agentData?: ManyAgent,
  extra?: string,
): WorkflowNode<CanvasNodeData> {
  const id = generateId();
  const position = { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 };

  if (type === 'text-input') {
    return {
      id,
      type: 'textInput',
      position,
      data: {
        type: 'text-input',
        label: t('canvas.default_text_input_label'),
        value: '',
      } as TextInputNodeData,
    };
  }
  if (type === 'document') {
    return {
      id,
      type: 'document',
      position,
      data: {
        type: 'document',
        label: t('canvas.default_document_label'),
        resourceId: null,
        resourceTitle: null,
        resourceContent: null,
      } as DocumentNodeData,
    };
  }
  if (type === 'image') {
    return {
      id,
      type: 'image',
      position,
      data: {
        type: 'image',
        label: t('canvas.default_image_label'),
        resourceId: null,
        resourceTitle: null,
        resourceUrl: null,
      } as ImageNodeData,
    };
  }
  if (type === 'agent' && agentData) {
    return {
      id,
      type: 'agent',
      position,
      data: {
        type: 'agent',
        label: agentData.name,
        agentId: agentData.id,
        agentName: agentData.name,
        agentIconIndex: agentData.iconIndex,
        status: 'idle',
        outputText: null,
        errorMessage: null,
      } as AgentNodeData,
    };
  }
  if (type === 'system-agent') {
    const sysRole = extra as SystemAgentRole;
    const sysName = t(canvasSystemAgentNameKey(sysRole));
    return {
      id,
      type: 'agent',
      position,
      data: {
        type: 'agent',
        label: sysName,
        agentId: null,
        systemAgentRole: sysRole,
        agentName: sysName,
        agentIconIndex: 0,
        status: 'idle',
        outputText: null,
        errorMessage: null,
      } as AgentNodeData,
    };
  }
  return {
    id,
    type: 'output',
    position,
    data: {
      type: 'output',
      label: t('canvas.default_output_label'),
      content: null,
      status: 'idle',
    } as OutputNodeData,
  };
}

export function handleCanvasPaletteDragStart(
  e: React.DragEvent,
  type: string,
  agent?: ManyAgent,
  systemRole?: SystemAgentRole,
) {
  e.dataTransfer.setData('application/x-canvas-node-type', type);
  if (agent) {
    e.dataTransfer.setData('application/x-canvas-agent', JSON.stringify(agent));
  }
  if (systemRole) {
    e.dataTransfer.setData('application/x-canvas-system-role', systemRole);
  }
  e.dataTransfer.effectAllowed = 'copy';
}
