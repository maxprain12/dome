/**
 * AI Tools Adapter
 * 
 * Converts AgentTool definitions to API-specific formats.
 * Based on clawdbot's src/agents/pi-tool-definition-adapter.ts
 */

import type {
  AnyAgentTool,
  AgentToolResult,
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  GeminiToolDefinition,
  ToolCall,
  ToolCallResult,
} from './types';
import { toOpenAISchema, toAnthropicSchema, toGeminiSchema, normalizeSchema } from './schema';
import { jsonResult } from './common';

// =============================================================================
// Tool Name Normalization
// =============================================================================

/**
 * Normalize a tool name to lowercase snake_case.
 */
export function normalizeToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// =============================================================================
// OpenAI Format Adapter
// =============================================================================

/**
 * Convert an AgentTool to OpenAI tool definition format.
 */
export function toOpenAIToolDefinition(tool: AnyAgentTool): OpenAIToolDefinition {
  return {
    type: 'function',
    function: {
      name: normalizeToolName(tool.name),
      description: tool.description,
      parameters: toOpenAISchema(tool.parameters),
      strict: false, // Allow flexible parameter matching
    },
  };
}

/**
 * Convert multiple AgentTools to OpenAI tool definitions.
 */
export function toOpenAIToolDefinitions(tools: AnyAgentTool[]): OpenAIToolDefinition[] {
  return tools.map(toOpenAIToolDefinition);
}

// =============================================================================
// Anthropic Format Adapter
// =============================================================================

/**
 * Convert an AgentTool to Anthropic tool definition format.
 */
export function toAnthropicToolDefinition(tool: AnyAgentTool): AnthropicToolDefinition {
  return {
    name: normalizeToolName(tool.name),
    description: tool.description,
    input_schema: toAnthropicSchema(tool.parameters),
  };
}

/**
 * Convert multiple AgentTools to Anthropic tool definitions.
 */
export function toAnthropicToolDefinitions(tools: AnyAgentTool[]): AnthropicToolDefinition[] {
  return tools.map(toAnthropicToolDefinition);
}

// =============================================================================
// Google Gemini Format Adapter
// =============================================================================

/**
 * Convert an AgentTool to Google Gemini tool definition format.
 */
export function toGeminiToolDefinition(tool: AnyAgentTool): GeminiToolDefinition {
  const schema = toGeminiSchema(tool.parameters);
  
  return {
    name: normalizeToolName(tool.name),
    description: tool.description,
    parameters: {
      type: 'object',
      properties: (schema.properties as Record<string, unknown>) || {},
      required: (schema.required as string[]) || [],
    },
  };
}

/**
 * Convert multiple AgentTools to Gemini tool definitions.
 */
export function toGeminiToolDefinitions(tools: AnyAgentTool[]): GeminiToolDefinition[] {
  return tools.map(toGeminiToolDefinition);
}

// =============================================================================
// Generic Tool Definition
// =============================================================================

/**
 * Generic tool definition format (for internal use).
 */
export interface GenericToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    onUpdate?: (update: unknown) => void,
    signal?: AbortSignal,
  ) => Promise<AgentToolResult>;
}

/**
 * Convert an AgentTool to a generic tool definition.
 */
export function toGenericToolDefinition(tool: AnyAgentTool): GenericToolDefinition {
  const name = normalizeToolName(tool.name);
  
  return {
    name,
    label: tool.label ?? tool.name,
    description: tool.description,
    parameters: normalizeSchema(tool.parameters),
    execute: async (toolCallId, params, onUpdate, signal) => {
      try {
        return await tool.execute(toolCallId, params, signal, onUpdate);
      } catch (err) {
        // Handle abort errors
        if (signal?.aborted) throw err;
        
        const errorName = err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: unknown }).name)
          : '';
        
        if (errorName === 'AbortError') throw err;
        
        // Return error as JSON result
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[tools] ${name} failed: ${message}`);
        
        return jsonResult({
          status: 'error',
          tool: name,
          error: message,
        });
      }
    },
  };
}

/**
 * Convert multiple AgentTools to generic tool definitions.
 */
export function toGenericToolDefinitions(tools: AnyAgentTool[]): GenericToolDefinition[] {
  return tools.map(toGenericToolDefinition);
}

// =============================================================================
// Tool Execution
// =============================================================================

const TOOL_TRACE =
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
  (typeof process !== 'undefined' && process.env?.DEBUG_AI_TOOLS === '1');

function toolTraceLog(msg: string, data?: Record<string, unknown>) {
  if (TOOL_TRACE) {
    const payload = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[AI:Tools] ${msg}${payload}`);
  }
}

