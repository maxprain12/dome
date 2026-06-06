/**
 * @dome/tools — the tool registry.
 *
 * `createToolRegistry` turns the OpenAI-style `ToolDefinition[]` produced by
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()` into `AgentTool[]`
 * the Dome-native runtime (`@dome/agent-core` `runAgentLoop`) consumes. Each
 * tool's `execute` bridges to the main-process dispatcher via the injected
 * `executeToolInMain` (Phase 3 keeps execution in the dispatcher; per-family
 * native execution moves here incrementally).
 *
 * This is the canonical home for the bridge that previously lived inline in
 * `electron/agent-runtime.cjs#buildAgentToolsFromDefinitions` — the selector
 * now imports it from here so there is one source of truth.
 */

import type { AgentTool, ToolDefinition, ToolOps } from './types.js';

/** Read the tool name from either the nested (`function.name`) or flat shape. */
export function toolDefName(def: ToolDefinition): string {
  return (def && (def.function?.name || def.name)) || '';
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
    schema: { type: 'function', function: { name, description, parameters } },
    async execute(args) {
      try {
        const raw = await ops.executeToolInMain(name, args);
        let text: string;
        if (typeof raw === 'string') {
          text = raw;
        } else {
          try {
            text = JSON.stringify(raw);
          } catch {
            text = String(raw);
          }
        }
        return { text, details: raw };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { text: `Tool "${name}" failed: ${message}`, error: message };
      }
    },
  };
}

/**
 * Build the full registry from definitions + ops. Definitions without a name
 * are dropped. The result is consumed as `AgentState.tools`.
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
