/**
 * Many Agents API - CRUD for specialized agents (hijos de Many)
 * Uses dedicated SQLite tables via IPC
 */

import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { DomeAgentFolder, ManyAgent } from '@/types';

async function getAll(projectId: string): Promise<ManyAgent[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getManyAgents(projectId);
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function getManyAgents(projectId = 'default'): Promise<ManyAgent[]> {
  return getAll(projectId);
}

export async function createManyAgent(
  data: Omit<ManyAgent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: ManyAgent; error?: string }> {
  const pid = data.projectId ?? 'default';
  const agents = await getAll(pid);
  const now = Date.now();
  const agent: ManyAgent = {
    id: generateId(),
    ...data,
    projectId: pid,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await db.createManyAgent(agent);
  return saved.success ? { success: true, data: saved.data } : { success: false, error: saved.error };
}

export async function updateManyAgent(
  id: string,
  updates: Partial<Omit<ManyAgent, 'id' | 'createdAt'>>
): Promise<{ success: boolean; data?: ManyAgent; error?: string }> {
  const saved = await db.updateManyAgent(id, {
    ...updates,
    updatedAt: Date.now(),
  });
  return saved.success ? { success: true, data: saved.data } : { success: false, error: saved.error };
}

export async function deleteManyAgent(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await db.deleteManyAgent(id);
  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function getManyAgentById(id: string): Promise<ManyAgent | null> {
  const result = await db.getManyAgent(id);
  return result.success ? result.data ?? null : null;
}

export async function listAgentFolders(projectId = 'default'): Promise<DomeAgentFolder[]> {
  if (!db.isAvailable()) return [];
  const result = await db.listAgentFolders(projectId);
  return result.success && Array.isArray(result.data) ? result.data : [];
}

export async function createAgentFolderRecord(
  name: string,
  parentId?: string | null,
  projectId = 'default',
): Promise<{ success: boolean; data?: DomeAgentFolder; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const now = Date.now();
  const folder: DomeAgentFolder = {
    id: generateId(),
    projectId,
    parentId: parentId ?? null,
    name: name.trim() || 'Folder',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await db.createAgentFolder(folder);
  return saved.success && saved.data
    ? { success: true, data: saved.data }
    : { success: false, error: saved.error };
}

export async function updateAgentFolderRecord(
  id: string,
  updates: Partial<Pick<DomeAgentFolder, 'parentId' | 'name' | 'sortOrder'>>,
): Promise<{ success: boolean; data?: DomeAgentFolder; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const saved = await db.updateAgentFolder(id, updates);
  return saved.success && saved.data
    ? { success: true, data: saved.data }
    : { success: false, error: saved.error };
}

export async function deleteAgentFolderRecord(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };
  const result = await db.deleteAgentFolder(id);
  return result.success ? { success: true } : { success: false, error: result.error };
}

/** Serialize one or more agents to JSON for export */
export function exportAgentsConfig(agents: ManyAgent[]): string {
  return JSON.stringify(agents, null, 2);
}

type ParsedAgentResult =
  | { kind: 'skip' }
  | { kind: 'agent'; agent: ManyAgent }
  | { kind: 'error'; error: string };

function readStringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value : '';
}

function readTrimmedStringField(
  raw: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readStringArrayField(raw: Record<string, unknown>, key: string): string[] {
  const value = raw[key];
  return Array.isArray(value) ? (value as string[]) : [];
}

function readIconIndexField(raw: Record<string, unknown>): number {
  const value = raw.iconIndex;
  return typeof value === 'number' && value >= 1 && value <= 18 ? value : 1;
}

function parseAgentRecord(
  raw: unknown,
  index: number,
  now: number,
): ParsedAgentResult {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'skip' };
  }
  const record = raw as Record<string, unknown>;
  const name = readStringField(record, 'name').trim();
  if (!name) {
    return { kind: 'error', error: `Agente ${index + 1}: falta el nombre` };
  }
  const folderId = readTrimmedStringField(record, 'folderId');
  return {
    kind: 'agent',
    agent: {
      id: generateId(),
      projectId: readTrimmedStringField(record, 'projectId') ?? 'default',
      name,
      description: readStringField(record, 'description'),
      systemInstructions: readStringField(record, 'systemInstructions'),
      toolIds: readStringArrayField(record, 'toolIds'),
      mcpServerIds: readStringArrayField(record, 'mcpServerIds'),
      skillIds: readStringArrayField(record, 'skillIds'),
      iconIndex: readIconIndexField(record),
      ...(folderId ? { folderId } : {}),
      favorite: record.favorite === true,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function collectAgents(parsed: unknown): { success: true; data: ManyAgent[] } | { success: false; error: string } {
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const now = Date.now();
  const agents: ManyAgent[] = [];
  for (let i = 0; i < arr.length; i++) {
    const result = parseAgentRecord(arr[i], i, now);
    if (result.kind === 'error') {
      return { success: false, error: result.error };
    }
    if (result.kind === 'agent') {
      agents.push(result.agent);
    }
  }
  if (agents.length === 0) {
    return { success: false, error: 'No se encontraron agentes válidos en el archivo' };
  }
  return { success: true, data: agents };
}

/** Validate and parse imported agent config. Returns validated agents with new IDs. */
export function parseAgentsConfig(json: string): { success: true; data: ManyAgent[] } | { success: false; error: string } {
  try {
    return collectAgents(JSON.parse(json));
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'JSON inválido' };
  }
}

/** Import agents from JSON and persist them */
export async function importAgentsConfig(
  json: string,
  targetProjectId = 'default',
): Promise<{ success: boolean; data?: ManyAgent[]; error?: string }> {
  const parsed = parseAgentsConfig(json);
  if (!parsed.success) return parsed;
  for (const agent of parsed.data) {
    const toSave: ManyAgent = {
      ...agent,
      projectId: agent.projectId ?? targetProjectId,
    };
    const saved = await db.createManyAgent(toSave);
    if (!saved.success) {
      return { success: false, error: saved.error };
    }
  }
  return { success: true, data: parsed.data };
}
