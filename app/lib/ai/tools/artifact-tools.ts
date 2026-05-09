import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Dome Design System Context
// Injected into tool descriptions so Many generates on-brand artifacts.
// =============================================================================

const DOME_DESIGN_SYSTEM = `
Dome persisted-artifact contract (MUST follow for artifact_create / artifact_update_state):
- Iframe is sandboxed: NO localStorage, sessionStorage, IndexedDB, or cookies for app state — they fail or are wrong. MUST NOT reference them in generated JS.
- All durable state lives in SQLite via state.data → window.DOME_DATA. Initialize every field from DOME_DATA merged with in-code defaults (never leave arrays undefined before user actions).
- After EVERY user mutation that must survive app restart, call window.__dome_updateState(nextDataObject) with the full next data object (same shape as DOME_DATA).
- Optional window.__dome_collectState() only if some values cannot be represented on DOME_DATA; user may also click Save in the toolbar.
- Do not tell the user that data "auto-persists in the browser".

Design system (styling):
- CSS variables injected into the iframe: --bg, --bg-secondary, --bg-tertiary, --primary-text, --secondary-text, --tertiary-text, --accent, --border, --border-hover
- Form controls: stable id, name, or data-dome-key per input matching keys in data; anonymous fields use __dome_input_0, __dome_input_1, …
- HTML self-contained; inline CSS/JS or CDN libs (e.g. Chart.js) allowed
- Font: Inter, -apple-system, sans-serif | spacing 4px grid | border-radius 6–12px
- Buttons: background var(--accent), color #fff, padding 8px 16px, border-radius 6px
- Use CSS vars only; do not hardcode colors
`;

// =============================================================================
// Tools
// =============================================================================

export function createArtifactCreateTool(): AnyAgentTool {
  return {
    label: 'Create Artifact',
    name: 'artifact_create',
    description:
      'Create a persisted interactive artifact (mini-app) stored as a resource in Dome. ' +
      'Self-contained HTML/CSS/JS in a sandboxed iframe — MUST persist state only via window.DOME_DATA + window.__dome_updateState after each change; NEVER localStorage/sessionStorage. ' +
      'artifact_type options: "task-tracker" (Kanban board), "chart" (data chart), "custom" (any UI). ' +
      'Set state.html to fully self-contained HTML. Set state.data to the initial structured data object. ' +
      DOME_DESIGN_SYSTEM,
    parameters: Type.Object({
      title: Type.String({ description: 'Human-readable title for the artifact.' }),
      artifact_type: Type.Union(
        [Type.Literal('task-tracker'), Type.Literal('chart'), Type.Literal('custom')],
        { description: 'Semantic type of the artifact.' },
      ),
      html: Type.String({
        description: 'Self-contained HTML/CSS/JS for the artifact UI. Must follow the Dome Design System above.',
      }),
      data: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description:
              'Initial structured data object. For task-tracker: {columns:[{id,title,items:[{id,text,done,priority}]}]}. For chart: {chartType,labels,datasets}.',
          },
        ),
      ),
      project_id: Type.Optional(Type.String({ description: 'Project ID. Defaults to current project.' })),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const title = readStringParam(params, 'title', { required: true });
      const artifactType = readStringParam(params, 'artifact_type', { required: true });
      const html = readStringParam(params, 'html', { required: true });
      const data = (params.data as Record<string, unknown>) ?? {};
      const projectId = readStringParam(params, 'project_id');

      const state = { html, data };
      const result = await window.electron.invoke('artifact:create', {
        title,
        artifactType,
        state,
        projectId: projectId || undefined,
      });
      return jsonResult(result);
    },
  };
}

