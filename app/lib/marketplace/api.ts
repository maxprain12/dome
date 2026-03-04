import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { MarketplaceAgent, ManyAgent } from '@/types';
import { MARKETPLACE_CATALOG } from './catalog';
import { getManyAgents, createManyAgent } from '@/lib/agents/api';

const INSTALLED_KEY = 'marketplace_installed';

async function getInstalledIds(): Promise<string[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(INSTALLED_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

async function saveInstalledIds(ids: string[]): Promise<void> {
  if (!db.isAvailable()) return;
  await db.setSetting(INSTALLED_KEY, JSON.stringify(ids));
}

export async function getMarketplaceAgents(): Promise<MarketplaceAgent[]> {
  return MARKETPLACE_CATALOG;
}

export async function getInstalledMarketplaceAgentIds(): Promise<string[]> {
  return getInstalledIds();
}

export async function isMarketplaceAgentInstalled(marketplaceId: string): Promise<boolean> {
  const ids = await getInstalledIds();
  return ids.includes(marketplaceId);
}

export async function installMarketplaceAgent(
  marketplaceId: string
): Promise<{ success: boolean; data?: ManyAgent; error?: string }> {
  const template = MARKETPLACE_CATALOG.find((a) => a.id === marketplaceId);
  if (!template) return { success: false, error: 'Agente no encontrado en el catálogo' };

  const existingAgents = await getManyAgents();
  const alreadyInstalled = existingAgents.some((a) => a.name === template.name);
  if (alreadyInstalled) {
    const ids = await getInstalledIds();
    if (!ids.includes(marketplaceId)) {
      await saveInstalledIds([...ids, marketplaceId]);
    }
    return { success: false, error: 'Ya tienes un agente con este nombre instalado' };
  }

  const result = await createManyAgent({
    name: template.name,
    description: template.description,
    systemInstructions: template.systemInstructions,
    toolIds: template.toolIds,
    mcpServerIds: template.mcpServerIds,
    skillIds: template.skillIds,
    iconIndex: template.iconIndex,
  });

  if (!result.success) return result;

  const ids = await getInstalledIds();
  await saveInstalledIds([...ids, marketplaceId]);

  window.dispatchEvent(new CustomEvent('dome:agents-changed'));

  return result;
}

export async function uninstallMarketplaceAgent(
  marketplaceId: string
): Promise<{ success: boolean; error?: string }> {
  const ids = await getInstalledIds();
  const filtered = ids.filter((id) => id !== marketplaceId);
  await saveInstalledIds(filtered);
  return { success: true };
}
