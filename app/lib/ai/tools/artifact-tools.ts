import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Dome Design System Context
// Injected into tool descriptions so Many generates on-brand artifacts.
// =============================================================================

const DOME_DESIGN_SYSTEM = `
Dome persisted-artifact contract (MUST follow for artifact_create / artifact_update_state / artifact_merge_data):
- Iframe is sandboxed: NO localStorage, sessionStorage, IndexedDB, or cookies for app state — they fail or are wrong. MUST NOT reference them in generated JS.
- All durable editable state belongs in SQLite via state.data → window.DOME_DATA. Initialize from DOME_DATA merged with in-code defaults (never leave mutable arrays/objects undefined before user actions).
- After EVERY mutation that must survive restart, call window.__dome_updateState(fullNextDataObject) with the SAME shape as DOME_DATA.
- Optional window.__dome_collectState() only if some values cannot live in DOME_DATA; user may also use Save on the toolbar.
- Do not tell the user data "persists only in the browser".

When state.data vs hardcoded HTML:
- NEED state.data: anything the user or automations edits between sessions — Kanban items, spreadsheet-like rows, form fields, sliders with saved values, counters, quizzes the user fills, notes inside a persisted mini-app.
- OK hardcoded ONLY in HTML: static labels that never change, one-off decorative copy, immutable legends with no bindings. Large datasets from a spreadsheet or PDF SHOULD NOT be pasted as huge static HTML blobs — use artifact_link_resource → linkedData OR pull text with excel_get / resource_get then artifact_merge_data / artifact_update_state.
- EXAMPLES need data[]: grocery list tracker, workout log, CRM mini-pipeline rows. EXAMPLES static-only OK: hero title "Mi tablero" with no persistence. EXAMPLES bulk load after create: artifact_merge_data { rows: [...] } after excel_get slice.

Never define light vs dark themes in CSS: Dome injects the active theme tokens. NEVER use prefers-color-scheme blocks to fork palettes. ALWAYS use injected variables (--bg, --bg-secondary, --primary-text, --accent, --border, semantic success/warning tokens from artifacts.txt).

Design system (styling):
- Surfaces/text/borders/accent ONLY via Dome CSS variables injected into the iframe; no hex/rgb literals for chrome.
- Form controls: stable id, name, or data-dome-key aligned with keys in state.data.
- Buttons: background var(--accent); text color var(--base-text, var(--primary-text)) so contrast follows the Shell theme automatically.
`;

// =============================================================================
// Tools
// =============================================================================

export function createArtifactDesignTool(): AnyAgentTool {
  return {
    label: 'Artifact layout (Dome design)',
    name: 'artifact_design',
    description:
      'Generate Dome-themed HTML and initial state.data for a tabbed dossier artifact (header, tabs, cards, badges, lists, code). ' +
      'Output is NOT persisted: pass returned html and data into artifact_create with artifact_type "custom". ' +
      'Call dome_load_doc first with id artifact_design for the full JSON spec. ' +
      DOME_DESIGN_SYSTEM,
    parameters: Type.Object({
      spec: Type.Object(
        {},
        {
          additionalProperties: true,
          description:
            'Layout spec: title (required), optional subtitle, title_emoji, active_tab, tabs[] { id, label }, panels { [tabId]: { sections[]: kicker, badge, badge_tone (neutral|info|success|warning|error), blocks[] (type paragraph|numbered|bullets|code) } } }',
        },
      ),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const spec = params.spec;
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        return jsonResult({ success: false, error: 'spec must be a JSON object' });
      }
      const result = await window.electron.artifacts.buildDesign(spec as Record<string, unknown>);
      return jsonResult(result);
    },
  };
}

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

export function createArtifactMergeDataTool(): AnyAgentTool {
  return {
    label: 'Merge artifact data',
    name: 'artifact_merge_data',
    description:
      'Shallow-merge new keys into an existing persisted artifact state.data WITHOUT resending HTML. Use after spreadsheet/PDF ingestion to push rows/KPI blobs. ' +
      'Top-level keys in data_patch replace or appear alongside existing keys; nested objects at a key replace that whole subtree. ' +
      'Prefer this over pasting mega-JSON inline in HTML strings. ' +
      DOME_DESIGN_SYSTEM,
    parameters: Type.Object({
      resource_id: Type.String({ description: 'Artifact resource ID (artifact_create response).' }),
      data_patch: Type.Object(
        {},
        {
          additionalProperties: true,
          description:
            'Partial JSON merged shallowly into existing state.data (top-level keys only). Same layer as artifact_update_state.state.data.',
        },
      ),
    }),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ error: 'Requires Electron environment.' });
      const params = args as Record<string, unknown>;
      const resourceId = readStringParam(params, 'resource_id', { required: true });
      const dataPatchRaw = params.data_patch;
      if (!dataPatchRaw || typeof dataPatchRaw !== 'object' || Array.isArray(dataPatchRaw)) {
        return jsonResult({ success: false, error: 'data_patch must be a JSON object' });
      }

      const current = await window.electron.invoke('artifact:get', resourceId);
      if (!current.success || !current.data) {
        return jsonResult({ success: false, error: 'Artifact not found' });
      }

      const existingState = ((current.data as { state?: Record<string, unknown> }).state ?? {}) as Record<string, unknown>;
      const prevData =
        typeof existingState.data === 'object' && existingState.data !== null && !Array.isArray(existingState.data)
          ? (existingState.data as Record<string, unknown>)
          : {};
      const patch = dataPatchRaw as Record<string, unknown>;
      const newState = {
        ...existingState,
        data: { ...prevData, ...patch },
      };

      const result = await window.electron.invoke('artifact:update', { resourceId, state: newState });
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
    createArtifactDesignTool(),
    createArtifactCreateTool(),
    createArtifactGetTool(),
    createArtifactMergeDataTool(),
    createArtifactUpdateStateTool(),
    createArtifactListTool(),
    createArtifactDeleteTool(),
    createArtifactLinkResourceTool(),
  ];
}
