/**
 * @dome/tools — `artifacts` family definitions (persisted iframe mini-apps).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';
import definitions from './artifacts.schema.json' with { type: 'json' };

/** The artifacts-family tool names (subset of the 103-tool catalog). */
export const ARTIFACTS_TOOL_NAMES = [
  'artifact_create',
  'artifact_get',
  'artifact_merge_data',
  'artifact_update_state',
  'artifact_list',
  'artifact_delete',
  'artifact_link_resource',
] as const;

export type ArtifactsToolName = (typeof ARTIFACTS_TOOL_NAMES)[number];

export function artifactsToolDefinitions(): ToolDefinition[] {
  return structuredClone(definitions) as ToolDefinition[];
}
