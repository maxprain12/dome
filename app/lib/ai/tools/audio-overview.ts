/**
 * Audio Overview Tools
 *
 * Tool that allows the AI agent to generate a podcast-style
 * dialogue script from source content. The script can then be
 * synthesized into audio using OpenAI TTS.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readStringArrayParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const VALID_FORMATS = ['podcast', 'briefing', 'debate'] as const;

// =============================================================================
// Schemas
// =============================================================================

const GenerateAudioScriptSchema = Type.Object({
  source_ids: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Array of resource IDs to use as source content for the audio script.',
    }),
  ),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID to scope the sources to. Defaults to the current project.',
    }),
  ),
  format: Type.Optional(
    Type.String({
      description:
        "Format of the audio script: 'podcast' (casual conversation between two hosts), " +
        "'briefing' (informative overview with host and expert), or " +
        "'debate' (two hosts with contrasting perspectives). Default: 'podcast'.",
    }),
  ),
  topic: Type.Optional(
    Type.String({
      description: 'Focus topic for the audio overview. If provided, the dialogue will center around this topic.',
    }),
  ),
});

// =============================================================================
// Helper Functions
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

function validateFormat(value: string | undefined): 'podcast' | 'briefing' | 'debate' {
  if (!value) return 'podcast';
  const normalized = value.toLowerCase().trim();
  if (VALID_FORMATS.includes(normalized as typeof VALID_FORMATS[number])) {
    return normalized as 'podcast' | 'briefing' | 'debate';
  }
  return 'podcast';
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a tool for generating audio overview scripts (podcast-style dialogues).
 */
export function createGenerateAudioScriptTool(): AnyAgentTool {
  return {
    label: 'Generate Audio Overview',
    name: 'generate_audio_script',
    description:
      'Generate a podcast-style dialogue script from selected sources. ' +
      'The script is a conversation between two hosts (Host 1 and Host 2) discussing the content. ' +
      'First use resource_search or resource_list to find relevant resources, then pass their IDs here. ' +
      'The result includes source content that you should use to write the dialogue. ' +
      'Return the audio script as a JSON structure with `type: "audio_overview"` containing: ' +
      '`format` ("podcast", "briefing", or "debate") and `lines` (array of { speaker: "Host 1" or "Host 2", text: string }). ' +
      'Make the dialogue natural, engaging, and educational. Each host should have a distinct perspective.',
    parameters: GenerateAudioScriptSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Audio script generation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id');
        const sourceIds = readStringArrayParam(params, 'source_ids');
        const formatRaw = readStringParam(params, 'format');
        const topic = readStringParam(params, 'topic');

        const format = validateFormat(formatRaw);

        // Gather source content from resources
        let sourceContent: Array<{ id: string; title: string; content: string }> = [];

        if (sourceIds && sourceIds.length > 0) {
          for (const sourceId of sourceIds) {
            try {
              const result = await window.electron.ai.tools.resourceGet(sourceId, {
                includeContent: true,
                maxContentLength: 8000,
              });

              if (result.success && result.resource) {
                sourceContent.push({
                  id: result.resource.id,
                  title: result.resource.title,
                  content:
                    result.resource.content ||
                    result.resource.transcription ||
                    result.resource.summary ||
                    '',
                });
              }
            } catch {
              // Skip resources that fail to load
            }
          }
        } else if (projectId) {
          // If no specific sources, get recent resources from project
          const listResult = await window.electron.ai.tools.resourceList({
            project_id: projectId,
            limit: 5,
            sort: 'updated_at',
          });

          if (listResult.success && listResult.resources) {
            for (const r of listResult.resources) {
              try {
                const result = await window.electron.ai.tools.resourceGet(r.id, {
                  includeContent: true,
                  maxContentLength: 5000,
                });

                if (result.success && result.resource) {
                  sourceContent.push({
                    id: result.resource.id,
                    title: result.resource.title,
                    content:
                      result.resource.content ||
                      result.resource.transcription ||
                      result.resource.summary ||
                      '',
                  });
                }
              } catch {
                // Skip resources that fail to load
              }
            }
          }
        }

        if (sourceContent.length === 0) {
          return jsonResult({
            status: 'error',
            error:
              'No source content found. Please specify source_ids or a project_id with available resources.',
          });
        }

        // Format-specific instructions
        let formatInstructions = '';
        switch (format) {
          case 'podcast':
            formatInstructions =
              'Create a casual, engaging conversation between Host 1 and Host 2. ' +
              'They should discuss the key ideas from the sources naturally, ' +
              'ask each other questions, and provide insights. Keep it conversational and fun.';
            break;
          case 'briefing':
            formatInstructions =
              'Create an informative briefing where Host 1 is the main presenter ' +
              'and Host 2 is the expert providing deeper analysis. ' +
              'The tone should be professional and thorough.';
            break;
          case 'debate':
            formatInstructions =
              'Create a debate where Host 1 and Host 2 present contrasting perspectives ' +
              'on the topics from the sources. They should challenge each other respectfully, ' +
              'provide evidence, and explore different angles.';
            break;
        }

        return jsonResult({
          status: 'success',
          message:
            `Source content gathered for ${format} audio script generation. ` +
            formatInstructions + ' ' +
            'Return the script as a JSON structure with `type: "audio_overview"` containing: ' +
            '`format` (the format string), and `lines` (an array of dialogue lines). ' +
            'Each line should be: { speaker: "Host 1" or "Host 2", text: string }. ' +
            'Aim for 10-20 lines of dialogue that covers the key points from the sources. ' +
            'Make each line 1-3 sentences long for natural speech.',
          format,
          topic: topic || 'General overview of sources',
          source_count: sourceContent.length,
          sources: sourceContent.map((s) => ({
            id: s.id,
            title: s.title,
            content: s.content.slice(0, 3000),
          })),
          output_format: {
            type: 'audio_overview',
            schema: {
              format: "'podcast' | 'briefing' | 'debate'",
              lines: '[{ speaker: "Host 1" | "Host 2", text: string }]',
            },
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create all audio overview tools.
 */
export function createAudioOverviewTools(): AnyAgentTool[] {
  return [createGenerateAudioScriptTool()];
}
