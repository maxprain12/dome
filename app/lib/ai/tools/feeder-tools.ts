import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { errorResult, jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';
import type { FeederInterpreter, FeederOutputMode, FeederUpdatePolicy } from '@/lib/feeders/api';

function readFirstString(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readStringParam(params, key);
    if (value) return value;
  }
  return undefined;
}

function missingParamError(name: string, aliases: string[], params: Record<string, unknown>) {
  const provided = Object.keys(params || {});
  return errorResult(`${name} is required (accepted aliases: ${aliases.join(', ')})`, {
    provided_keys: provided,
    hint:
      `Call feeder_list({ artifact_resource_id }) to discover existing feeders. ` +
      `Use the returned 'id' field as feeder_id.`,
  });
}

const FEEDER_ID_ALIASES = ['feeder_id', 'feederId', 'id'];
const FEEDER_ID_ALIASES_WITH_ARTIFACT = [...FEEDER_ID_ALIASES, 'artifact_id', 'artifactId'];
const ARTIFACT_RESOURCE_ID_ALIASES = [
  'artifact_resource_id',
  'artifactResourceId',
  'resource_id',
  'resourceId',
  'artifact_id',
  'artifactId',
];

const INTERPRETER_ENUM = Type.Union([
  Type.Literal('python3'),
  Type.Literal('node'),
  Type.Literal('bash'),
  Type.Literal('sh'),
  Type.Literal('curl'),
]);

const OUTPUT_MODE_ENUM = Type.Union([Type.Literal('stdout_json'), Type.Literal('output_file')]);

const UPDATE_POLICY_ENUM = Type.Union([
  Type.Literal('replace'),
  Type.Literal('merge_shallow'),
  Type.Literal('merge_deep'),
  Type.Literal('append_array'),
]);

const FEEDER_DOC_HINT =
  'Call dome_load_doc with id "feeders" before first use. Feeders run approved scripts in a sandbox and merge JSON into artifact state.data. ' +
  'Never ask the user to paste JSON when a feeder can fetch data. Use feeder_secret_request for credentials — never embed secrets in scripts.';

export function createFeederCreateTool(): AnyAgentTool {
  return {
    label: 'Create artifact feeder',
    name: 'feeder_create',
    description:
      'Create a sandbox script that feeds data into a persisted artifact (Kind B). ' +
      'Script runs in an isolated workspace; stdout must be JSON (or write to OUTPUT_FILE when output_mode=output_file). ' +
      'Feeder starts unapproved — user must approve in the Feeders panel before feeder_run works. ' +
      FEEDER_DOC_HINT,
    parameters: Type.Object(
      {
        artifact_resource_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Resource ID of the target artifact. Accepts aliases: artifactResourceId, resource_id, artifact_id.',
          }),
        ),
        name: Type.Optional(Type.String({ description: 'REQUIRED. Human-readable feeder name.' })),
        interpreter: Type.Optional(INTERPRETER_ENUM),
        script: Type.Optional(
          Type.String({ description: 'REQUIRED. Script source (python/node/bash/sh) or JSON array of curl args.' }),
        ),
        description: Type.Optional(Type.String()),
        slot: Type.Optional(Type.String({ description: 'Runtime slot. Default: default' })),
        env_secret_refs: Type.Optional(
          Type.Array(
            Type.Object({
              env_name: Type.String({ description: 'Environment variable name exposed to the script.' }),
              secret_name: Type.String({ description: 'Name of a vault secret (feeder_secret_request first).' }),
            }),
          ),
        ),
        env_static: Type.Optional(
          Type.Object({}, { additionalProperties: Type.String(), description: 'Static env vars (non-secret).' }),
        ),
        output_mode: Type.Optional(OUTPUT_MODE_ENUM),
        update_policy: Type.Optional(UPDATE_POLICY_ENUM),
        timeout_ms: Type.Optional(Type.Number({ description: 'Timeout 1000–300000 ms. Default 60000.' })),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const artifactResourceId = readFirstString(params, ARTIFACT_RESOURCE_ID_ALIASES);
      if (!artifactResourceId) {
        return missingParamError('artifact_resource_id', ARTIFACT_RESOURCE_ID_ALIASES, params);
      }
      const name = readStringParam(params, 'name');
      if (!name) return missingParamError('name', ['name'], params);
      const interpreter = readStringParam(params, 'interpreter');
      if (!interpreter) return missingParamError('interpreter', ['interpreter'], params);
      const script = readStringParam(params, 'script');
      if (!script) return missingParamError('script', ['script'], params);
      const envRefsRaw = Array.isArray(params.env_secret_refs) ? params.env_secret_refs : [];
      const envSecretRefs = envRefsRaw.map((ref) => {
        const r = ref as Record<string, unknown>;
        return {
          envName: String(r.env_name || r.envName || ''),
          secretName: String(r.secret_name || r.secretName || r.name || ''),
        };
      });
      const result = await window.electron.feeders.create({
        artifactResourceId,
        name,
        interpreter: interpreter as FeederInterpreter,
        script,
        description: readStringParam(params, 'description') || undefined,
        slot: readStringParam(params, 'slot') || 'default',
        envSecretRefs,
        envStatic: (params.env_static as Record<string, string>) || {},
        outputMode: (readStringParam(params, 'output_mode') || 'stdout_json') as FeederOutputMode,
        updatePolicy: (readStringParam(params, 'update_policy') || 'replace') as FeederUpdatePolicy,
        timeoutMs: typeof params.timeout_ms === 'number' ? params.timeout_ms : undefined,
      });
      return jsonResult(result);
    },
  };
}

