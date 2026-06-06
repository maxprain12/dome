/**
 * @dome/tools — `feeders` family definitions (sandbox scripts feeding artifacts).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The feeders-family tool names (subset of the 103-tool catalog). */
export const FEEDERS_TOOL_NAMES = [
  'feeder_create',
  'feeder_list',
  'feeder_run',
  'feeder_update_script',
  'feeder_delete',
  'feeder_history',
  'feeder_secret_request',
] as const;

export type FeedersToolName = (typeof FEEDERS_TOOL_NAMES)[number];

export function feedersToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'feeder_create',
        description:
          'Create a sandbox script that feeds JSON data into a persisted artifact. Call dome_load_doc("feeders") first. ' +
          'Feeder requires user approval before feeder_run. Use feeder_secret_request for credentials.',
        parameters: {
          type: 'object',
          properties: {
            artifact_resource_id: { type: 'string' },
            name: { type: 'string' },
            interpreter: { type: 'string', enum: ['python3', 'node', 'bash', 'sh', 'curl'] },
            script: { type: 'string', description: 'Script source or JSON array of curl args' },
            description: { type: 'string' },
            slot: { type: 'string' },
            env_secret_refs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  env_name: { type: 'string' },
                  secret_name: { type: 'string' },
                },
                required: ['env_name', 'secret_name'],
              },
            },
            env_static: { type: 'object', additionalProperties: { type: 'string' } },
            output_mode: { type: 'string', enum: ['stdout_json', 'output_file'] },
            update_policy: { type: 'string', enum: ['replace', 'merge_shallow', 'merge_deep', 'append_array'] },
            timeout_ms: { type: 'number' },
          },
          required: ['artifact_resource_id', 'name', 'interpreter', 'script'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_list',
        description: 'List feeders for a persisted artifact.',
        parameters: {
          type: 'object',
          properties: { artifact_resource_id: { type: 'string' } },
          required: ['artifact_resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_run',
        description: 'Run an approved feeder and merge JSON output into the artifact.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_update_script',
        description: 'Update feeder script (resets approval).',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' }, script: { type: 'string' } },
          required: ['feeder_id', 'script'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_delete',
        description: 'Delete a feeder.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_history',
        description: 'Recent feeder run history.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' }, limit: { type: 'number' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_secret_request',
        description: 'Prompt user to store a named secret in the encrypted vault.',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' }, feeder_id: { type: 'string' } },
          required: ['name'],
        },
      },
    },
  ];
}
