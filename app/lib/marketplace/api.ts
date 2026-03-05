import { db } from '@/lib/db/client';
import { generateId } from '@/lib/utils';
import type { MarketplaceAgent, ManyAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';
import { loadMarketplaceAgents } from './loaders';
import { getManyAgents, createManyAgent } from '@/lib/agents/api';
import { createWorkflow } from '@/lib/agent-canvas/api';

const INSTALLED_KEY = 'marketplace_installed';
const INSTALLED_WORKFLOWS_KEY = 'marketplace_installed_workflows';
const TEMPLATE_TO_WORKFLOW_KEY = 'marketplace_template_to_workflow';

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
  return loadMarketplaceAgents();
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
  const catalog = await loadMarketplaceAgents();
  const template = catalog.find((a) => a.id === marketplaceId);
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
    marketplaceId: marketplaceId,
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

// --- Workflow installation ---

async function getInstalledWorkflowIds(): Promise<string[]> {
  if (!db.isAvailable()) return [];
  const result = await db.getSetting(INSTALLED_WORKFLOWS_KEY);
  if (!result.success || !result.data) return [];
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

async function saveInstalledWorkflowIds(ids: string[]): Promise<void> {
  if (!db.isAvailable()) return;
  await db.setSetting(INSTALLED_WORKFLOWS_KEY, JSON.stringify(ids));
}

export async function getInstalledWorkflowTemplateIds(): Promise<string[]> {
  return getInstalledWorkflowIds();
}

export async function isWorkflowTemplateInstalled(templateId: string): Promise<boolean> {
  const ids = await getInstalledWorkflowIds();
  return ids.includes(templateId);
}

export async function installWorkflowTemplate(
  template: WorkflowTemplate
): Promise<{ success: boolean; data?: { id: string; name: string }; error?: string }> {
  const result = await createWorkflow({
    name: template.name,
    description: template.description,
    nodes: template.nodes,
    edges: template.edges,
  });

  if (!result.success) return { success: false, error: result.error };

  const ids = await getInstalledWorkflowIds();
  if (!ids.includes(template.id)) {
    await saveInstalledWorkflowIds([...ids, template.id]);
  }

  if (result.data) {
    const mapping = await getTemplateToWorkflowMapping();
    mapping[template.id] = result.data.id;
    await saveTemplateToWorkflowMapping(mapping);
  }

  window.dispatchEvent(new CustomEvent('dome:workflows-changed'));

  return {
    success: true,
    data: result.data ? { id: result.data.id, name: result.data.name } : undefined,
  };
}

async function getTemplateToWorkflowMapping(): Promise<Record<string, string>> {
  if (!db.isAvailable()) return {};
  const result = await db.getSetting(TEMPLATE_TO_WORKFLOW_KEY);
  if (!result.success || !result.data) return {};
  try {
    const parsed = JSON.parse(result.data) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveTemplateToWorkflowMapping(mapping: Record<string, string>): Promise<void> {
  if (!db.isAvailable()) return;
  await db.setSetting(TEMPLATE_TO_WORKFLOW_KEY, JSON.stringify(mapping));
}

export async function getWorkflowIdForTemplate(templateId: string): Promise<string | null> {
  const mapping = await getTemplateToWorkflowMapping();
  return mapping[templateId] ?? null;
}

/**
 * Sync marketplace state when a workflow is deleted from the library.
 * Removes the template from installed list and mapping so the marketplace shows "not installed".
 */
export async function syncMarketplaceOnWorkflowDelete(workflowId: string): Promise<void> {
  const mapping = await getTemplateToWorkflowMapping();
  const templateId = Object.entries(mapping).find(([, wfId]) => wfId === workflowId)?.[0];
  if (!templateId) return;

  const ids = await getInstalledWorkflowIds();
  await saveInstalledWorkflowIds(ids.filter((id) => id !== templateId));

  const { [templateId]: _, ...rest } = mapping;
  await saveTemplateToWorkflowMapping(rest);
}
