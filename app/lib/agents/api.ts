/**
 * Many Agents API - CRUD for specialized agents (hijos de Many)
 * Uses settings.many_agents (JSON) for persistence
 */

import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { ManyAgent } from '@/types';

const SETTINGS_KEY = 'many_agents';

async function getAll(): Promise<ManyAgent[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(SETTINGS_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(agents: ManyAgent[]): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database not available' };
  const result = await db.setSetting(SETTINGS_KEY, JSON.stringify(agents));
  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function getManyAgents(): Promise<ManyAgent[]> {
  return getAll();
}

export async function createManyAgent(
  data: Omit<ManyAgent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: ManyAgent; error?: string }> {
  const agents = await getAll();
  const now = Date.now();
  const agent: ManyAgent = {
    id: generateId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  agents.push(agent);
  const saved = await saveAll(agents);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: agent };
}

export async function updateManyAgent(
  id: string,
  updates: Partial<Omit<ManyAgent, 'id' | 'createdAt'>>
): Promise<{ success: boolean; data?: ManyAgent; error?: string }> {
  const agents = await getAll();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return { success: false, error: 'Agent not found' };
  const now = Date.now();
  agents[idx] = {
    ...agents[idx],
    ...updates,
    updatedAt: now,
  };
  const saved = await saveAll(agents);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: agents[idx] };
}

export async function deleteManyAgent(id: string): Promise<{ success: boolean; error?: string }> {
  const agents = await getAll();
  const filtered = agents.filter((a) => a.id !== id);
  if (filtered.length === agents.length) return { success: false, error: 'Agent not found' };
  const saved = await saveAll(filtered);
  return saved.success ? { success: true } : { success: false, error: saved.error };
}

export async function getManyAgentById(id: string): Promise<ManyAgent | null> {
  const agents = await getAll();
  return agents.find((a) => a.id === id) ?? null;
}

/** Serialize one or more agents to JSON for export */
export function exportAgentsConfig(agents: ManyAgent[]): string {
  return JSON.stringify(agents, null, 2);
}

/** Validate and parse imported agent config. Returns validated agents with new IDs. */
export function parseAgentsConfig(json: string): { success: true; data: ManyAgent[] } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(json) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const now = Date.now();
    const agents: ManyAgent[] = [];
    for (let i = 0; i < arr.length; i++) {
      const raw = arr[i] as Record<string, unknown>;
      if (!raw || typeof raw !== 'object') continue;
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return { success: false, error: `Agente ${i + 1}: falta el nombre` };
      }
      agents.push({
        id: generateId(),
        name,
        description: typeof raw.description === 'string' ? raw.description : '',
        systemInstructions: typeof raw.systemInstructions === 'string' ? raw.systemInstructions : '',
        toolIds: Array.isArray(raw.toolIds) ? (raw.toolIds as string[]) : [],
        mcpServerIds: Array.isArray(raw.mcpServerIds) ? (raw.mcpServerIds as string[]) : [],
        skillIds: Array.isArray(raw.skillIds) ? (raw.skillIds as string[]) : [],
        iconIndex: typeof raw.iconIndex === 'number' && raw.iconIndex >= 1 && raw.iconIndex <= 18 ? raw.iconIndex : 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (agents.length === 0) {
      return { success: false, error: 'No se encontraron agentes válidos en el archivo' };
    }
    return { success: true, data: agents };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'JSON inválido' };
  }
}

/** Import agents from JSON and persist them */
export async function importAgentsConfig(json: string): Promise<{ success: boolean; data?: ManyAgent[]; error?: string }> {
  const parsed = parseAgentsConfig(json);
  if (!parsed.success) return parsed;
  const agents = await getAll();
  for (const agent of parsed.data) {
    agents.push(agent);
  }
  const saved = await saveAll(agents);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: parsed.data };
}
