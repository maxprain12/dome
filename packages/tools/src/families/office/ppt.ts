/**
 * @dome/tools — `office` family: PowerPoint .pptx tool definitions.
 *
 * Faithful to `getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../../types.js';

export const PPT_TOOL_NAMES = [
  'ppt_create',
  'ppt_get_file_path',
  'ppt_get_slides',
  'ppt_get_slide_images',
  'ppt_export',
] as const;

export type PptToolName = (typeof PPT_TOOL_NAMES)[number];

export function pptToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'ppt_create',
        description:
          'Create a PowerPoint with PptxGenJS only. Use script (JavaScript, CommonJS) for full control, or spec (JSON) for simple themed slides. Python is not supported. Every slide must have real content from source documents.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID' },
            folder_id: { type: 'string', description: 'Folder ID to place the PPT in' },
            title: { type: 'string', description: 'Resource title' },
            script: {
              type: 'string',
              description:
                'PptxGenJS script executed in a Node sandbox. Use: const pptxgen = require("pptxgenjs"); const pres = new pptxgen(); pres.layout = "LAYOUT_16x9"; build slides; await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH }). Requires system Node (or PPTXGEN_NODE).',
            },
            spec: {
              type: 'object',
              description: 'Presentation spec. Include theme for themed slides.',
              properties: {
                title: { type: 'string' },
                theme: {
                  type: 'string',
                  enum: ['midnight_executive', 'forest_moss', 'ocean_gradient', 'sunset_warm', 'slate_minimal', 'emerald_pro'],
                  description: 'Theme: midnight_executive (business), forest_moss (sustainability), ocean_gradient (tech), sunset_warm (marketing), slate_minimal (academic), emerald_pro (finance)',
                },
                slides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      layout: { type: 'string', enum: ['title', 'content', 'bullet', 'title_only', 'blank'] },
                      title: { type: 'string' },
                      subtitle: { type: 'string' },
                      bullets: { type: 'array', items: { type: 'string' } },
                      textboxes: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_file_path',
        description: 'Get absolute file path of a PowerPoint resource.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_slides',
        description: 'Get slide content (text) from a PowerPoint presentation.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_slide_images',
        description:
          'Get PNG screenshots of each slide for visual QA after ppt_create. Returns base64 images per slide index.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_export',
        description: 'Export PowerPoint to base64 (pptx).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
  ];
}
