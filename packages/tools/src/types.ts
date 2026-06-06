/**
 * @dome/tools — tool contract types.
 *
 * This package is a LEAF in the package graph (depends only on `@dome/ai`).
 * It therefore defines its own `AgentTool` shape rather than importing it from
 * `@dome/agent-core` (which would create a cycle: the target graph is
 * `agent-core → tools → ai`). The shape is **structurally identical** to
 * `@dome/agent-core`'s `AgentTool`, so a registry built here plugs straight
 * into `runAgentLoop` (the loop is duck-typed: it only reads `name` and calls
 * `execute`). If/when agent-core is refactored to import the tool type, this
 * is the definition it should re-export.
 */

import type { ToolSchema } from '@dome/ai';

export type { ToolSchema } from '@dome/ai';

/** The shape every tool returns (mirrors `@dome/agent-core` `AgentToolResult`). */
export interface AgentToolResult<Details = unknown> {
  /** Summary text the model sees on the next turn. */
  text: string;
  /** Raw output for the UI / artifact sink (optional). */
  details?: Details;
  /** If `true`, the loop ends after this tool. */
  terminate?: boolean;
  /** If present, the result is an error (model sees it as a tool error). */
  error?: string;
}

/** Context passed to a tool at execution time (subset agent-core provides). */
export interface ToolContext {
  threadId: string;
  signal: AbortSignal;
  recursionDepth: number;
  executeToolInMain?: (name: string, args: unknown) => Promise<unknown>;
}

/** A tool the model can invoke. Structurally compatible with agent-core. */
export interface AgentTool<Args = unknown, Details = unknown> {
  name: string;
  description: string;
  schema: ToolSchema;
  execute(args: Args, ctx: ToolContext): Promise<AgentToolResult<Details>>;
}

/**
 * An OpenAI-style function tool definition — the shape produced today by
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()` and consumed by the
 * legacy LangGraph path. The registry turns these into `AgentTool`s.
 */
export interface ToolDefinition {
  type?: 'function';
  function?: { name: string; description?: string; parameters?: Record<string, unknown> };
  /** Flat-style alternative (`{ name, description, parameters }`). */
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** Operations the registry injects into each tool's `execute`. */
export interface ToolOps {
  /** Bridge to main-process execution (`electron/tool-dispatcher.cjs`). */
  executeToolInMain: (name: string, args: unknown) => Promise<unknown>;
}
