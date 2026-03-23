/**
 * Canvas Workflow API — CRUD persisted in dedicated SQLite tables
 */

import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { CanvasWorkflow, WorkflowExecution } from '@/types/canvas';

async function getAll(): Promise<CanvasWorkflow[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getWorkflows();
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function getWorkflows(): Promise<CanvasWorkflow[]> {
  return getAll();
}

export async function getWorkflow(id: string): Promise<CanvasWorkflow | null> {
  const result = await db.getWorkflow(id);
  return result.success ? result.data ?? null : null;
}

export async function createWorkflow(
  data: Omit<CanvasWorkflow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: CanvasWorkflow; error?: string }> {
  const now = Date.now();
  const workflow: CanvasWorkflow = {
    id: generateId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await db.createWorkflow(workflow);
  return saved.success ? { success: true, data: saved.data } : { success: false, error: saved.error };
}

export async function updateWorkflow(
  id: string,
  updates: Partial<Omit<CanvasWorkflow, 'id' | 'createdAt'>>
): Promise<{ success: boolean; data?: CanvasWorkflow; error?: string }> {
  const saved = await db.updateWorkflow(id, {
    ...updates,
    updatedAt: Date.now(),
  });
  return saved.success ? { success: true, data: saved.data } : { success: false, error: saved.error };
}

export async function deleteWorkflow(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await db.deleteWorkflow(id);
  return result.success ? { success: true } : { success: false, error: result.error };
}

// --- Executions (traceability) ---

async function getAllExecutions(): Promise<WorkflowExecution[]> {
  if (!db.isAvailable()) return [];
  const workflows = await getAll();
  if (workflows.length === 0) return [];
  const results = await Promise.all(workflows.map((workflow) => db.getWorkflowExecutionsByWorkflow(workflow.id)));
  return results
    .filter((result): result is { success: true; data: WorkflowExecution[] } => result.success && Array.isArray(result.data))
    .flatMap((result) => result.data);
}

const MAX_EXECUTIONS_PER_WORKFLOW = 50;

export async function saveExecution(execution: WorkflowExecution): Promise<{ success: boolean; error?: string }> {
  const result = await db.saveWorkflowExecution(execution);
  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function getExecutionsByWorkflow(workflowId: string): Promise<WorkflowExecution[]> {
  const result = await db.getWorkflowExecutionsByWorkflow(workflowId);
  if (!result.success || !Array.isArray(result.data)) return [];
  return result.data.sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_EXECUTIONS_PER_WORKFLOW);
}

export async function getExecution(id: string): Promise<WorkflowExecution | null> {
  const result = await db.getWorkflowExecution(id);
  return result.success ? result.data ?? null : null;
}
