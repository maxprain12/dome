import type { SystemAgentRole } from '@/types/canvas';

/** Width of the workflow palette sidebar — keep in sync with empty-state overlay offset in AgentCanvasView. */
export const CANVAS_PALETTE_WIDTH_PX = 220;

/** Default node card widths (Output is wider). Used for edge anchors until measured. */
export const WORKFLOW_NODE_WIDTH_DEFAULT = 220;
export const WORKFLOW_NODE_WIDTH_OUTPUT = 260;

export function workflowNodeWidthForType(nodeType: string): number {
  return nodeType === 'output' ? WORKFLOW_NODE_WIDTH_OUTPUT : WORKFLOW_NODE_WIDTH_DEFAULT;
}

/** Fallback height for Bézier anchors before ResizeObserver runs. */
export function workflowNodeEstimatedHeight(nodeType: string): number {
  switch (nodeType) {
    case 'output':
      return 160;
    case 'agent':
      return 150;
    case 'textInput':
    case 'document':
    case 'image':
    default:
      return 120;
  }
}

export function canvasSystemAgentNameKey(role: SystemAgentRole): string {
  return `canvas.system_agent_${role}_name`;
}

export function canvasSystemAgentDescKey(role: SystemAgentRole): string {
  return `canvas.system_agent_${role}_desc`;
}
