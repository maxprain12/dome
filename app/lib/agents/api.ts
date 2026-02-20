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
