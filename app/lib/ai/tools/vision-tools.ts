/**
 * On-device vision tools (Gemma) — describe library images / analyze screenshots.
 * Many runs execute via main-process dispatcher.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

const mainOnly = () =>
  jsonResult({
    success: false,
    error: 'Vision tools run in the Dome agent runtime (Many). Requires Gemma enabled in Settings.',
  });

export function createImageDescribeTool(): AnyAgentTool {
  return {
    label: 'Describe image',
    name: 'image_describe',
    description:
      'Describe an image resource using on-device Gemma (no cloud vision). Use for image-type resources in the library.',
    parameters: Type.Object({
      resource_id: Type.String({ description: 'Image resource ID' }),
    }),
    execute: async () => mainOnly(),
  };
}

export function createScreenUnderstandTool(): AnyAgentTool {
  return {
    label: 'Understand screen',
    name: 'screen_understand',
    description:
      'Analyze a screenshot (base64 PNG) for UI elements and intent. Returns JSON-like analysis from on-device Gemma. Requires Gemma enabled in Settings.',
    parameters: Type.Object({
      image_base64: Type.String({
        description: 'Base64-encoded PNG (with or without data URL prefix)',
      }),
      intent: Type.Optional(Type.String({ description: 'Optional user goal to bias the analysis' })),
    }),
    execute: async () => mainOnly(),
  };
}

export function createVisionTools(): AnyAgentTool[] {
  return [createImageDescribeTool(), createScreenUnderstandTool()];
}
