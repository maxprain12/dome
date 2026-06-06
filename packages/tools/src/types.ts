/**
 * @dome/tools — tool contract types.
 *
 * This package is a LEAF in the package graph (depends only on `@dome/ai`).
 * It therefore defines its own `AgentTool` shape rather than importing it from
 * `@dome/agent-core` (which would create a cycle: the target graph is
 * `agent-core → tools → ai`). The shape is **structurally identical** to
 * `@dome/agent-core`'s `AgentTool`, so a registry built here plugs straight
 * into the agent loop, which validates arguments against `parameters` and calls
 * `execute(toolCallId, params, signal, onUpdate)`.
 */

import type { ImageContent, TextContent, Tool } from '@dome/ai';
import type { Static, TSchema } from 'typebox';

export type { ToolSchema } from '@dome/ai';

/** Final or partial result produced by a tool (structural mirror of agent-core). */
export interface AgentToolResult<Details = unknown> {
  /** Text or image content returned to the model. */
  content: (TextContent | ImageContent)[];
  /** Arbitrary structured details for logs / artifact sink / UI rendering. */
  details: Details;
  /** If `true`, the loop may end after this tool batch. */
  terminate?: boolean;
}

/** Callback used by tools to stream partial execution updates. */
export type AgentToolUpdateCallback<Details = unknown> = (
  partialResult: AgentToolResult<Details>,
) => void;

/** Context passed to a tool at execution time (subset agent-core provides). */
export interface ToolContext {
  threadId: string;
  signal: AbortSignal;
  recursionDepth: number;
  executeToolInMain?: (name: string, args: unknown) => Promise<unknown>;
}

/**
 * A tool the model can invoke. Structurally compatible with the agent loop's
 * `AgentTool`: it extends the base `Tool` (name/description/parameters) and adds
 * a UI label plus an `execute` that receives the tool-call id, validated params,
 * an abort signal and an optional streaming-update callback.
 */
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = unknown>
  extends Tool<TParameters> {
  /** Human-readable label for UI display. */
  label: string;
  /** Optional compatibility shim for raw tool-call arguments before validation. */
  prepareArguments?: (args: unknown) => Static<TParameters>;
  /** Execute the tool call. */
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  /** Per-tool execution mode override (`sequential` | `parallel`). */
  executionMode?: 'sequential' | 'parallel';
}

/**
 * An OpenAI-style function tool definition — the shape produced today by
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`. The registry turns
 * these into `AgentTool`s.
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
