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
  title: Type.Optional(Type.String({
    description: 'Title for the new PowerPoint resource. If omitted, it is extracted from pres.title in the script.',
  })),
  script: Type.Optional(
    Type.String({
      description:
        'PptxGenJS-only script (CommonJS). Example: `const pptxgen = require("pptxgenjs"); const pres = new pptxgen(); pres.layout = "LAYOUT_16x9";` add slides with pres.addSlide(), slide.addText(), shapes, charts per PptxGenJS docs; end with `await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })`. Python is not supported. Populate every slide with real content. Use sync=true for immediate visual QA with ppt_get_slide_images.',
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
    label: 'Create PowerPoint',
    name: 'ppt_create',
    description:
      'Create a PowerPoint presentation with PptxGenJS: pass a JavaScript script (Node) for full control, or a JSON spec for simple slides. ' +
      'Use sync=true to immediately QA slides visually with ppt_get_slide_images after creation. ' +
      'Each slide should contain real content from the source documents.',
    parameters: PptCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'PPT tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const script = typeof params.script === 'string' ? params.script : undefined;
        const spec = params.spec as Record<string, unknown> | undefined;
        // title is optional — fall back to pres.title in the script, then spec.title, then generic
        const titleParam = readStringParam(params, 'title', { required: false });
        const scriptTitle = script
          ? (script.match(/pres\.title\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? '')
          : '';
        const title = titleParam || scriptTitle || (spec?.title as string | undefined) || 'Untitled Presentation';
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
    label: 'Get PPT file path',
    name: 'ppt_get_file_path',
    description: 'Get the absolute disk path of a PowerPoint resource.',
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
    label: 'Get PPT slides',
    name: 'ppt_get_slides',
    description:
      'Get the content of slides from an existing PowerPoint (title and text of each slide).',
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
    description: 'ID of the PPT resource to retrieve slide images from.',
  }),
});

export function createPptGetSlideImagesTool(): AnyAgentTool {
  return {
    label: 'Get PPT slide images',
    name: 'ppt_get_slide_images',
    description:
      'Get PNG images of each slide from an existing PowerPoint. ' +
      'Use after ppt_create (with sync=true) for visual QA: inspect for cut-off text, ' +
      'overlapping elements, poor contrast, or spacing issues. ' +
      'If problems are detected, create a corrected version with ppt_create.',
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
            error: result.error || 'Could not retrieve slide images',
          });
        }
        const content: ToolResultContent[] = [
          {
            type: 'text',
            text: `Presentation with ${result.slides.length} slide(s). Inspect each image for visual issues (cut-off text, overlapping, contrast, spacing).`,
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
