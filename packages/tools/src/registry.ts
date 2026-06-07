/**
 * @dome/tools — the tool registry.
 *
 * `createToolRegistry` turns the OpenAI-style `ToolDefinition[]` produced by
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()` into `AgentTool[]` the
 * agent loop consumes. Each tool's `execute` bridges to the main-process
 * dispatcher via the injected `executeToolInMain`.
 *
 * The OpenAI-style JSON-schema `parameters` are wrapped with `Type.Unsafe` so
 * the loop's argument validator (`validateToolArguments`) and the provider
 * connectors both receive a schema in the shape they expect.
 */

import { Type } from 'typebox';
import { labelForTool } from './labels.js';
import type { AgentTool, AgentToolResult, ToolDefinition, ToolOps } from './types.js';

/** Read the tool name from either the nested (`function.name`) or flat shape. */
export function toolDefName(def: ToolDefinition): string {
  return (def && (def.function?.name || def.name)) || '';
}

function stringifyToolOutput(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/** Build one `AgentTool` from a definition + ops. Exported for per-family use. */
export function createToolFromDefinition(def: ToolDefinition, ops: ToolOps): AgentTool | null {
  const name = toolDefName(def);
  if (!name) return null;
  const description = def.function?.description || def.description || '';
  const parameters = def.function?.parameters || def.parameters || {};
  return {
    name,
    description,
    label: labelForTool(name),
    parameters: Type.Unsafe(parameters),
    async execute(_toolCallId, params): Promise<AgentToolResult> {
      try {
        const raw = await ops.executeToolInMain(name, params);
        return { content: [{ type: 'text', text: stringifyToolOutput(raw) }], details: raw };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Tool "${name}" failed: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

/**
 * Build the full registry from definitions + ops. Definitions without a name
 * are dropped. The result is consumed as the agent context `tools`.
 */
export function createToolRegistry(
  definitions: ToolDefinition[] | undefined,
  ops: ToolOps,
): AgentTool[] {
  const list = Array.isArray(definitions) ? definitions : [];
  const tools: AgentTool[] = [];
  for (const def of list) {
    const tool = createToolFromDefinition(def, ops);
    if (tool) tools.push(tool);
  }
  return tools;
}
