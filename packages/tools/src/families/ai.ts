import schemas from './ai.schema.json' with { type: 'json' };
import type { ToolDefinition } from '../types.js';
export function aiCapabilityToolDefinitions(): ToolDefinition[] { return schemas as ToolDefinition[]; }
