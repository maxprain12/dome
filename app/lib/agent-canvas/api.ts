/**
 * Canvas Workflow API — CRUD persisted in dedicated SQLite tables
 */

import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { DomeWorkflowFolder } from '@/types';
import type { CanvasWorkflow, WorkflowExecution } from '@/types/canvas';

async function getAll(projectId: string): Promise<CanvasWorkflow[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getWorkflows(projectId);
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function getWorkflows(projectId = 'default'): Promise<CanvasWorkflow[]> {
  return getAll(projectId);
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
    projectId: data.projectId ?? 'default',
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

// getAllExecutions kept for future use when execution history is implemented

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

export async function listWorkflowFolders(projectId = 'default'): Promise<DomeWorkflowFolder[]> {
  if (!db.isAvailable()) return [];
  const result = await db.listWorkflowFolders(projectId);
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function createWorkflowFolderRecord(
  name: string,
  parentId?: string | null,
  projectId = 'default',
): Promise<{ success: boolean; data?: DomeWorkflowFolder; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const now = Date.now();
  const folder: DomeWorkflowFolder = {
    id: generateId(),
    projectId,
    parentId: parentId ?? null,
    name: name.trim() || 'Folder',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await db.createWorkflowFolder(folder);
  return saved.success && saved.data
    ? { success: true, data: saved.data }
    : { success: false, error: saved.error };
}

export async function updateWorkflowFolderRecord(
  id: string,
  updates: Partial<Pick<DomeWorkflowFolder, 'parentId' | 'name' | 'sortOrder'>>,
): Promise<{ success: boolean; data?: DomeWorkflowFolder; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const saved = await db.updateWorkflowFolder(id, updates);
  return saved.success && saved.data
    ? { success: true, data: saved.data }
    : { success: false, error: saved.error };
}

export async function deleteWorkflowFolderRecord(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const result = await db.deleteWorkflowFolder(id);
  return result.success ? { success: true } : { success: false, error: result.error };
}
