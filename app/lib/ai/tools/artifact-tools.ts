import { Type } from '@sinclair/typebox';
import definitions from '../../../../packages/tools/src/families/artifacts.schema.json';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';
import { isElectronAI } from '@/lib/utils/formatting';


/** One public schema for the desktop agent, browser agent and renderer. */
function artifactTool(name: string): AnyAgentTool {
  const definition = definitions.find((item) => item.function?.name === name)!.function!;
  return {
    name,
    label: name.replaceAll('_', ' '),
    description: definition.description ?? '',
    parameters: Type.Unsafe(definition.parameters),
    execute: async (_id, args) => {
      if (!isElectronAI()) return jsonResult({ success: false, error: 'Requires Electron environment.' });
      const p = args as Record<string, unknown>;
      switch (name) {
        case 'artifact_create':
          return jsonResult(await window.electron.invoke('artifact:create', {
            title: p.title, artifactType: p.artifact_type, content: p.content,
            state: { html: p.html, data: p.data }, projectId: p.project_id,
          }));
        case 'artifact_update_state':
        case 'artifact_merge_data':
          return jsonResult(await window.electron.invoke('artifact:update', {
            resourceId: p.resource_id, html: p.html, content: p.content,
            data: p.data, dataPatch: p.data_patch, expectedVersion: p.expected_version,
          }));
        case 'artifact_get':
          return jsonResult(await window.electron.invoke('artifact:get', p.resource_id));
        case 'artifact_list':
          return jsonResult(await window.electron.invoke('artifact:list', p.project_id));
        case 'artifact_delete':
          return jsonResult(await window.electron.invoke('artifact:delete', p.resource_id));
        case 'artifact_link_resource':
          return jsonResult(await window.electron.artifacts.setLinkedResource(p.artifact_resource_id as string, p.linked_resource_id as string | null));
        default:
          return jsonResult({ success: false, error: 'Unknown artifact tool' });
      }
    },
  };
}

export const createArtifactCreateTool = () => artifactTool('artifact_create');
export const createArtifactGetTool = () => artifactTool('artifact_get');
export const createArtifactUpdateStateTool = () => artifactTool('artifact_update_state');
export const createArtifactMergeDataTool = () => artifactTool('artifact_merge_data');
export const createArtifactListTool = () => artifactTool('artifact_list');
export const createArtifactDeleteTool = () => artifactTool('artifact_delete');
export const createArtifactLinkResourceTool = () => artifactTool('artifact_link_resource');
export const createArtifactTools = (): AnyAgentTool[] => definitions.map((d) => artifactTool(d.function!.name));
