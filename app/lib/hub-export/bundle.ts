/**
 * Export / import bundles for workflows and automations with recursive dependencies:
 * agents, AI skills, MCP server configs, nested workflows (for automations).
 */

import { db, type AISkillRecord } from '@/lib/db/client';
import type { MCPServerConfig, ManyAgent } from '@/types';
import type { AgentNodeData, CanvasWorkflow, SerializedNode } from '@/types/canvas';
import type { AutomationDefinition } from '@/lib/automations/api';
import { getManyAgentById, createManyAgent } from '@/lib/agents/api';
import { getWorkflow, createWorkflow } from '@/lib/agent-canvas/api';
import { getAutomation, saveAutomation } from '@/lib/automations/api';
import { normalizeMcpServerId } from '@/lib/mcp/settings';
import { generateId } from '@/lib/utils';

export const HUB_EXPORT_VERSION = 1 as const;

export type HubExportKind = 'dome-workflow-bundle' | 'dome-automation-bundle';

export interface DomeHubExportBundle {
  version: typeof HUB_EXPORT_VERSION;
  kind: HubExportKind;
  exportedAt: number;
  /** Human-readable summary for the file / UI */
  title: string;
  description?: string;
  workflows: CanvasWorkflow[];
  automations: AutomationDefinition[];
  agents: ManyAgent[];
  skills: AISkillRecord[];
  mcpServers: MCPServerConfig[];
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export function collectAgentIdsFromWorkflow(wf: CanvasWorkflow): string[] {
  const ids = new Set<string>();
  for (const n of wf.nodes) {
    const d = n.data as AgentNodeData | { type?: string; agentId?: string | null };
    if (d && d.type === 'agent' && typeof d.agentId === 'string' && d.agentId.trim()) {
      ids.add(d.agentId.trim());
    }
  }
  return [...ids];
}

async function loadAgentsByIds(agentIds: string[]): Promise<ManyAgent[]> {
  const unique = [...new Set(agentIds)];
  const agents: ManyAgent[] = [];
  for (const id of unique) {
    const a = await getManyAgentById(id);
    if (a) agents.push(deepClone(a));
  }
  return agents;
}

async function resolveSkillsAndMcp(agents: ManyAgent[]): Promise<{
  skills: AISkillRecord[];
  mcpServers: MCPServerConfig[];
}> {
  const skillIdSet = new Set<string>();
  const mcpKeySet = new Set<string>();
  for (const a of agents) {
    for (const sid of a.skillIds ?? []) {
      if (typeof sid === 'string' && sid.trim()) skillIdSet.add(sid.trim());
    }
    for (const mid of a.mcpServerIds ?? []) {
      if (typeof mid === 'string' && mid.trim()) mcpKeySet.add(normalizeMcpServerId(mid));
    }
  }

  const skillsOut: AISkillRecord[] = [];
  const mcpOut: MCPServerConfig[] = [];

  if (!db.isAvailable()) return { skills: skillsOut, mcpServers: mcpOut };

  if (skillIdSet.size > 0) {
    const sk = await db.getAISkills();
    if (sk.success && Array.isArray(sk.data)) {
      for (const s of sk.data) {
        if (skillIdSet.has(s.id)) skillsOut.push(deepClone(s));
      }
    }
  }

  if (mcpKeySet.size > 0) {
    const mc = await db.getMcpServers();
    if (mc.success && Array.isArray(mc.data)) {
      for (const server of mc.data) {
        const k = normalizeMcpServerId(server.name);
        if (mcpKeySet.has(k)) mcpOut.push(deepClone(server));
      }
    }
  }

  return { skills: skillsOut, mcpServers: mcpOut };
}

function collectMcpKeysFromAutomation(auto: AutomationDefinition): string[] {
  const keys = new Set<string>();
  const it = auto.inputTemplate;
  if (it?.mcpServerIds) {
    for (const id of it.mcpServerIds) {
      if (typeof id === 'string' && id.trim()) keys.add(normalizeMcpServerId(id));
    }
  }
  return [...keys];
}

async function resolveMcpByKeys(keys: Set<string>): Promise<MCPServerConfig[]> {
  const out: MCPServerConfig[] = [];
  if (keys.size === 0 || !db.isAvailable()) return out;
  const mc = await db.getMcpServers();
  if (!mc.success || !Array.isArray(mc.data)) return out;
  for (const server of mc.data) {
    const k = normalizeMcpServerId(server.name);
    if (keys.has(k)) out.push(deepClone(server));
  }
  return out;
}

/**
 * Export a single workflow + referenced agents + their skills & MCP configs.
 */
export async function exportWorkflowBundle(
  workflowId: string,
  meta?: { title?: string },
): Promise<{ success: true; bundle: DomeHubExportBundle } | { success: false; error: string }> {
  try {
    const wf = await getWorkflow(workflowId);
    if (!wf) return { success: false, error: 'Workflow not found' };

    const agentIds = collectAgentIdsFromWorkflow(wf);
    const agents = await loadAgentsByIds(agentIds);
    const { skills, mcpServers } = await resolveSkillsAndMcp(agents);

    const bundle: DomeHubExportBundle = {
      version: HUB_EXPORT_VERSION,
      kind: 'dome-workflow-bundle',
      exportedAt: Date.now(),
      title: meta?.title ?? wf.name,
      description: wf.description,
      workflows: [deepClone(wf)],
      automations: [],
      agents,
      skills,
      mcpServers,
    };
    return { success: true, bundle };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Export an automation + target workflow/agent and all transitive agent deps, skills, MCP.
 */
export async function exportAutomationBundle(
  automationId: string,
): Promise<{ success: true; bundle: DomeHubExportBundle } | { success: false; error: string }> {
  try {
    const auto = await getAutomation(automationId);
    if (!auto) return { success: false, error: 'Automation not found' };

    const agentsById = new Map<string, ManyAgent>();
    const workflowsOut: CanvasWorkflow[] = [];
    const mcpExtraKeys = new Set<string>(collectMcpKeysFromAutomation(auto));

    if (auto.targetType === 'agent' && auto.targetId) {
      const ag = await getManyAgentById(auto.targetId);
      if (ag) agentsById.set(ag.id, deepClone(ag));
    } else if (auto.targetType === 'workflow' && auto.targetId) {
      const wf = await getWorkflow(auto.targetId);
      if (wf) {
        workflowsOut.push(deepClone(wf));
        const innerIds = collectAgentIdsFromWorkflow(wf);
        for (const aid of innerIds) {
          const ag = await getManyAgentById(aid);
          if (ag) agentsById.set(ag.id, deepClone(ag));
        }
      }
    }

    const agents = [...agentsById.values()];
    const { skills, mcpServers } = await resolveSkillsAndMcp(agents);
    const mcpExtra = await resolveMcpByKeys(mcpExtraKeys);
    const mcpMerged = [...mcpServers];
    const seenMcp = new Set(mcpMerged.map((s) => normalizeMcpServerId(s.name)));
    for (const s of mcpExtra) {
      const k = normalizeMcpServerId(s.name);
      if (!seenMcp.has(k)) {
        seenMcp.add(k);
        mcpMerged.push(s);
      }
    }

    const bundle: DomeHubExportBundle = {
      version: HUB_EXPORT_VERSION,
      kind: 'dome-automation-bundle',
      exportedAt: Date.now(),
      title: auto.title,
      description: auto.description,
      workflows: workflowsOut,
      automations: [deepClone(auto)],
      agents,
      skills,
      mcpServers: mcpMerged,
    };
    return { success: true, bundle };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function serializeHubBundle(bundle: DomeHubExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function downloadHubBundle(filename: string, bundle: DomeHubExportBundle): void {
  const blob = new Blob([serializeHubBundle(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugExportFilenamePart(name: string): string {
  const s = name
    .trim()
    .slice(0, 48)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return s || 'export';
}

export function parseHubExportBundle(
  json: string,
): { success: true; data: DomeHubExportBundle } | { success: false; error: string } {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== 'object') return { success: false, error: 'Invalid JSON' };
    const o = raw as Record<string, unknown>;
    if (o.version !== HUB_EXPORT_VERSION) {
      return { success: false, error: `Unsupported export version: ${String(o.version)}` };
    }
    if (o.kind !== 'dome-workflow-bundle' && o.kind !== 'dome-automation-bundle') {
      return { success: false, error: 'Not a Dome hub export file' };
    }
    if (!Array.isArray(o.workflows) || !Array.isArray(o.agents) || !Array.isArray(o.automations)) {
      return { success: false, error: 'Malformed bundle' };
    }
    return { success: true, data: raw as DomeHubExportBundle };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

async function mergeMcpServers(imported: MCPServerConfig[]): Promise<void> {
  if (imported.length === 0 || !db.isAvailable()) return;
  const cur = await db.getMcpServers();
  const list = cur.success && cur.data ? [...cur.data] : [];
  const byKey = new Map(list.map((s) => [normalizeMcpServerId(s.name), s]));
  for (const s of imported) {
    const k = normalizeMcpServerId(s.name);
    if (!byKey.has(k)) {
      byKey.set(k, s);
      list.push(s);
    }
  }
  await db.replaceMcpServers(list);
}

async function mergeSkills(imported: AISkillRecord[]): Promise<void> {
  if (imported.length === 0 || !db.isAvailable()) return;
  const cur = await db.getAISkills();
  const list = cur.success && cur.data ? [...cur.data] : [];
  const ids = new Set(list.map((s) => s.id));
  for (const s of imported) {
    if (!ids.has(s.id)) {
      ids.add(s.id);
      list.push({ ...s });
    }
  }
  await db.replaceAISkills(list);
}

function remapWorkflowNodes(wf: CanvasWorkflow, agentIdMap: Map<string, string>): CanvasWorkflow {
  const nodes: SerializedNode[] = wf.nodes.map((n) => {
    const d = n.data as AgentNodeData | { type?: string; agentId?: string | null };
    if (d && d.type === 'agent' && d.agentId && agentIdMap.has(d.agentId)) {
      return {
        ...n,
        data: {
          ...(d as object),
          agentId: agentIdMap.get(d.agentId)!,
        } as AgentNodeData,
      };
    }
    return n;
  });
  return {
    ...wf,
    nodes,
    folderId: null,
    marketplace: undefined,
  };
}

export type HubImportSummary = {
  agentsCreated: number;
  workflowsCreated: number;
  automationsCreated: number;
};

/**
 * Import bundle into the given project. Creates new IDs for agents, workflows, and automations.
 */
export async function importHubBundle(
  bundle: DomeHubExportBundle,
  projectId: string,
): Promise<{ success: true; summary: HubImportSummary } | { success: false; error: string }> {
  try {
    if (!db.isAvailable()) return { success: false, error: 'Database unavailable' };

    await mergeMcpServers(bundle.mcpServers ?? []);
    await mergeSkills(bundle.skills ?? []);

    const agentIdMap = new Map<string, string>();
    for (const a of bundle.agents ?? []) {
      const oldId = a.id;
      const result = await createManyAgent({
        name: a.name,
        description: a.description ?? '',
        systemInstructions: a.systemInstructions ?? '',
        toolIds: Array.isArray(a.toolIds) ? [...a.toolIds] : [],
        mcpServerIds: Array.isArray(a.mcpServerIds) ? [...a.mcpServerIds] : [],
        skillIds: Array.isArray(a.skillIds) ? [...a.skillIds] : [],
        iconIndex: typeof a.iconIndex === 'number' ? a.iconIndex : 1,
        favorite: a.favorite === true,
        projectId,
      });
      if (!result.success || !result.data) {
        return { success: false, error: result.error ?? 'Failed to create agent' };
      }
      agentIdMap.set(oldId, result.data.id);
    }

    const workflowIdMap = new Map<string, string>();
    for (const wf of bundle.workflows ?? []) {
      const remapped = remapWorkflowNodes(wf, agentIdMap);
      const result = await createWorkflow({
        name: remapped.name,
        description: remapped.description ?? '',
        nodes: remapped.nodes,
        edges: remapped.edges,
        projectId,
        folderId: null,
      });
      if (!result.success || !result.data) {
        return { success: false, error: result.error ?? 'Failed to create workflow' };
      }
      workflowIdMap.set(wf.id, result.data.id);
    }

    let automationsCreated = 0;
    for (const auto of bundle.automations ?? []) {
      let targetId = auto.targetId;
      if (auto.targetType === 'agent') {
        targetId = agentIdMap.get(auto.targetId) ?? auto.targetId;
      } else if (auto.targetType === 'workflow') {
        targetId = workflowIdMap.get(auto.targetId) ?? auto.targetId;
      }

      await saveAutomation({
        projectId,
        title: auto.title,
        description: auto.description,
        targetType: auto.targetType,
        targetId,
        triggerType: auto.triggerType,
        schedule: auto.schedule ?? null,
        inputTemplate: auto.inputTemplate ?? null,
        outputMode: auto.outputMode ?? 'chat_only',
        enabled: auto.enabled !== false,
      });
      automationsCreated += 1;
    }

    const summary: HubImportSummary = {
      agentsCreated: bundle.agents?.length ?? 0,
      workflowsCreated: bundle.workflows?.length ?? 0,
      automationsCreated,
    };
    return { success: true, summary };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Import only the workflow portion of a bundle (workflows + agents + skills + MCP). Ignores automations.
 */
export async function importWorkflowBundleOnly(
  bundle: DomeHubExportBundle,
  projectId: string,
): Promise<{ success: true; summary: HubImportSummary } | { success: false; error: string }> {
  if (!bundle.workflows?.length) {
    return { success: false, error: 'This file does not contain any workflow to import' };
  }
  const copy: DomeHubExportBundle = { ...bundle, automations: [] };
  return importHubBundle(copy, projectId);
}

/**
 * Import automation bundle (creates agents/workflows first when present, then automations).
 */
export async function importAutomationBundleOnly(
  bundle: DomeHubExportBundle,
  projectId: string,
): Promise<{ success: true; summary: HubImportSummary } | { success: false; error: string }> {
  if (!bundle.automations?.length) {
    return { success: false, error: 'This file does not contain any automation to import' };
  }
  return importHubBundle(bundle, projectId);
}