export function createArtifactGetTool(): AnyAgentTool {
  return {
    label: 'Get Artifact',
    name: 'artifact_get',
    description:
      'Get the full state (html, data, metadata) of a persisted artifact by its resource ID.',
    parameters: Type.Object({
      resource_id: Type.String({ description: 'The resource ID of the artifact.' }),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const resourceId = readStringParam(params, 'resource_id', { required: true });
      const result = await window.electron.invoke('artifact:get', resourceId);
      return jsonResult(result);
    },
  };
}

export function createArtifactUpdateStateTool(): AnyAgentTool {
  return {
    label: 'Update Artifact',
    name: 'artifact_update_state',
    description:
      'Update an existing artifact. Provide the full new state object (html and/or data). ' +
      'For data-only updates (e.g. add a row), set state.data; generated HTML MUST use __dome_updateState for runtime sync — NEVER browser storage. ' +
      'To regenerate the UI, set state.html. Both can be updated at once.' +
      DOME_DESIGN_SYSTEM,
    parameters: Type.Object({
      resource_id: Type.String({ description: 'The resource ID of the artifact to update.' }),
      html: Type.Optional(
        Type.String({ description: 'New self-contained HTML. Omit to keep existing HTML.' }),
      ),
      data: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: 'New structured data. Omit to keep existing data.',
          },
        ),
      ),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const resourceId = readStringParam(params, 'resource_id', { required: true });

      // First fetch current state to merge
      const current = await window.electron.invoke('artifact:get', resourceId);
      if (!current.success || !current.data) {
        return jsonResult({ success: false, error: 'Artifact not found' });
      }
      const existingState = (current.data.state ?? {}) as Record<string, unknown>;
      const newState: Record<string, unknown> = { ...existingState };
      if (params.html !== undefined) newState.html = params.html as string;
      if (params.data !== undefined) newState.data = params.data;

      const result = await window.electron.invoke('artifact:update', { resourceId, state: newState });
      return jsonResult(result);
    },
  };
}

export function createArtifactListTool(): AnyAgentTool {
  return {
    label: 'List Artifacts',
    name: 'artifact_list',
    description: 'List all persisted artifacts in the current (or specified) project.',
    parameters: Type.Object({
      project_id: Type.Optional(
        Type.String({ description: 'Project ID. Defaults to current project.' }),
      ),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, 'project_id');
      const result = await window.electron.invoke('artifact:list', projectId || undefined);
      return jsonResult(result);
    },
  };
}

export function createArtifactDeleteTool(): AnyAgentTool {
  return {
    label: 'Delete Artifact',
    name: 'artifact_delete',
    description: 'Delete a persisted artifact and remove it from the sidebar.',
    parameters: Type.Object({
      resource_id: Type.String({ description: 'The resource ID of the artifact to delete.' }),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const resourceId = readStringParam(params, 'resource_id', { required: true });
      // Remove artifact record first; surface any failure before touching the resource row
      const artifactResult = await window.electron.invoke('artifact:delete', resourceId);
      if (!artifactResult?.success) {
        return jsonResult({ success: false, error: artifactResult?.error ?? 'Failed to delete artifact record' });
      }
      // Remove resource row (triggers sidebar removal)
      const result = await window.electron.invoke('db:resources:delete', resourceId);
      return jsonResult(result);
    },
  };
}

export function createArtifactLinkResourceTool(): AnyAgentTool {
  return {
    label: 'Link Artifact to Resource',
    name: 'artifact_link_resource',
    description:
      'Link (or unlink) a persisted artifact to a spreadsheet/Excel resource. ' +
      'Once linked, Dome auto-refreshes the artifact when the spreadsheet changes. ' +
      'Synced rows are in window.DOME_DATA.linkedData.data (AOA), window.DOME_DATA.linkedData.sheet_name, ' +
      'and window.DOME_DATA.linkedData.sheets[sheetName] (same grid as .data for the active sheet). ' +
      'Pass linkedResourceId=null to remove an existing link.',
    parameters: Type.Object({
      artifact_resource_id: Type.String({
        description: 'The resource ID of the artifact to link (returned by artifact_create or artifact_list).',
      }),
      linked_resource_id: Type.Union([Type.String(), Type.Null()], {
        description: 'Resource ID of the Excel/spreadsheet to link to, or null to unlink.',
      }),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const artifactResourceId = readStringParam(params, 'artifact_resource_id', { required: true });
      const linkedResourceId = params.linked_resource_id as string | null | undefined;
      const result = await window.electron.artifacts.setLinkedResource(
        artifactResourceId,
        linkedResourceId ?? null,
      );
      return jsonResult(result);
    },
  };
}

export function createArtifactTools(): AnyAgentTool[] {
  return [
    createArtifactCreateTool(),
    createArtifactGetTool(),
    createArtifactUpdateStateTool(),
    createArtifactListTool(),
    createArtifactDeleteTool(),
    createArtifactLinkResourceTool(),
  ];
}
