import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { AgentTeam } from '@/types';

const SETTINGS_KEY = 'agent_teams';

async function getAll(): Promise<AgentTeam[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(SETTINGS_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? (parsed as AgentTeam[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(teams: AgentTeam[]): Promise<{ success: boolean; error?: string }> {
  if (!db.isAvailable()) return { success: false, error: 'Database not available' };
  const result = await db.setSetting(SETTINGS_KEY, JSON.stringify(teams));
  return result.success ? { success: true } : { success: false, error: result.error };
}

export async function getAgentTeams(): Promise<AgentTeam[]> {
  return getAll();
}

export async function getAgentTeamById(id: string): Promise<AgentTeam | null> {
  const teams = await getAll();
  return teams.find((t) => t.id === id) ?? null;
}

export async function createAgentTeam(
  data: Omit<AgentTeam, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: AgentTeam; error?: string }> {
  const teams = await getAll();
  const now = Date.now();
  const team: AgentTeam = {
    id: generateId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  teams.push(team);
  const saved = await saveAll(teams);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: team };
}

export async function updateAgentTeam(
  id: string,
  updates: Partial<Omit<AgentTeam, 'id' | 'createdAt'>>
): Promise<{ success: boolean; data?: AgentTeam; error?: string }> {
  const teams = await getAll();
  const idx = teams.findIndex((t) => t.id === id);
  if (idx < 0) return { success: false, error: 'Equipo no encontrado' };
  const now = Date.now();
  teams[idx] = { ...teams[idx], ...updates, updatedAt: now };
  const saved = await saveAll(teams);
  if (!saved.success) return { success: false, error: saved.error };
  return { success: true, data: teams[idx] };
}

export async function deleteAgentTeam(id: string): Promise<{ success: boolean; error?: string }> {
  const teams = await getAll();
  const filtered = teams.filter((t) => t.id !== id);
  if (filtered.length === teams.length) return { success: false, error: 'Equipo no encontrado' };
  const saved = await saveAll(filtered);
  return saved.success ? { success: true } : { success: false, error: saved.error };
}
