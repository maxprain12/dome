/**
 * Marketplace Tools
 *
 * Tools that allow Many to search and install agents/workflows from the Dome Marketplace.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { textResult, errorResult, readStringParam } from './common';
import { loadMarketplaceAgents, loadMarketplaceWorkflows } from '@/lib/marketplace/loaders';
import { installMarketplaceAgent, installWorkflowTemplate, getInstalledMarketplaceAgentIds, getInstalledWorkflowTemplateIds } from '@/lib/marketplace/api';
import type { MarketplaceAgent } from '@/types';
import type { WorkflowTemplate } from '@/types/canvas';

// =============================================================================
// marketplace_search
// =============================================================================

const MarketplaceSearchSchema = Type.Object({
  query: Type.String({
    description: 'Search query to find agents or workflows (e.g. "research", "pdf", "writing").',
  }),
  type: Type.Optional(Type.Union([
    Type.Literal('all'),
    Type.Literal('agents'),
    Type.Literal('workflows'),
  ], {
    description: 'Type to search: "agents" or "workflows". Default: both.',
  })),
});

export function createMarketplaceSearchTool(): AnyAgentTool {
  return {
    label: 'Marketplace Search',
    name: 'marketplace_search',
    description:
      'Search the Dome Marketplace for agents and workflows. ' +
      'Use this when the user asks to browse, find, or search for agents or workflows in the marketplace.',
    parameters: MarketplaceSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true })?.toLowerCase() ?? '';
        const type = readStringParam(params, 'type') ?? 'all';

        const results: { agents: MarketplaceAgent[]; workflows: WorkflowTemplate[] } = {
          agents: [],
          workflows: [],
        };

        if (type === 'agents' || type === 'all') {
          const agents = await loadMarketplaceAgents();
          const installedIds = await getInstalledMarketplaceAgentIds();
          
          results.agents = agents
            .filter((agent) => {
              const searchText = `${agent.name} ${agent.description} ${agent.tags.join(' ')}`.toLowerCase();
              return searchText.includes(query);
            })
            .map((agent) => ({
              ...agent,
              isInstalled: installedIds.includes(agent.id),
            }));
        }

        if (type === 'workflows' || type === 'all') {
          const workflows = await loadMarketplaceWorkflows();
          const installedIds = await getInstalledWorkflowTemplateIds();
          
          results.workflows = workflows
            .filter((wf) => {
              const searchText = `${wf.name} ${wf.description} ${wf.tags.join(' ')}`.toLowerCase();
              return searchText.includes(query);
            })
            .map((wf) => ({
              ...wf,
              isInstalled: installedIds.includes(wf.id),
            }));
        }

        const output = {
          query,
          type,
          agents: results.agents.slice(0, 10).map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            author: a.author,
            tags: a.tags,
            isInstalled: (a as MarketplaceAgent & { isInstalled?: boolean }).isInstalled,
          })),
          workflows: results.workflows.slice(0, 10).map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            author: w.author,
            tags: w.tags,
            isInstalled: (w as WorkflowTemplate & { isInstalled?: boolean }).isInstalled,
          })),
        };

        return textResult(`MARKETPLACE_RESULTS:${JSON.stringify(output)}`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Error al buscar en el marketplace');
      }
    },
  };
}

// =============================================================================
// marketplace_install
// =============================================================================

const MarketplaceInstallSchema = Type.Object({
  marketplaceId: Type.String({
    description: 'The ID of the agent or workflow to install (from marketplace_search results).',
  }),
  type: Type.Union([
    Type.Literal('agent'),
    Type.Literal('workflow'),
  ], {
    description: 'Type to install: "agent" or "workflow".',
  }),
});

export function createMarketplaceInstallTool(): AnyAgentTool {
  return {
    label: 'Marketplace Install',
    name: 'marketplace_install',
    description:
      'Install an agent or workflow from the Dome Marketplace. ' +
      'Use this after marketplace_search when the user wants to install a specific agent or workflow.',
    parameters: MarketplaceInstallSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const marketplaceId = readStringParam(params, 'marketplaceId', { required: true });
        const type = readStringParam(params, 'type', { required: true });

        if (type === 'agent') {
          const result = await installMarketplaceAgent(marketplaceId);
          
          if (!result.success) {
            return errorResult(result.error ?? 'Error al instalar el agente');
          }

          const agent = result.data;
          
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dome:agents-changed'));
          }

          return textResult(
            `ENTITY_CREATED:${JSON.stringify({
              entityType: 'agent',
              id: agent?.id,
              name: agent?.name,
              description: agent?.description,
              config: {
                source: 'marketplace',
                marketplaceId,
              },
            })}`
          );
        } else if (type === 'workflow') {
          const workflows = await loadMarketplaceWorkflows();
          const template = workflows.find((w) => w.id === marketplaceId);
          
          if (!template) {
            return errorResult('Workflow no encontrado en el marketplace');
          }

          const result = await installWorkflowTemplate(template);
          
          if (!result.success) {
            return errorResult(result.error ?? 'Error al instalar el workflow');
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
          }

          return textResult(
            `ENTITY_CREATED:${JSON.stringify({
              entityType: 'workflow',
              id: result.data?.id,
              name: result.data?.name,
              description: template.description,
              config: {
                source: 'marketplace',
                marketplaceId,
              },
            })}`
          );
        }

        return errorResult('Tipo inválido: debe ser "agent" o "workflow"');
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Error desconocido al instalar');
      }
    },
  };
}

// =============================================================================
// Export
// =============================================================================

export function createMarketplaceTools(): AnyAgentTool[] {
  return [createMarketplaceSearchTool(), createMarketplaceInstallTool()];
}
