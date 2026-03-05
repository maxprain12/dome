/**
 * Canvas Workflow API — CRUD persisted in SQLite settings table
 * Key: 'canvas_workflows' → JSON array of CanvasWorkflow
 * Key: 'canvas_executions' → JSON array of WorkflowExecution
 */

import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { CanvasWorkflow, WorkflowExecution } from '@/types/canvas';

const SETTINGS_KEY = 'canvas_workflows';
const EXECUTIONS_KEY = 'canvas_executions';

async function getAll(): Promise<CanvasWorkflow[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(SETTINGS_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? (parsed as CanvasWorkflow[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(workflows: CanvasWorkflow[]): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database not available' };
  const result = await db.setSetting(SETTINGS_KEY, JSON.stringify(workflows));
  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function getWorkflows(): Promise<CanvasWorkflow[]> {
  return getAll();
}

export async function getWorkflow(id: string): Promise<CanvasWorkflow | null> {
  const workflows = await getAll();
  return workflows.find((w) => w.id === id) ?? null;
}

export async function createWorkflow(
  data: Omit<CanvasWorkflow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: CanvasWorkflow; error?: string }> {
  const workflows = await getAll();
  const now = Date.now();
  const workflow: CanvasWorkflow = {
    id: generateId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  workflows.push(workflow);
  const saved = await saveAll(workflows);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: workflow };
}

export async function updateWorkflow(
  id: string,
  updates: Partial<Omit<CanvasWorkflow, 'id' | 'createdAt'>>
): Promise<{ success: boolean; data?: CanvasWorkflow; error?: string }> {
  const workflows = await getAll();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx < 0) return { success: false, error: 'Workflow not found' };
  const existing = workflows[idx];
  if (!existing) return { success: false, error: 'Workflow not found' };
  const updated: CanvasWorkflow = { ...existing, ...updates, updatedAt: Date.now() };
  workflows[idx] = updated;
  const saved = await saveAll(workflows);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: updated };
}

export async function deleteWorkflow(id: string): Promise<{ success: boolean; error?: string }> {
  const workflows = await getAll();
  const filtered = workflows.filter((w) => w.id !== id);
  if (filtered.length === workflows.length) return { success: false, error: 'Workflow not found' };
  const saved = await saveAll(filtered);
  return saved;
}

// --- Executions (traceability) ---

async function getAllExecutions(): Promise<WorkflowExecution[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(EXECUTIONS_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkflowExecution[]) : [];
  } catch {
    return [];
  }
}

async function saveAllExecutions(executions: WorkflowExecution[]): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database not available' };
  const result = await db.setSetting(EXECUTIONS_KEY, JSON.stringify(executions));
  return result.success ? { success: true } : { success: false, error: result.error };
}

const MAX_EXECUTIONS_PER_WORKFLOW = 50;

export async function saveExecution(execution: WorkflowExecution): Promise<{ success: boolean; error?: string }> {
  const executions = await getAllExecutions();
  const idx = executions.findIndex((e) => e.id === execution.id);
  if (idx >= 0) {
    executions[idx] = execution;
  } else {
    executions.push(execution);
  }
  // Trim old executions per workflow (keep most recent)
  const byWorkflow = new Map<string, WorkflowExecution[]>();
  for (const e of executions) {
    const list = byWorkflow.get(e.workflowId) ?? [];
    list.push(e);
    byWorkflow.set(e.workflowId, list);
  }
  const trimmed: WorkflowExecution[] = [];
  for (const list of byWorkflow.values()) {
    const sorted = [...list].sort((a, b) => b.startedAt - a.startedAt);
    trimmed.push(...sorted.slice(0, MAX_EXECUTIONS_PER_WORKFLOW));
  }
  return saveAllExecutions(trimmed.sort((a, b) => b.startedAt - a.startedAt));
}

export async function getExecutionsByWorkflow(workflowId: string): Promise<WorkflowExecution[]> {
  const executions = await getAllExecutions();
  return executions
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export async function getExecution(id: string): Promise<WorkflowExecution | null> {
  const executions = await getAllExecutions();
  return executions.find((e) => e.id === id) ?? null;
}
