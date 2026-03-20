import type { SystemAgentRole } from '@/types/canvas';

/** Width of the workflow palette sidebar — keep in sync with empty-state overlay offset in AgentCanvasView. */
export const CANVAS_PALETTE_WIDTH_PX = 220;

export function canvasSystemAgentNameKey(role: SystemAgentRole): string {
  return `canvas.system_agent_${role}_name`;
}

export function canvasSystemAgentDescKey(role: SystemAgentRole): string {
  return `canvas.system_agent_${role}_desc`;
}
