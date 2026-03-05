import { db } from '@/lib/db/client';
import type { MarketplaceAgent, ManyAgent } from '@/types';
import type { CanvasWorkflow, WorkflowTemplate } from '@/types/canvas';
import { loadMarketplaceAgents } from './loaders';
import { getManyAgents, createManyAgent, deleteManyAgent, updateManyAgent } from '@/lib/agents/api';
import { createWorkflow, deleteWorkflow, getWorkflow, getWorkflows, updateWorkflow } from '@/lib/agent-canvas/api';
import { summarizeCapabilityProfile } from '@/lib/ai/shared-capabilities';

const INSTALLED_KEY = 'marketplace_installed';
const INSTALLED_WORKFLOWS_KEY = 'marketplace_installed_workflows';
const TEMPLATE_TO_WORKFLOW_KEY = 'marketplace_template_to_workflow';
const INSTALLED_AGENT_RECORDS_KEY = 'marketplace_agent_records';
const INSTALLED_WORKFLOW_RECORDS_KEY = 'marketplace_workflow_records';

export interface InstalledMarketplaceAgentRecord {
  marketplaceId: string;
  localAgentId: string;
  version: string;
  author: string;
  source: 'official' | 'community';
  installedAt: number;
  updatedAt: number;
  capabilities: string[];
  resourceAffinity: string[];
}

export interface InstalledMarketplaceWorkflowRecord {
  templateId: string;
  localWorkflowId: string;
  version: string;
  author: string;
  source: 'official' | 'community';
  installedAt: number;
  updatedAt: number;
  capabilities: string[];
  resourceAffinity: string[];
}

