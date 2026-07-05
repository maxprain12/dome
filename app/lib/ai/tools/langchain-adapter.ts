/**
 * LangChain Tools Adapter
 *
 * Converts Dome AgentTools (TypeBox schema) to LangChain StructuredTool format.
 * Used when running the agent runtime in main process - tools execute via
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

  const desc = schema.description as string | undefined;
  const describe = (s: z.ZodTypeAny) => (desc ? s.describe(desc) : s);

  if (schema.enum && Array.isArray(schema.enum)) {
    const strings = (schema.enum as unknown[]).filter((v): v is string => typeof v === 'string');
    if (strings.length > 0) return describe(z.enum(strings as [string, ...string[]]));
  }

  const type = schema.type as string | undefined;
  const handler = TYPE_HANDLERS[type as string];
  if (handler) return handler(schema, describe);
  return z.unknown();
}

type ZodSchemaBuilder = (
  schema: Record<string, unknown>,
  describe: (s: z.ZodTypeAny) => z.ZodTypeAny,
) => z.ZodTypeAny;

const TYPE_HANDLERS: Record<string, ZodSchemaBuilder> = {
  string: (_schema, describe) => describe(z.string()),
  number: (schema, describe) => describe(applyNumberBounds(z.number(), schema)),
  integer: (schema, describe) => describe(applyNumberBounds(z.number().int(), schema)),
  boolean: (_schema, describe) => describe(z.boolean()),
  array: (schema, describe) => describe(z.array(getArrayItemType(schema))),
  object: (schema, describe) => describe(getObjectShape(schema, describe)),
};

function applyNumberBounds(s: z.ZodTypeAny, schema: Record<string, unknown>): z.ZodTypeAny {
  let bounded: z.ZodTypeAny = s;
  if (schema.minimum !== undefined) bounded = (bounded as z.ZodNumber).min(schema.minimum as number);
  if (schema.maximum !== undefined) bounded = (bounded as z.ZodNumber).max(schema.maximum as number);
  return bounded;
}

function getArrayItemType(schema: Record<string, unknown>): z.ZodTypeAny {
  const items = schema.items as Record<string, unknown> | undefined;
  return items?.type === 'string' ? z.string() : z.unknown();
}

function getObjectShape(
  schema: Record<string, unknown>,
  describe: (s: z.ZodTypeAny) => z.ZodTypeAny,
): z.ZodTypeAny {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || typeof props !== 'object') {
    return describe(z.record(z.string(), z.unknown()));
  }
  const required = new Set((schema.required as string[]) ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    const zodType = jsonSchemaToZod(propSchema ?? {});
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }
  return describe(z.object(shape));
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
 * Used in main process when AgentTools aren't available (e.g. legacy batch paths).
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
