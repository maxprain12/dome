/**
 * @dome/tools — `entities` family definitions (create agents/automations/workflows).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The entities-family tool names (subset of the 103-tool catalog). */
export const ENTITIES_TOOL_NAMES = ['agent_create', 'automation_create', 'workflow_create'] as const;

export type EntitiesToolName = (typeof ENTITIES_TOOL_NAMES)[number];

export function entitiesToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'agent_create',
        description:
          'Create a new specialized agent (hijo de Many) with a custom system prompt and tools. Use when the user asks to create, build, or set up a new AI agent. Do NOT delegate to subagents for this—call agent_create directly.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the agent (e.g. "Research Assistant", "Noticiero")' },
            description: { type: 'string', description: 'Short description of what this agent does' },
            system_instructions: {
              type: 'string',
              description: 'System prompt for the agent. Describe WHAT the agent will do when invoked, including step-by-step flow. Be specific.',
            },
            tool_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'REQUIRED. Tool IDs the agent needs (e.g. ["web_fetch", "resource_create"]). Agent cannot work without tools. Never omit.',
            },
            icon_index: { type: 'number', description: 'Icon index 1-18 for the agent avatar. Default: random' },
          },
          required: ['name', 'tool_ids'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'automation_create',
        description:
          'Create an automation that runs an agent or workflow on a trigger (manual, schedule, or contextual). Dome has native automations—use this, never mention n8n or Make. Use when the user asks to automate, schedule, or set up recurring tasks. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name of the automation (e.g. "Daily briefing")' },
            description: { type: 'string', description: 'What this automation does' },
            target_type: { type: 'string', description: 'Target: "agent" or "workflow"' },
            target_id: { type: 'string', description: 'ID of the target agent or workflow' },
            trigger_type: { type: 'string', description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual' },
            prompt: { type: 'string', description: 'Base prompt/instructions to pass when triggered' },
            schedule: {
              type: 'object',
              description: 'For trigger_type "schedule". cadence: "daily"|"weekly"|"cron-lite", hour: 0-23, weekday: 1-7 (for weekly), intervalMinutes (for cron-lite)',
              properties: {
                cadence: { type: 'string', enum: ['daily', 'weekly', 'cron-lite'] },
                hour: { type: 'number', description: 'Hour of day (0-23)' },
                weekday: { type: 'number', description: 'Day of week 1-7 for weekly' },
                interval_minutes: { type: 'number', description: 'Minutes between runs for cron-lite' },
              },
            },
            output_mode: { type: 'string', description: '"chat_only" | "note" | "studio_output" | "mixed". Use "note" when agent creates a resource' },
            enabled: { type: 'boolean', description: 'Whether active. Default: true' },
          },
          required: ['title', 'target_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'workflow_create',
        description:
          'Create a new visual workflow (canvas) with nodes and edges. Valid node types: text-input, document, image, agent, output.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Workflow name (required)' },
            description: { type: 'string', description: 'Short description' },
            project_id: { type: 'string', description: 'Project ID (default: default)' },
            nodes: {
              type: 'array',
              description: 'Nodes: { id?, type, position?: {x,y}, data?: {} }',
            },
            edges: {
              type: 'array',
              description: 'Edges: { id?, source, target, sourceHandle?, targetHandle? }',
            },
          },
          required: ['name'],
        },
      },
    },
  ];
}
