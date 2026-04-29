/**
 * PPT Tools
 *
 * Tools for the AI agent to create, read, and export PowerPoint (PPTX) resources.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool, ToolResultContent } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const PptCreateSchema = Type.Object({
  title: Type.String({
    description: 'Title for the new PowerPoint resource.',
  }),
  script: Type.Optional(
    Type.String({
      description:
        'Code to generate the presentation. Two runtimes supported:\n' +
        '• Python (python-pptx): use `from pptx import Presentation`, build slides, call `prs.save(os.environ["PPTX_OUTPUT_PATH"])`.\n' +
        '• PptxGenJS (Node.js): use `const PptxGenJS = require("pptxgenjs")`, build slides, call `await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })`. Auto-detected by presence of require("pptxgenjs") or new pptxgen().\n' +
        'Populate every slide with real content. Use sync=true when you want to QA the result visually right after creation.',
    })
  ),
  sync: Type.Optional(
    Type.Boolean({
      description:
        'If true, wait for the PPT to finish generating before returning (blocks until done). ' +
        'Use this when you plan to call ppt_get_slide_images immediately after to do visual QA.',
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
      'Crea una nueva presentación PowerPoint. Acepta script Python (python-pptx) o PptxGenJS (Node.js) para slides ricos, o spec con title y slides. ' +
      'Usa sync=true si quieres hacer QA visual inmediato con ppt_get_slide_images después de crear. ' +
      'Cada slide debe tener contenido real de los documentos fuente.',
    parameters: PptCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const spec = params.spec as Record<string, unknown> | undefined;
        const script = typeof params.script === 'string' ? params.script : undefined;
        const projectId = readStringParam(params, 'project_id');
        const folderId = readStringParam(params, 'folder_id');
        const sync = typeof params.sync === 'boolean' ? params.sync : false;
        const currentProjectResult = await window.electron!.ai.tools.getCurrentProject();
        const resolvedProjectId = projectId || currentProjectResult?.project?.id || 'default';
        const options: Record<string, unknown> = {};
        if (folderId) options.folder_id = folderId;
        if (script) options.script = script;
        if (sync) options.sync = true;
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
        if (!isElectronAI()) {
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
        if (!isElectronAI()) {
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
        if (!isElectronAI()) {
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

const PptGetSlideImagesSchema = Type.Object({
  resource_id: Type.String({
    description: 'ID del recurso PPT del que obtener imágenes de diapositivas.',
  }),
});

export function createPptGetSlideImagesTool(): AnyAgentTool {
  return {
    label: 'Ver slides del PPT',
    name: 'ppt_get_slide_images',
    description:
      'Obtiene imágenes PNG de cada diapositiva de un PowerPoint existente. ' +
      'Úsalo después de ppt_create (con sync=true) para QA visual: analiza si hay texto cortado, ' +
      'overlapping de elementos, mal contraste, o problemas de espaciado. ' +
      'Si detectas problemas, crea una versión corregida con ppt_create.',
    parameters: PptGetSlideImagesSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', {
          required: true,
        });
        const result = await window.electron!.ai.tools.pptGetSlideImages(resourceId);
        if (!result.success || !result.slides?.length) {
          return jsonResult({
            status: 'error',
            error: result.error || 'No se pudieron obtener imágenes de las diapositivas',
          });
        }
        const content: ToolResultContent[] = [
          {
            type: 'text',
            text: `Presentación con ${result.slides.length} diapositiva(s). Analiza cada imagen para detectar problemas visuales (texto cortado, overlapping, contraste, espaciado).`,
          },
        ];
        for (const slide of result.slides as Array<{ index: number; image_base64: string }>) {
          content.push({
            type: 'text',
            text: `--- Slide ${slide.index + 1} ---`,
          });
          content.push({
            type: 'image',
            data: slide.image_base64,
            mimeType: 'image/png',
          });
        }
        return {
          content,
          details: { resource_id: resourceId, slide_count: result.slides.length },
        };
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
    createPptGetSlideImagesTool(),
  ];
}
