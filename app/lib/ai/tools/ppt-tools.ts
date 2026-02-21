/**
 * PPT Tools
 *
 * Tools for the AI agent to create, read, and export PowerPoint (PPTX) resources.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

const PptCreateSchema = Type.Object({
  title: Type.String({
    description: 'Title for the new PowerPoint resource.',
  }),
  script: Type.Optional(
    Type.String({
      description:
        'PptxGenJS JavaScript code to generate the presentation. Must use require("pptxgenjs") and pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH }). Alternative to spec for themed, rich slides.',
    })
  ),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID. Default: current project.',
    })
  ),
  folder_id: Type.Optional(
    Type.String({
      description: 'Folder ID to place the PPT in (current folder if user is viewing one).',
    })
  ),
  spec: Type.Optional(Type.Object(
    {
      title: Type.Optional(Type.String({ description: 'Presentation title (first slide).' })),
      theme: Type.Optional(
        Type.Union([
          Type.Literal('midnight_executive'),
          Type.Literal('forest_moss'),
          Type.Literal('ocean_gradient'),
          Type.Literal('sunset_warm'),
          Type.Literal('slate_minimal'),
          Type.Literal('emerald_pro'),
        ], {
          description:
            'Theme/palette for slides. midnight_executive: business; forest_moss: sustainability; ocean_gradient: tech; sunset_warm: marketing; slate_minimal: academic; emerald_pro: finance.',
        })
      ),
      slides: Type.Array(
        Type.Object({
          layout: Type.Union([
            Type.Literal('title'),
            Type.Literal('content'),
            Type.Literal('bullet'),
            Type.Literal('title_only'),
            Type.Literal('blank'),
          ], { description: 'Slide layout.' }),
          title: Type.Optional(Type.String()),
          subtitle: Type.Optional(Type.String()),
          bullets: Type.Optional(Type.Array(Type.String())),
          textboxes: Type.Optional(
            Type.Array(
              Type.Object({
                text: Type.String(),
                left: Type.Optional(Type.Number()),
                top: Type.Optional(Type.Number()),
                width: Type.Optional(Type.Number()),
                height: Type.Optional(Type.Number()),
              })
            )
          ),
        })
      ),
    },
    {
      description: 'Presentation spec: title and slides array. Layouts: title, content/bullet, title_only, blank. Omit when using script.',
    }
  )),
});

const PptGetFilePathSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PPT resource.',
  }),
});

const PptExportSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PPT resource to export.',
  }),
});

const PptGetSlidesSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PPT resource to read.',
  }),
});

export function createPptCreateTool(): AnyAgentTool {
  return {
    label: 'Crear PowerPoint',
    name: 'ppt_create',
    description:
      'Crea una nueva presentación PowerPoint. Pasa un spec con title y slides (array de { layout, title?, subtitle?, bullets?, textboxes? }). Layouts: title, content, bullet, title_only, blank.',
    parameters: PptCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const spec = params.spec as Record<string, unknown> | undefined;
        const script = typeof params.script === 'string' ? params.script : undefined;
        const projectId = readStringParam(params, 'project_id');
        const folderId = readStringParam(params, 'folder_id');
        const currentProject = await window.electron!.ai.tools.getCurrentProject();
        const resolvedProjectId = projectId || currentProject?.id || 'default';
        const options: Record<string, unknown> = {};
        if (folderId) options.folder_id = folderId;
        if (script) options.script = script;
        const result = await window.electron!.ai.tools.pptCreate(
          resolvedProjectId,
          title,
          spec || {},
          options
        );
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createPptGetFilePathTool(): AnyAgentTool {
  return {
    label: 'Obtener ruta del PPT',
    name: 'ppt_get_file_path',
    description: 'Obtiene la ruta absoluta del archivo PowerPoint en disco.',
    parameters: PptGetFilePathSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', {
          required: true,
        });
        const result = await window.electron!.ai.tools.pptGetFilePath(resourceId);
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createPptExportTool(): AnyAgentTool {
  return {
    label: 'Exportar PowerPoint',
    name: 'ppt_export',
    description: 'Exporta un PowerPoint a base64 (pptx).',
    parameters: PptExportSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', {
          required: true,
        });
        const result = await window.electron!.ai.tools.pptExport(resourceId, {});
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createPptGetSlidesTool(): AnyAgentTool {
  return {
    label: 'Obtener diapositivas PPT',
    name: 'ppt_get_slides',
    description:
      'Obtiene el contenido de las diapositivas de un PowerPoint existente (título y texto de cada slide).',
    parameters: PptGetSlidesSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', {
          required: true,
        });
        const result = await window.electron!.ai.tools.pptGetSlides(resourceId);
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createPptTools(): AnyAgentTool[] {
  return [
    createPptCreateTool(),
    createPptGetFilePathTool(),
    createPptGetSlidesTool(),
    createPptExportTool(),
  ];
}
