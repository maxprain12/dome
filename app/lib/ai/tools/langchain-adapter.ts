/**
 * LangChain Tools Adapter
 *
 * Converts Dome AgentTools (TypeBox schema) to LangChain StructuredTool format.
 * Used when running the LangGraph agent in main process - tools execute via
 * executeToolInMain. For renderer context, executeToolCall is used (which may IPC).
 */

import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import * as z from 'zod';
import type { AnyAgentTool } from './types';
import { normalizeToolName } from './adapter';
import { normalizeSchema } from './schema';

// Re-export for consumers
export type { StructuredToolInterface };

/**
 * JSON Schema (from TypeBox/OpenAI) to Zod converter.
 * Handles common patterns: string, number, integer, boolean, object, array, enum, optional.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.unknown();
  }

  const type = schema.type as string | undefined;
  const desc = schema.description as string | undefined;
  const describe = (s: z.ZodTypeAny) =>
    desc ? s.describe(desc) : s;

  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum as unknown[];
    const strings = values.filter((v): v is string => typeof v === 'string');
    if (strings.length > 0) {
      return describe(z.enum(strings as [string, ...string[]]));
    }
  }

  if (type === 'string') {
    return describe(z.string());
  }
  if (type === 'number') {
    let s = z.number();
    if (schema.minimum !== undefined) s = s.min(schema.minimum as number);
    if (schema.maximum !== undefined) s = s.max(schema.maximum as number);
    return describe(s);
  }
  if (type === 'integer') {
    let s = z.number().int();
    if (schema.minimum !== undefined) s = s.min(schema.minimum as number);
    if (schema.maximum !== undefined) s = s.max(schema.maximum as number);
    return describe(s);
  }
  if (type === 'boolean') {
    return describe(z.boolean());
  }
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items?.type === 'string') {
      return describe(z.array(z.string()));
    }
    return describe(z.array(z.unknown()));
  }
  if (type === 'object') {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = new Set((schema.required as string[]) ?? []);
    if (!props || typeof props !== 'object') {
      return describe(z.record(z.string(), z.unknown()));
    }
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      const zodType = jsonSchemaToZod(propSchema ?? {});
      shape[key] = required.has(key) ? zodType : zodType.optional();
    }
    return describe(z.object(shape));
  }

  return z.unknown();
}

/**
 * Create LangChain tools from Dome AgentTools.
 * Execution uses the provided executeFn (e.g. executeToolInMain in main process).
 */
export function toLangChainTools(
  agentTools: AnyAgentTool[],
  executeFn: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>,
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];
  for (const at of agentTools) {
    const name = normalizeToolName(at.name);
    const normalized = normalizeSchema(at.parameters) as Record<string, unknown>;
    const zodSchema = jsonSchemaToZod(normalized);
    const paramsSchema =
      zodSchema instanceof z.ZodObject
        ? zodSchema
        : (z.object({}) as z.ZodObject<Record<string, z.ZodTypeAny>>);

    const lcTool = tool(
      async (input: Record<string, unknown>) => {
        const result = await executeFn(name, input as Record<string, unknown>);
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      {
        name,
        description: at.description,
        schema: paramsSchema,
      },
    );
    tools.push(lcTool);
  }
  return tools;
}

/**
 * Create LangChain tools from OpenAI-format definitions.
 * Used in main process when AgentTools aren't available (e.g. WhatsApp).
 */
export function toLangChainToolsFromOpenAIDefinitions(
  defs: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
  executeFn: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>,
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];
  for (const def of defs) {
    if (def.type !== 'function' || !def.function) continue;
    const { name, description, parameters } = def.function;
    const normName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    const params = (parameters ?? {}) as Record<string, unknown>;
    const zodSchema = jsonSchemaToZod(params);
    const paramsSchema =
      zodSchema instanceof z.ZodObject
        ? zodSchema
        : (z.object({}) as z.ZodObject<Record<string, z.ZodTypeAny>>);

    const lcTool = tool(
      async (input: Record<string, unknown>) => {
        const result = await executeFn(normName, input as Record<string, unknown>);
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      {
        name: normName,
        description: description ?? '',
        schema: paramsSchema,
      },
    );
    tools.push(lcTool);
  }
  return tools;
}