export function createFeederListTool(): AnyAgentTool {
  return {
    label: 'List artifact feeders',
    name: 'feeder_list',
    description: 'List sandbox feeders attached to a persisted artifact.',
    parameters: Type.Object(
      {
        artifact_resource_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Resource ID of the artifact. Accepts aliases: artifactResourceId, resource_id, artifact_id.',
          }),
        ),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const artifactResourceId = readFirstString(params, ARTIFACT_RESOURCE_ID_ALIASES);
      if (!artifactResourceId) {
        return missingParamError('artifact_resource_id', ARTIFACT_RESOURCE_ID_ALIASES, params);
      }
      const result = await window.electron.feeders.list(artifactResourceId);
      return jsonResult(result);
    },
  };
}

export function createFeederRunTool(): AnyAgentTool {
  return {
    label: 'Run artifact feeder',
    name: 'feeder_run',
    description:
      'Execute an approved feeder script and merge its JSON output into the artifact. ' +
      'Fails with a clear message if the feeder is not approved or secrets are missing.',
    parameters: Type.Object(
      {
        feeder_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Feeder ID from feeder_create or feeder_list (returned as `id`). Accepts aliases: feederId, id.',
          }),
        ),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const feederId = readFirstString(params, FEEDER_ID_ALIASES);
      if (!feederId) return missingParamError('feeder_id', FEEDER_ID_ALIASES, params);
      const result = await window.electron.feeders.run(feederId, 'agent');
      return jsonResult(result);
    },
  };
}

export function createFeederUpdateScriptTool(): AnyAgentTool {
  return {
    label: 'Update feeder script',
    name: 'feeder_update_script',
    description: 'Update a feeder script. Resets approval — user must re-approve before the next run.',
    parameters: Type.Object(
      {
        feeder_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Feeder ID returned by feeder_create / feeder_list (the `id` field). Accepts aliases: feederId, id, artifact_id.',
          }),
        ),
        script: Type.Optional(Type.String({ description: 'REQUIRED. New script source.' })),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const feederId = readFirstString(params, FEEDER_ID_ALIASES_WITH_ARTIFACT);
      if (!feederId) return missingParamError('feeder_id', FEEDER_ID_ALIASES_WITH_ARTIFACT, params);
      const script = readStringParam(params, 'script');
      if (!script) return missingParamError('script', ['script'], params);
      const result = await window.electron.feeders.updateScript(feederId, script);
      return jsonResult(result);
    },
  };
}

export function createFeederDeleteTool(): AnyAgentTool {
  return {
    label: 'Delete artifact feeder',
    name: 'feeder_delete',
    description: 'Delete a feeder and its workspace.',
    parameters: Type.Object(
      {
        feeder_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Feeder ID returned by feeder_create / feeder_list. Accepts aliases: feederId, id.',
          }),
        ),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const feederId = readFirstString(params, FEEDER_ID_ALIASES);
      if (!feederId) return missingParamError('feeder_id', FEEDER_ID_ALIASES, params);
      const result = await window.electron.feeders.delete(feederId);
      return jsonResult(result);
    },
  };
}

export function createFeederHistoryTool(): AnyAgentTool {
  return {
    label: 'Feeder run history',
    name: 'feeder_history',
    description: 'Get recent execution history for a feeder (status, excerpts).',
    parameters: Type.Object(
      {
        feeder_id: Type.Optional(
          Type.String({
            description:
              'REQUIRED. Feeder ID returned by feeder_create / feeder_list. Accepts aliases: feederId, id.',
          }),
        ),
        limit: Type.Optional(Type.Number({ description: 'Max runs (default 20, max 100).' })),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const feederId = readFirstString(params, FEEDER_ID_ALIASES);
      if (!feederId) return missingParamError('feeder_id', FEEDER_ID_ALIASES, params);
      const limit = typeof params.limit === 'number' ? params.limit : 20;
      const result = await window.electron.feeders.history(feederId, limit);
      return jsonResult(result);
    },
  };
}

export function createFeederSecretRequestTool(): AnyAgentTool {
  return {
    label: 'Request feeder secret',
    name: 'feeder_secret_request',
    description:
      'Ask the user to store a named secret in the encrypted vault (e.g. API password). ' +
      'Opens the UI prompt; does NOT return the secret value. Reference the name in env_secret_refs.',
    parameters: Type.Object(
      {
        name: Type.Optional(Type.String({ description: 'REQUIRED. Vault secret name, e.g. idrac_password.' })),
        feeder_id: Type.Optional(
          Type.String({ description: 'Optional feeder ID for context. Accepts aliases: feederId, id.' }),
        ),
      },
      { additionalProperties: true },
    ),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const name = readFirstString(params, ['name', 'secret_name', 'secretName']);
      if (!name) return missingParamError('name', ['name', 'secret_name', 'secretName'], params);
      const feederId = readFirstString(params, FEEDER_ID_ALIASES) || undefined;
      const result = await window.electron.feeders.requestSecret(name, feederId);
      return jsonResult(result);
    },
  };
}

export function createFeederTools(): AnyAgentTool[] {
  return [
    createFeederCreateTool(),
    createFeederListTool(),
    createFeederRunTool(),
    createFeederUpdateScriptTool(),
    createFeederDeleteTool(),
    createFeederHistoryTool(),
    createFeederSecretRequestTool(),
  ];
}
