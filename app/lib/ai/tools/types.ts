/**
 * AI Tools Types
 * 
 * Type definitions for the AI tools system.
 * Based on clawdbot's pi-agent-core types.
 */

import type { TSchema, Static } from '@sinclair/typebox';

// =============================================================================
// Tool Result Types
// =============================================================================

/**
 * Content types that can be returned by a tool
 */
export type ToolResultContentType = 'text' | 'image' | 'json';

/**
 * Text content in a tool result
 */
export interface ToolResultTextContent {
  type: 'text';
  text: string;
}

/**
 * Image content in a tool result
 */
export interface ToolResultImageContent {
  type: 'image';
  data: string; // Base64 encoded
  mimeType: string;
}

/**
 * JSON content in a tool result (for structured data)
 */
export interface ToolResultJsonContent {
  type: 'json';
  data: unknown;
}

/**
 * Union of all tool result content types
 */
export type ToolResultContent = 
  | ToolResultTextContent 
  | ToolResultImageContent 
  | ToolResultJsonContent;

/**
 * Result returned by a tool execution
 */
export interface AgentToolResult<T = unknown> {
  /** Content parts of the result */
  content: ToolResultContent[];
  /** Optional structured details for programmatic access */
  details?: T;
  /** Whether the result is an error */
  isError?: boolean;
}

// =============================================================================
// Tool Update Types
// =============================================================================

/**
 * Progress update during tool execution
 */
export interface ToolProgressUpdate {
  type: 'progress';
  message: string;
  progress?: number; // 0-100
}

/**
 * Partial result update during tool execution
 */
export interface ToolPartialUpdate<T = unknown> {
  type: 'partial';
  content: ToolResultContent[];
  details?: T;
}

/**
 * Union of all tool update types
 */
export type ToolUpdate<T = unknown> = ToolProgressUpdate | ToolPartialUpdate<T>;

/**
 * Callback for tool execution updates
 */
export type ToolUpdateCallback<T = unknown> = (update: ToolUpdate<T>) => void;

// =============================================================================
// Tool Definition Types
// =============================================================================

/**
 * Execute function signature for a tool
 */
export type ToolExecuteFunction<TParams, TResult = unknown> = (
  toolCallId: string,
  params: TParams,
  signal?: AbortSignal,
  onUpdate?: ToolUpdateCallback<TResult>,
) => Promise<AgentToolResult<TResult>>;

/**
 * Agent tool definition
 */
export interface AgentTool<Schema extends TSchema = TSchema, TResult = unknown> {
  /** Human-readable label for the tool */
  label: string;
  /** Unique tool name (lowercase, snake_case) */
  name: string;
  /** Description for the AI model */
  description: string;
  /** TypeBox schema for parameters */
  parameters: Schema;
  /** Tool execution function */
  execute: ToolExecuteFunction<Static<Schema>, TResult>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Any agent tool (for collections)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<any, unknown>;

// =============================================================================
// Tool Definition for AI APIs
// =============================================================================

/**
 * Tool definition format for OpenAI-compatible APIs
 */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

/**
 * Tool definition format for Anthropic API
 */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Tool definition format for Google Gemini API
 */
export interface GeminiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// =============================================================================
// Tool Call Types
// =============================================================================

/**
 * Tool call from the AI model
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool call result to send back to the model
 */
export interface ToolCallResult {
  toolCallId: string;
  result: AgentToolResult;
}

// =============================================================================
// Tool Registry Types
// =============================================================================

/**
 * Tool registry for managing available tools
 */
export interface ToolRegistry {
  /** Get all registered tools */
  getTools(): AnyAgentTool[];
  /** Get a tool by name */
  getTool(name: string): AnyAgentTool | undefined;
  /** Register a new tool */
  register(tool: AnyAgentTool): void;
  /** Unregister a tool by name */
  unregister(name: string): boolean;
  /** Check if a tool exists */
  has(name: string): boolean;
}

// =============================================================================
// Tool Policy Types
// =============================================================================

/**
 * Tool filtering policy
 */
export interface ToolPolicy {
  /** Tools to allow (whitelist) */
  allow?: string[];
  /** Tools to deny (blacklist) */
  deny?: string[];
  /** Tool profile to use */
  profile?: 'minimal' | 'coding' | 'messaging' | 'full';
}

/**
 * Resolved tool policy after merging
 */
export interface ResolvedToolPolicy {
  allowedTools: Set<string>;
  deniedTools: Set<string>;
}

// =============================================================================
// Tool Execution Context
// =============================================================================

/**
 * Context available during tool execution
 */
export interface ToolExecutionContext {
  /** Current working directory */
  cwd?: string;
  /** Workspace directory */
  workspaceDir?: string;
  /** Session key for the current conversation */
  sessionKey?: string;
  /** Agent ID if running as an agent */
  agentId?: string;
  /** Additional context data */
  data?: Record<string, unknown>;
}