/**
 * Execute a tool call against a list of tools.
 */
export async function executeToolCall(
  tools: AnyAgentTool[],
  toolCall: ToolCall,
  signal?: AbortSignal,
  onUpdate?: (update: unknown) => void,
): Promise<ToolCallResult> {
  const normalizedName = normalizeToolName(toolCall.name);
  const tool = tools.find(t => normalizeToolName(t.name) === normalizedName);
  
  toolTraceLog('executeToolCall', {
    name: toolCall.name,
    found: !!tool,
    availableTools: tools.map((t) => t.name),
  });

  if (!tool) {
    toolTraceLog('tool not found', { requested: toolCall.name });
    return {
      toolCallId: toolCall.id,
      result: jsonResult({
        status: 'error',
        error: `Tool not found: ${toolCall.name}`,
      }),
    };
  }
  
  const definition = toGenericToolDefinition(tool);
  const start = Date.now();
  let result;
  try {
    result = await definition.execute(
      toolCall.id,
      toolCall.arguments,
      onUpdate,
      signal,
    );
    toolTraceLog('tool executed', {
      name: toolCall.name,
      durationMs: Date.now() - start,
      resultType: result?.type,
      status: (result?.details as Record<string, unknown>)?.status,
    });
  } catch (err) {
    toolTraceLog('tool execution error', {
      name: toolCall.name,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  
  return {
    toolCallId: toolCall.id,
    result,
  };
}

/**
 * Execute multiple tool calls in parallel.
 */
export async function executeToolCalls(
  tools: AnyAgentTool[],
  toolCalls: ToolCall[],
  signal?: AbortSignal,
  onUpdate?: (update: unknown) => void,
): Promise<ToolCallResult[]> {
  return Promise.all(
    toolCalls.map(toolCall => executeToolCall(tools, toolCall, signal, onUpdate)),
  );
}

// =============================================================================
// Tool Filtering
// =============================================================================

/**
 * Filter tools by name (whitelist).
 */
export function filterToolsByAllow(
  tools: AnyAgentTool[],
  allowList: string[],
): AnyAgentTool[] {
  if (allowList.length === 0) return tools;
  
  const normalizedAllow = new Set(allowList.map(normalizeToolName));
  return tools.filter(tool => normalizedAllow.has(normalizeToolName(tool.name)));
}

/**
 * Filter tools by name (blacklist).
 */
export function filterToolsByDeny(
  tools: AnyAgentTool[],
  denyList: string[],
): AnyAgentTool[] {
  if (denyList.length === 0) return tools;
  
  const normalizedDeny = new Set(denyList.map(normalizeToolName));
  return tools.filter(tool => !normalizedDeny.has(normalizeToolName(tool.name)));
}

/**
 * Filter tools by policy (allow/deny lists).
 */
export function filterToolsByPolicy(
  tools: AnyAgentTool[],
  policy: { allow?: string[]; deny?: string[] },
): AnyAgentTool[] {
  let filtered = tools;
  
  if (policy.allow && policy.allow.length > 0) {
    filtered = filterToolsByAllow(filtered, policy.allow);
  }
  
  if (policy.deny && policy.deny.length > 0) {
    filtered = filterToolsByDeny(filtered, policy.deny);
  }
  
  return filtered;
}

// =============================================================================
// Tool Registry
// =============================================================================

/**
 * Create a tool registry for managing tools.
 */
export function createToolRegistry(initialTools: AnyAgentTool[] = []) {
  const tools = new Map<string, AnyAgentTool>();
  
  // Register initial tools
  for (const tool of initialTools) {
    tools.set(normalizeToolName(tool.name), tool);
  }
  
  return {
    getTools(): AnyAgentTool[] {
      return Array.from(tools.values());
    },
    
    getTool(name: string): AnyAgentTool | undefined {
      return tools.get(normalizeToolName(name));
    },
    
    register(tool: AnyAgentTool): void {
      tools.set(normalizeToolName(tool.name), tool);
    },
    
    unregister(name: string): boolean {
      return tools.delete(normalizeToolName(name));
    },
    
    has(name: string): boolean {
      return tools.has(normalizeToolName(name));
    },
    
    toOpenAI(): OpenAIToolDefinition[] {
      return toOpenAIToolDefinitions(this.getTools());
    },
    
    toAnthropic(): AnthropicToolDefinition[] {
      return toAnthropicToolDefinitions(this.getTools());
    },
    
    toGemini(): GeminiToolDefinition[] {
      return toGeminiToolDefinitions(this.getTools());
    },
  };
}

export type ToolRegistryInstance = ReturnType<typeof createToolRegistry>;
