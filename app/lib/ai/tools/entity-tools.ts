/**
 * Entity Creation Tools
 *
 * Tools that allow Many to create agents and automations on behalf of the user.
 * Each tool creates the entity and returns structured data for the AI to wrap
 * in a created_entity artifact block.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { textResult, errorResult, readStringParam } from './common';
import { createManyAgent } from '@/lib/agents/api';
import { createWorkflow } from '@/lib/agent-canvas/api';
import { saveAutomation } from '@/lib/automations/api';

function normalizeWorkflowNodeType(type: unknown): string {
  if (typeof type !== 'string') return 'text-input';
  const normalized = type.trim().toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'text' || normalized === 'textinput' || normalized === 'input') return 'text-input';
  if (normalized === 'doc' || normalized === 'document' || normalized === 'documents') return 'document';
  if (normalized === 'img' || normalized === 'picture') return 'image';
  if (normalized === 'llm') return 'agent';
  if (normalized === 'result') return 'output';
  return ['text-input', 'document', 'image', 'agent', 'output'].includes(normalized)
    ? normalized
    : 'text-input';
}

function normalizeWorkflowNodes(nodes: unknown[]): unknown[] {
  return nodes.map((node, index) => {
    if (!node || typeof node !== 'object') return node;
    const record = node as Record<string, unknown>;
    const data = (record.data && typeof record.data === 'object')
      ? { ...(record.data as Record<string, unknown>) }
      : {};
    const normalizedType = normalizeWorkflowNodeType(record.type ?? data.type);
    return {
      ...record,
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `node-${index + 1}`,
      type: normalizedType,
      data: {
        ...data,
        type: normalizedType,
      },
    };
  });
}

// =============================================================================
// agent_create
// =============================================================================

const AgentCreateSchema = Type.Object({
  name: Type.String({
    description: 'Name of the agent (e.g. "Research Assistant").',
  }),
  description: Type.Optional(Type.String({
    description: 'Short description of what this agent does.',
  })),
  systemInstructions: Type.Optional(Type.String({
    description: 'System prompt / instructions for the agent. Be specific and detailed.',
  })),
  toolIds: Type.Array(Type.String(), {
    description: 'REQUIRED. Tool IDs the agent needs (e.g. ["web_fetch", "resource_create"]). Agent cannot work without tools. Never omit.',
  }),
  iconIndex: Type.Optional(Type.Number({
    description: 'Icon index 1-18 for the agent avatar. Pick randomly if unsure.',
    minimum: 1,
    maximum: 18,
  })),
});

export function createAgentCreateTool(): AnyAgentTool {
  return {
    label: 'Create Agent',
    name: 'agent_create',
    description:
      'Create a new specialized agent (hijo de Many) with a custom system prompt and tools. ' +
      'Use this when the user asks to create, build, or set up a new AI agent.',
    parameters: AgentCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const name = readStringParam(params, 'name', { required: true });
        const description = readStringParam(params, 'description') ?? '';
        const systemInstructions = readStringParam(params, 'systemInstructions') ?? '';
        const toolIds = Array.isArray(params.toolIds) ? (params.toolIds as string[]) : [];
        const iconIndex = typeof params.iconIndex === 'number'
          ? Math.max(1, Math.min(18, Math.round(params.iconIndex)))
          : Math.floor(Math.random() * 18) + 1;

        const result = await createManyAgent({
          name,
          description,
          systemInstructions,
          toolIds,
          mcpServerIds: [],
          skillIds: [],
          iconIndex,
        });

        if (!result.success || !result.data) {
          return errorResult(result.error ?? 'Error al crear el agente');
        }

        const agent = result.data;

        // Notify sidebar to refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dome:agents-changed'));
        }

        // Return data for the AI to embed in an artifact block
        return textResult(
          `ENTITY_CREATED:${JSON.stringify({
            entityType: 'agent',
            id: agent.id,
            name: agent.name,
            description: agent.description,
            config: {
              tools: toolIds.length > 0 ? toolIds.join(', ') : 'ninguna',
              instrucciones: systemInstructions ? systemInstructions.slice(0, 120) + (systemInstructions.length > 120 ? '…' : '') : '—',
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Error desconocido al crear agente');
      }
    },
  };
}

// =============================================================================
// automation_create
// =============================================================================

const ScheduleSchema = Type.Optional(
  Type.Object({
    cadence: Type.Optional(Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('cron-lite')])),
    hour: Type.Optional(Type.Number({ description: 'Hour of day (0-23)' })),
    weekday: Type.Optional(Type.Number({ description: 'Day of week 1-7 for weekly' })),
    intervalMinutes: Type.Optional(Type.Number({ description: 'Minutes between runs for cron-lite' })),
  })
);

const AutomationCreateSchema = Type.Object({
  title: Type.String({
    description: 'Name of the automation (e.g. "Daily briefing").',
  }),
  description: Type.Optional(Type.String({
    description: 'What this automation does.',
  })),
  targetType: Type.String({
    description: 'Target type: "agent" or "workflow".',
  }),
  targetId: Type.String({
    description: 'ID of the target agent or workflow to run.',
  }),
  triggerType: Type.Optional(Type.String({
    description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual.',
  })),
  prompt: Type.Optional(Type.String({
    description: 'Base prompt / instructions to pass to the agent or workflow when triggered.',
  })),
  schedule: ScheduleSchema,
  outputMode: Type.Optional(Type.String({
    description: 'Output mode: "chat_only" | "studio_output" | "mixed". Default: chat_only.',
  })),
  enabled: Type.Optional(Type.Boolean({
    description: 'Whether the automation is active immediately. Default: true.',
  })),
});

export function createAutomationCreateTool(): AnyAgentTool {
  return {
    label: 'Create Automation',
    name: 'automation_create',
    description:
      'Create a new automation that runs an agent or workflow on a trigger (manual, schedule, or contextual). ' +
      'Use when the user asks to automate, schedule, or set up a recurring task.',
    parameters: AutomationCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const description = readStringParam(params, 'description') ?? '';
        const targetType = readStringParam(params, 'targetType') ?? 'agent';
        const targetId = readStringParam(params, 'targetId', { required: true });
        const triggerType = (readStringParam(params, 'triggerType') ?? 'manual') as 'manual' | 'schedule' | 'contextual';
        const prompt = readStringParam(params, 'prompt') ?? '';
        const outputMode = (readStringParam(params, 'outputMode') ?? 'chat_only') as 'chat_only' | 'studio_output' | 'mixed';
        const enabled = typeof params.enabled === 'boolean' ? params.enabled : true;

        let schedule: {
          cadence?: 'daily' | 'weekly' | 'cron-lite';
          hour?: number;
          weekday?: number | null;
          intervalMinutes?: number;
        } | null = null;
        if (triggerType === 'schedule' && params.schedule && typeof params.schedule === 'object') {
          const s = params.schedule as Record<string, unknown>;
          const rawCadence = String(s.cadence ?? 'daily');
          const cadence: 'daily' | 'weekly' | 'cron-lite' =
            rawCadence === 'weekly' || rawCadence === 'cron-lite' ? rawCadence : 'daily';
          schedule = {
            cadence,
            hour: typeof s.hour === 'number' ? Math.max(0, Math.min(23, s.hour)) : 0,
            weekday: typeof s.weekday === 'number' ? s.weekday : null,
            intervalMinutes:
              typeof s.intervalMinutes === 'number' ? Math.max(1, s.intervalMinutes) : undefined,
          };
        }

        const automation = await saveAutomation({
          title,
          description,
          targetType: targetType as 'agent' | 'workflow',
          targetId,
          triggerType,
          enabled,
          schedule,
          inputTemplate: { prompt },
          outputMode,
        });

        return textResult(
          `ENTITY_CREATED:${JSON.stringify({
            entityType: 'automation',
            id: automation.id,
            name: title,
            description,
            config: {
              destino: targetType,
              trigger: triggerType,
              salida: outputMode,
              estado: enabled ? 'Activa' : 'Pausada',
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Error desconocido al crear automatización');
      }
    },
  };
}

// =============================================================================
// workflow_create
// =============================================================================

const WorkflowCreateSchema = Type.Object({
  name: Type.String({
    description: 'Name of the workflow (e.g. "Research Pipeline").',
  }),
  description: Type.Optional(Type.String({
    description: 'Short description of what this workflow does.',
  })),
  nodes: Type.Optional(Type.Array(Type.Unknown(), {
    description: 'Array of nodes for the workflow (ReactFlow format). Each node: { id, type, position: {x, y}, data: {...} }',
  })),
  edges: Type.Optional(Type.Array(Type.Unknown(), {
    description: 'Array of edges/connections between nodes (ReactFlow format). Each edge: { id, source, target, sourceHandle?, targetHandle? }',
  })),
});

export function createWorkflowCreateTool(): AnyAgentTool {
  return {
    label: 'Create Workflow',
    name: 'workflow_create',
    description:
      'Create a new visual workflow in the canvas with nodes and edges. ' +
      'Use this when the user asks to create, build, or set up a new workflow or automation pipeline. ' +
      'IMPORTANT: Valid node types are only "text-input", "document", "image", "agent", and "output". Never use "Document" (capitalized) or invent new node types.',
    parameters: WorkflowCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const name = readStringParam(params, 'name', { required: true });
        const description = readStringParam(params, 'description') ?? '';
        const nodes = Array.isArray(params.nodes) ? normalizeWorkflowNodes(params.nodes) : [];
        const edges = Array.isArray(params.edges) ? params.edges : [];

        const result = await createWorkflow({
          name,
          description,
          nodes: nodes as never[],
          edges: edges as never[],
        });

        if (!result.success || !result.data) {
          return errorResult(result.error ?? 'Error al crear el workflow');
        }

        const workflow = result.data;

        // Notify sidebar to refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
        }

        // Return data for the AI to embed in an artifact block
        return textResult(
          `ENTITY_CREATED:${JSON.stringify({
            entityType: 'workflow',
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            config: {
              nodos: nodes.length,
              conexiones: edges.length,
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Error desconocido al crear workflow');
      }
    },
  };
}

export function createEntityTools(): AnyAgentTool[] {
  return [createAgentCreateTool(), createWorkflowCreateTool(), createAutomationCreateTool()];
}
