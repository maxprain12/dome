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

/**
 * Coerce a tool's `parameters` into a valid, non-empty JSON Schema object.
 *
 * No-argument tools often arrive with `{}` (or no schema at all). Strict
 * OpenAI-compatible providers — notably MiniMax — reject that with
 * "invalid params, function parameters is empty (2013)". An object schema with
 * an (empty) `properties` map is the correct representation and is accepted by
 * every provider.
 */
export function normalizeToolParameters(raw: unknown): Record<string, unknown> {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? ({ ...(raw as Record<string, unknown>) })
      : {};
  // Always guarantee a valid object schema. Strict providers (MiniMax) reject
  // empty/typeless `parameters` with "function parameters is empty (2013)".
  if (typeof obj.type !== 'string') obj.type = 'object';
  if (obj.type === 'object' && (obj.properties == null || typeof obj.properties !== 'object')) {
    obj.properties = {};
  }
  return obj;
}

/**
 * Model-facing serialization ceiling. A raw tool output that serializes beyond
 * this is dropped to a notice instead of letting V8 build an unbounded string
 * (the ELECTRON-7 OOM signature — `JsonStringify` "Zone" exhaustion).
 */
const OUTPUT_BUDGET_CHARS = 16 * 1024 * 1024;

/**
 * Structured `details` ceiling. The agent loop persists `details` verbatim into
 * the session JSONL (`createToolResultMessage` → `appendEntry` →
 * `JSON.stringify(entry)`), so an unbounded `details` OOMs the main process at
 * persistence time even when the model-facing text is small. ~1M chars.
 */
const DETAILS_BUDGET_CHARS = 1024 * 1024;

/**
 * `JSON.stringify` that aborts once the (approximate) output passes `budget`
 * instead of growing without bound. The replacer is invoked for every node
 * before it is written, so throwing stops V8 before the output buffer can
 * exceed the budget. Returns `null` when the value is too large; rethrows
 * genuine serialization errors (circular refs, BigInt) to the caller.
 */
function stringifyWithinBudget(value: unknown, budget: number): string | null {
  let approx = 0;
  const ABORT = {};
  try {
    return (
      JSON.stringify(value, (key, val) => {
        approx += key.length + 2;
        const t = typeof val;
        if (t === 'string') approx += (val as string).length + 2;
        else if (t === 'number' || t === 'boolean' || val === null) approx += 6;
        if (approx > budget) throw ABORT;
        return val;
      }) ?? ''
    );
  } catch (err) {
    if (err === ABORT) return null;
    throw err;
  }
}

const TOO_LARGE_NOTICE = JSON.stringify({
  error: 'tool_result_too_large',
  message:
    'Dome: tool output exceeded the serialization limit and was dropped to protect the app from ' +
    'running out of memory. Retry with pagination, filters, or a narrower query.',
});

function stringifyToolOutput(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    const s = stringifyWithinBudget(raw, OUTPUT_BUDGET_CHARS);
    return s === null ? TOO_LARGE_NOTICE : s;
  } catch {
    return String(raw);
  }
}

/**
 * Soft model-facing cap (~48k chars default). Native tools previously only had
 * the 16MB hard serialization budget, which let multi-MB shell/file results
 * into the session JSONL and blow the context window.
 */
const SOFT_CAP_CHARS = 48_000;
const SOFT_CAP_BY_TOOL: Record<string, number> = {
  directory_tree: 12_000,
  list_directory_with_sizes: 24_000,
  search_files: 32_000,
  file_tree: 32_000,
  shell_exec: 48_000,
  file_read: 48_000,
  file_grep: 48_000,
  file_find: 32_000,
  file_search: 32_000,
  file_edit: 48_000,
};

function softCapForTool(toolName: string): number {
  const key = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const cap = SOFT_CAP_BY_TOOL[key];
  return typeof cap === 'number' && cap > 2000 ? cap : SOFT_CAP_CHARS;
}

function capModelFacingText(toolName: string, text: string): string {
  const maxChars = softCapForTool(toolName);
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.5);
  return (
    `${text.slice(0, head)}\n\n` +
    `[Dome: tool result truncated — ${text.length} chars → ~${head} shown. Tool: ${toolName}. ` +
    'Use smaller pages/batches, filters, or follow-up calls to retrieve the rest.]'
  );
}

/**
 * Bound a tool result's `details` so the persisted session entry can never grow
 * without limit. Returns the value untouched when it fits the budget, or a tiny
 * marker when it is too large / unserializable (ELECTRON-7 guard).
 */
function boundToolDetails(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'string') {
    return raw.length <= DETAILS_BUDGET_CHARS
      ? raw
      : { _domeOmitted: 'tool_result_too_large', approxChars: raw.length };
  }
  if (typeof raw !== 'object') return raw;
  try {
    return stringifyWithinBudget(raw, DETAILS_BUDGET_CHARS) === null
      ? { _domeOmitted: 'tool_result_too_large' }
      : raw;
  } catch {
    return { _domeOmitted: 'tool_result_unserializable' };
  }
}

/** Build one `AgentTool` from a definition + ops. Exported for per-family use. */
export function createToolFromDefinition(def: ToolDefinition, ops: ToolOps): AgentTool | null {
  const name = toolDefName(def);
  if (!name) return null;
  const description = def.function?.description || def.description || '';
  const parameters = normalizeToolParameters(def.function?.parameters || def.parameters);
  return {
    name,
    description,
    label: labelForTool(name),
    parameters: Type.Unsafe(parameters),
    async execute(_toolCallId, params): Promise<AgentToolResult> {
      let raw: unknown;
      try {
        raw = await ops.executeToolInMain(name, params);
      } catch (err) {
        // AgentTool contract: throw on failure. The loop converts the throw into
        // an `isError` tool result — the model still sees the message text, and
        // the flag survives into the session JSONL and UI tool cards.
        if ((err as { isAgentInterrupt?: boolean })?.isAgentInterrupt === true) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Tool "${name}" failed: ${message}`);
      }
      return {
        content: [{ type: 'text', text: capModelFacingText(name, stringifyToolOutput(raw)) }],
        details: boundToolDetails(raw),
      };
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
