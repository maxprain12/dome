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
  system_instructions: Type.Optional(Type.String({
    description: 'System prompt / instructions for the agent. Be specific and detailed.',
  })),
  tool_ids: Type.Optional(Type.Array(Type.String(), {
    description: 'Deprecated — all system tools are available by default. Omit this field.',
  })),
  icon_index: Type.Optional(Type.Number({
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
      'Create a new specialized agent (hijo de Many) with a custom system prompt. ' +
      'All native Dome tools are available automatically — only specify name, instructions, and optional MCP servers. ' +
      'Use this when the user asks to create, build, or set up a new AI agent.',
    parameters: AgentCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const name = readStringParam(params, 'name', { required: true });
        const description = readStringParam(params, 'description') ?? '';
        const systemInstructions = readStringParam(params, 'system_instructions') ?? '';
        const iconIndex = typeof params.icon_index === 'number'
          ? Math.max(1, Math.min(18, Math.round(params.icon_index)))
          : Math.floor(Math.random() * 18) + 1;

        const result = await createManyAgent({
          name,
          description,
          systemInstructions,
          toolIds: [],
          mcpServerIds: [],
          skillIds: [],
          iconIndex,
        });

        if (!result.success || !result.data) {
          return errorResult(result.error ?? 'Failed to create agent');
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
              tools: 'all native tools',
              instructions: systemInstructions ? systemInstructions.slice(0, 120) + (systemInstructions.length > 120 ? '…' : '') : '—',
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Unknown error creating agent');
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
    interval_minutes: Type.Optional(Type.Number({ description: 'Minutes between runs for cron-lite' })),
  })
);

const AutomationCreateSchema = Type.Object({
  title: Type.String({
    description: 'Name of the automation (e.g. "Daily briefing").',
  }),
  description: Type.Optional(Type.String({
    description: 'What this automation does.',
  })),
  target_type: Type.String({
    description:
      'Target type: "agent" | "workflow" | "feeder". Use "feeder" to schedule a sandboxed ' +
      'script that refreshes an artifact (no LLM, no prompt, no artifact bindings).',
  }),
  target_id: Type.String({
    description:
      'ID of the target. For "agent"/"workflow", the entity ID. For "feeder", the feeder UUID ' +
      '(must be `approved=true` and `enabled=true` — list via feeder_list).',
  }),
  trigger_type: Type.Optional(Type.String({
    description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual.',
  })),
  prompt: Type.Optional(Type.String({
    description: 'Base prompt / instructions to pass to the agent or workflow when triggered. Ignored for feeders.',
  })),
  schedule: ScheduleSchema,
  output_mode: Type.Optional(Type.String({
    description: 'Output mode: "chat_only" | "studio_output" | "mixed". Default: chat_only. Ignored for feeders.',
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
      'Create a new automation that runs an agent, workflow, or feeder on a trigger (manual, schedule, or contextual). ' +
      'For minute-based feeder refresh, set trigger_type="schedule" with schedule.cadence="cron-lite" and schedule.interval_minutes. ' +
      'Use when the user asks to automate, schedule, or set up a recurring task.',
    parameters: AutomationCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const description = readStringParam(params, 'description') ?? '';
        const rawTargetType = readStringParam(params, 'target_type') ?? 'agent';
        const targetType: 'agent' | 'workflow' | 'feeder' =
          rawTargetType === 'workflow' || rawTargetType === 'feeder' ? rawTargetType : 'agent';
        const targetId = readStringParam(params, 'target_id', { required: true });
        const triggerType = (readStringParam(params, 'trigger_type') ?? 'manual') as 'manual' | 'schedule' | 'contextual';
        const isFeederTarget = targetType === 'feeder';
        const prompt = readStringParam(params, 'prompt') ?? '';
        const outputMode = (readStringParam(params, 'output_mode') ?? 'chat_only') as 'chat_only' | 'studio_output' | 'mixed';
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
          let cadence: 'daily' | 'weekly' | 'cron-lite' =
            rawCadence === 'weekly' || rawCadence === 'cron-lite' ? rawCadence : 'daily';
          // Common LLM mistake: providing interval_minutes without cadence='cron-lite'.
          // Treat the presence of interval_minutes as an unambiguous signal for cron-lite.
          if (typeof s.interval_minutes === 'number' && cadence !== 'cron-lite') {
            cadence = 'cron-lite';
          }
          schedule = {
            cadence,
            // Feeders / cron-lite are minute-based; hour gate would suppress ticks if >0.
            hour: cadence === 'cron-lite'
              ? 0
              : typeof s.hour === 'number' ? Math.max(0, Math.min(23, s.hour)) : 0,
            weekday: typeof s.weekday === 'number' ? s.weekday : null,
            intervalMinutes:
              typeof s.interval_minutes === 'number' ? Math.max(1, s.interval_minutes) : undefined,
          };
        }

        const automation = await saveAutomation({
          title,
          description,
          targetType,
          targetId,
          triggerType,
          enabled,
          schedule,
          // Feeders ignore prompt/outputMode/bindings — their script owns the data merge.
          inputTemplate: isFeederTarget ? {} : { prompt },
          outputMode: isFeederTarget ? 'chat_only' : outputMode,
        });

        return textResult(
          `ENTITY_CREATED:${JSON.stringify({
            entityType: 'automation',
            id: automation.id,
            name: title,
            description,
            config: {
              target: targetType,
              trigger: triggerType,
              output: isFeederTarget ? 'feeder-merge' : outputMode,
              schedule: schedule
                ? schedule.cadence === 'cron-lite'
                  ? `every ${schedule.intervalMinutes ?? '?'} min`
                  : schedule.cadence
                : undefined,
              status: enabled ? 'Active' : 'Paused',
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Unknown error creating automation');
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
    description: 'Array of nodes for the workflow. Each node: { id, type, position: {x, y}, data: {...} }',
  })),
  edges: Type.Optional(Type.Array(Type.Unknown(), {
    description: 'Array of edges between nodes. Each edge: { id, source, target, sourceHandle?, targetHandle? }',
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
          return errorResult(result.error ?? 'Failed to create workflow');
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
              nodes: nodes.length,
              edges: edges.length,
            },
          })}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'Unknown error creating workflow');
      }
    },
  };
}

export function createEntityTools(): AnyAgentTool[] {
  return [createAgentCreateTool(), createWorkflowCreateTool(), createAutomationCreateTool()];
}