async function readJsonSetting<T>(key: string, fallback: T): Promise<T> {
  if (!db.isAvailable()) return fallback;
  const result = await db.getSetting(key);
  if (!result.success || !result.data) return fallback;
  try {
    return JSON.parse(result.data) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonSetting(key: string, value: unknown): Promise<void> {
  if (!db.isAvailable()) return;
  await db.setSetting(key, JSON.stringify(value));
}

async function getInstalledIds(): Promise<string[]> {
  const parsed = await readJsonSetting<unknown>(INSTALLED_KEY, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

async function saveInstalledIds(ids: string[]): Promise<void> {
  await writeJsonSetting(INSTALLED_KEY, ids);
}

async function getAgentRecords(): Promise<Record<string, InstalledMarketplaceAgentRecord>> {
  const parsed = await readJsonSetting<unknown>(INSTALLED_AGENT_RECORDS_KEY, {});
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, InstalledMarketplaceAgentRecord>) : {};
}

async function saveAgentRecords(records: Record<string, InstalledMarketplaceAgentRecord>): Promise<void> {
  await writeJsonSetting(INSTALLED_AGENT_RECORDS_KEY, records);
}

function shallowEqualStringArrays(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function shallowEqualRecordKeys<T>(a: Record<string, T>, b: Record<string, T>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return shallowEqualStringArrays(aKeys, bKeys);
}

function shallowEqualJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function resolveInstalledAgentState(): Promise<{
  ids: string[];
  records: Record<string, InstalledMarketplaceAgentRecord>;
}> {
  const [storedIds, storedRecords, localAgents] = await Promise.all([
    getInstalledIds(),
    getAgentRecords(),
    getManyAgents(),
  ]);

  const ids = new Set<string>();
  const records: Record<string, InstalledMarketplaceAgentRecord> = {};
  const now = Date.now();

  for (const agent of localAgents) {
    if (!agent.marketplaceId) continue;
    ids.add(agent.marketplaceId);
  }

  for (const marketplaceId of storedIds) {
    const localAgent = localAgents.find(
      (agent) =>
        agent.marketplaceId === marketplaceId ||
        agent.id === storedRecords[marketplaceId]?.localAgentId
    );
    if (!localAgent) continue;

    ids.add(marketplaceId);
    const existingRecord = storedRecords[marketplaceId];
    records[marketplaceId] = {
      marketplaceId,
      localAgentId: localAgent.id,
      version: existingRecord?.version ?? 'unknown',
      author: existingRecord?.author ?? 'Unknown',
      source: existingRecord?.source ?? 'official',
      installedAt: existingRecord?.installedAt ?? now,
      updatedAt: existingRecord?.updatedAt ?? now,
      capabilities: existingRecord?.capabilities ?? [],
      resourceAffinity: existingRecord?.resourceAffinity ?? [],
    };
  }

  for (const [marketplaceId, record] of Object.entries(storedRecords)) {
    const localAgent = localAgents.find(
      (agent) =>
        agent.marketplaceId === marketplaceId ||
        agent.id === record.localAgentId
    );
    if (!localAgent) continue;

    ids.add(marketplaceId);
    records[marketplaceId] = {
      ...record,
      localAgentId: localAgent.id,
    };
  }

  const sortedIds = Array.from(ids).sort();
  if (!shallowEqualStringArrays([...storedIds].sort(), sortedIds)) {
    await saveInstalledIds(sortedIds);
  }
  if (!shallowEqualRecordKeys(storedRecords, records) || !shallowEqualJson(storedRecords, records)) {
    await saveAgentRecords(records);
  }

  return { ids: sortedIds, records };
}

export async function getMarketplaceAgents(): Promise<MarketplaceAgent[]> {
  return loadMarketplaceAgents();
}

export async function getInstalledMarketplaceAgentIds(): Promise<string[]> {
  const state = await resolveInstalledAgentState();
  return state.ids;
}

export async function getInstalledMarketplaceAgentRecords(): Promise<Record<string, InstalledMarketplaceAgentRecord>> {
  const state = await resolveInstalledAgentState();
  return state.records;
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
  const existingByMarketplace = existingAgents.find((agent) => agent.marketplaceId === marketplaceId);
  const existingByName = existingAgents.find((agent) => agent.name === template.name);
  const source = template.source ?? 'official';
  const capabilities = template.capabilities ?? summarizeCapabilityProfile(template.toolIds);
  const resourceAffinity = template.resourceAffinity ?? capabilities.filter((capability) => capability === 'library' || capability === 'writing');

  let result: { success: boolean; data?: ManyAgent; error?: string };

  if (existingByMarketplace) {
    result = await updateManyAgent(existingByMarketplace.id, {
      name: template.name,
      description: template.description,
      systemInstructions: template.systemInstructions,
      toolIds: template.toolIds,
      mcpServerIds: template.mcpServerIds,
      skillIds: template.skillIds,
      iconIndex: template.iconIndex,
      marketplaceId,
    });
  } else if (existingByName) {
    result = await updateManyAgent(existingByName.id, {
      description: template.description,
      systemInstructions: template.systemInstructions,
      toolIds: template.toolIds,
      mcpServerIds: template.mcpServerIds,
      skillIds: template.skillIds,
      iconIndex: template.iconIndex,
      marketplaceId,
    });
  } else {
    result = await createManyAgent({
      name: template.name,
      description: template.description,
      systemInstructions: template.systemInstructions,
      toolIds: template.toolIds,
      mcpServerIds: template.mcpServerIds,
      skillIds: template.skillIds,
      iconIndex: template.iconIndex,
      marketplaceId: marketplaceId,
    });
  }

  if (!result.success) return result;

  const ids = await getInstalledIds();
  if (!ids.includes(marketplaceId)) {
    await saveInstalledIds([...ids, marketplaceId]);
  }
  if (result.data) {
    const now = Date.now();
    const records = await getAgentRecords();
    records[marketplaceId] = {
      marketplaceId,
      localAgentId: result.data.id,
      version: template.version,
      author: template.author,
      source,
      installedAt: records[marketplaceId]?.installedAt ?? now,
      updatedAt: now,
      capabilities,
      resourceAffinity,
    };
    await saveAgentRecords(records);
  }

  window.dispatchEvent(new CustomEvent('dome:agents-changed'));

  return result;
}

export async function uninstallMarketplaceAgent(
  marketplaceId: string
): Promise<{ success: boolean; error?: string }> {
  const records = await getAgentRecords();
  const record = records[marketplaceId];
  if (record?.localAgentId) {
    await deleteManyAgent(record.localAgentId);
  }
  const ids = await getInstalledIds();
  const filtered = ids.filter((id) => id !== marketplaceId);
  await saveInstalledIds(filtered);
  if (record) {
    delete records[marketplaceId];
    await saveAgentRecords(records);
  }
  window.dispatchEvent(new CustomEvent('dome:agents-changed'));
  return { success: true };
}

// --- Workflow installation ---

async function getInstalledWorkflowIds(): Promise<string[]> {
  const parsed = await readJsonSetting<unknown>(INSTALLED_WORKFLOWS_KEY, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

async function saveInstalledWorkflowIds(ids: string[]): Promise<void> {
  await writeJsonSetting(INSTALLED_WORKFLOWS_KEY, ids);
}

async function getWorkflowRecords(): Promise<Record<string, InstalledMarketplaceWorkflowRecord>> {
  const parsed = await readJsonSetting<unknown>(INSTALLED_WORKFLOW_RECORDS_KEY, {});
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, InstalledMarketplaceWorkflowRecord>) : {};
}

async function saveWorkflowRecords(records: Record<string, InstalledMarketplaceWorkflowRecord>): Promise<void> {
  await writeJsonSetting(INSTALLED_WORKFLOW_RECORDS_KEY, records);
}

async function resolveInstalledWorkflowState(): Promise<{
  ids: string[];
  records: Record<string, InstalledMarketplaceWorkflowRecord>;
}> {
  const [storedIds, storedRecords, localWorkflows] = await Promise.all([
    getInstalledWorkflowIds(),
    getWorkflowRecords(),
    getWorkflows(),
  ]);

  const ids = new Set<string>();
  const records: Record<string, InstalledMarketplaceWorkflowRecord> = {};
  const now = Date.now();

  for (const workflow of localWorkflows) {
    const templateId = workflow.marketplace?.templateId;
    if (!templateId) continue;
    ids.add(templateId);
  }

  for (const templateId of storedIds) {
    const localWorkflow = localWorkflows.find(
      (workflow) =>
        workflow.marketplace?.templateId === templateId ||
        workflow.id === storedRecords[templateId]?.localWorkflowId
    );
    if (!localWorkflow) continue;

    ids.add(templateId);
    const existingRecord = storedRecords[templateId];
    records[templateId] = {
      templateId,
      localWorkflowId: localWorkflow.id,
      version: existingRecord?.version ?? localWorkflow.marketplace?.version ?? 'unknown',
      author: existingRecord?.author ?? localWorkflow.marketplace?.author ?? 'Unknown',
      source: existingRecord?.source ?? localWorkflow.marketplace?.source ?? 'official',
      installedAt: existingRecord?.installedAt ?? now,
      updatedAt: existingRecord?.updatedAt ?? now,
      capabilities: existingRecord?.capabilities ?? localWorkflow.marketplace?.capabilities ?? [],
      resourceAffinity: existingRecord?.resourceAffinity ?? localWorkflow.marketplace?.resourceAffinity ?? [],
    };
  }

  for (const [templateId, record] of Object.entries(storedRecords)) {
    const localWorkflow = localWorkflows.find(
      (workflow) =>
        workflow.marketplace?.templateId === templateId ||
        workflow.id === record.localWorkflowId
    );
    if (!localWorkflow) continue;

    ids.add(templateId);
    records[templateId] = {
      ...record,
      localWorkflowId: localWorkflow.id,
    };
  }

  const sortedIds = Array.from(ids).sort();
  if (!shallowEqualStringArrays([...storedIds].sort(), sortedIds)) {
    await saveInstalledWorkflowIds(sortedIds);
  }
  if (!shallowEqualRecordKeys(storedRecords, records) || !shallowEqualJson(storedRecords, records)) {
    await saveWorkflowRecords(records);
  }

  return { ids: sortedIds, records };
}

export async function getInstalledWorkflowTemplateIds(): Promise<string[]> {
  const state = await resolveInstalledWorkflowState();
  return state.ids;
}

export async function getInstalledWorkflowRecords(): Promise<Record<string, InstalledMarketplaceWorkflowRecord>> {
  const state = await resolveInstalledWorkflowState();
  return state.records;
}

export async function isWorkflowTemplateInstalled(templateId: string): Promise<boolean> {
  const ids = await getInstalledWorkflowIds();
  return ids.includes(templateId);
}

export async function installWorkflowTemplate(
  template: WorkflowTemplate
): Promise<{ success: boolean; data?: { id: string; name: string }; error?: string }> {
  const existingWorkflowId = await getWorkflowIdForTemplate(template.id);
  const marketplaceMetadata: CanvasWorkflow['marketplace'] = {
    templateId: template.id,
    version: template.version,
    source: template.source ?? 'official',
    author: template.author,
    capabilities: template.capabilities ?? summarizeCapabilityProfile([]),
    resourceAffinity: template.resourceAffinity ?? [],
  };

  const result = existingWorkflowId
    ? await updateWorkflow(existingWorkflowId, {
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
        marketplace: marketplaceMetadata,
      }).then((updateResult) => ({
        success: updateResult.success,
        data: updateResult.data ? { id: updateResult.data.id, name: updateResult.data.name } : undefined,
        error: updateResult.error,
      }))
    : await createWorkflow({
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
        marketplace: marketplaceMetadata,
      }).then((createResult) => ({
        success: createResult.success,
        data: createResult.data ? { id: createResult.data.id, name: createResult.data.name } : undefined,
        error: createResult.error,
      }));

  if (!result.success) return { success: false, error: result.error };

  const ids = await getInstalledWorkflowIds();
  if (!ids.includes(template.id)) {
    await saveInstalledWorkflowIds([...ids, template.id]);
  }

  if (result.data) {
    const mapping = await getTemplateToWorkflowMapping();
    mapping[template.id] = result.data.id;
    await saveTemplateToWorkflowMapping(mapping);

    const now = Date.now();
    const records = await getWorkflowRecords();
    records[template.id] = {
      templateId: template.id,
      localWorkflowId: result.data.id,
      version: template.version,
      author: template.author,
      source: template.source ?? 'official',
      installedAt: records[template.id]?.installedAt ?? now,
      updatedAt: now,
      capabilities: template.capabilities ?? [],
      resourceAffinity: template.resourceAffinity ?? [],
    };
    await saveWorkflowRecords(records);
  }

  window.dispatchEvent(new CustomEvent('dome:workflows-changed'));

  return {
    success: true,
    data: result.data ? { id: result.data.id, name: result.data.name } : undefined,
  };
}

async function getTemplateToWorkflowMapping(): Promise<Record<string, string>> {
  const parsed = await readJsonSetting<unknown>(TEMPLATE_TO_WORKFLOW_KEY, {});
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
}

async function saveTemplateToWorkflowMapping(mapping: Record<string, string>): Promise<void> {
  await writeJsonSetting(TEMPLATE_TO_WORKFLOW_KEY, mapping);
}

export async function getWorkflowIdForTemplate(templateId: string): Promise<string | null> {
  const mapping = await getTemplateToWorkflowMapping();
  return mapping[templateId] ?? null;
}

export async function uninstallWorkflowTemplate(templateId: string): Promise<{ success: boolean; error?: string }> {
  const workflowId = await getWorkflowIdForTemplate(templateId);
  if (workflowId) {
    await deleteWorkflow(workflowId);
  }

  const ids = await getInstalledWorkflowIds();
  await saveInstalledWorkflowIds(ids.filter((id) => id !== templateId));

  const mapping = await getTemplateToWorkflowMapping();
  if (mapping[templateId]) {
    delete mapping[templateId];
    await saveTemplateToWorkflowMapping(mapping);
  }

  const records = await getWorkflowRecords();
  if (records[templateId]) {
    delete records[templateId];
    await saveWorkflowRecords(records);
  }

  window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
  return { success: true };
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

  const records = await getWorkflowRecords();
  if (records[templateId]) {
    delete records[templateId];
    await saveWorkflowRecords(records);
  }
}
