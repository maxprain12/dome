/**
 * Studio Output Tools
 *
 * Tools for generating mind maps and quizzes from the user's
 * knowledge base. These tools allow the AI agent to create
 * structured study outputs that are rendered in the Studio panel.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam, readStringArrayParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_QUIZ_QUESTIONS = 5;
const MAX_QUIZ_QUESTIONS = 20;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

// =============================================================================
// Schemas
// =============================================================================

const GenerateMindmapSchema = Type.Object({
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID to scope the mind map to. Defaults to the current project.',
    }),
  ),
  source_ids: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Array of resource IDs to use as source content for the mind map.',
    }),
  ),
  topic: Type.Optional(
    Type.String({
      description: 'Focus topic for the mind map. If provided, the mind map will be centered around this topic.',
    }),
  ),
});

const GenerateQuizSchema = Type.Object({
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID to scope the quiz to. Defaults to the current project.',
    }),
  ),
  source_ids: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Array of resource IDs to use as source content for quiz questions.',
    }),
  ),
  num_questions: Type.Optional(
    Type.Number({
      description: 'Number of questions to generate (1-20). Default: 5.',
      minimum: 1,
      maximum: MAX_QUIZ_QUESTIONS,
    }),
  ),
  difficulty: Type.Optional(
    Type.String({
      description: "Difficulty level: 'easy', 'medium', or 'hard'. Default: 'medium'.",
    }),
  ),
});

// =============================================================================
// Helper Functions
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

function clampLimit(value: number | undefined, defaultVal: number, maxVal: number): number {
  if (value === undefined || value === null) return defaultVal;
  return Math.max(1, Math.min(maxVal, Math.floor(value)));
}

function validateDifficulty(value: string | undefined): 'easy' | 'medium' | 'hard' {
  if (!value) return 'medium';
  const normalized = value.toLowerCase().trim();
  if (VALID_DIFFICULTIES.includes(normalized as typeof VALID_DIFFICULTIES[number])) {
    return normalized as 'easy' | 'medium' | 'hard';
  }
  return 'medium';
}

// =============================================================================
// Tool Factories
// =============================================================================

/**
 * Create a tool for generating mind maps from sources.
 */
export function createGenerateMindmapTool(): AnyAgentTool {
  return {
    label: 'Generar Mapa Mental',
    name: 'generate_mindmap',
    description:
      'Generate a mind map from selected sources. Analyzes the content and creates a visual knowledge map with connected concepts. ' +
      'First use resource_search or resource_list to find relevant resources, then pass their IDs here. ' +
      'The result is a structured JSON with nodes and edges that will be rendered as an interactive mind map in the Studio panel. ' +
      'You should create meaningful nodes representing key concepts and connect them with labeled edges showing relationships.',
    parameters: GenerateMindmapSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Mind map generation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id');
        const sourceIds = readStringArrayParam(params, 'source_ids');
        const topic = readStringParam(params, 'topic');

        // Gather source content from resources if source_ids provided
        let sourceContent: Array<{ id: string; title: string; snippet: string }> = [];

        if (sourceIds && sourceIds.length > 0) {
          // Fetch content for each source
          for (const sourceId of sourceIds) {
            try {
              const result = await window.electron.ai.tools.resourceGet(sourceId, {
                includeContent: true,
                maxContentLength: 5000,
              });

              if (result.success && result.resource) {
                sourceContent.push({
                  id: result.resource.id,
                  title: result.resource.title,
                  snippet: (result.resource.content || result.resource.summary || '').slice(0, 500),
                });
              }
            } catch {
              // Skip resources that fail to load
            }
          }
        } else if (projectId) {
          // If no specific sources, list resources from project
          const result = await window.electron.ai.tools.resourceList({
            project_id: projectId,
            limit: 10,
            sort: 'updated_at',
          });

          if (result.success && result.resources) {
            sourceContent = result.resources.map(r => ({
              id: r.id,
              title: r.title,
              snippet: '',
            }));
          }
        }

        // Return the source content info so the AI model can generate the actual mind map structure
        // The AI should respond with the nodes/edges in a follow-up
        return jsonResult({
          status: 'success',
          message:
            'Source content gathered for mind map generation. ' +
            'Now create the mind map by returning a JSON structure with `type: "mindmap"` containing ' +
            '`nodes` (array of {id, label}) and `edges` (array of {id, source, target, label?}). ' +
            'The central topic should be the root node, with related concepts branching outward.',
          topic: topic || 'General overview',
          source_count: sourceContent.length,
          sources: sourceContent.map(s => ({
            id: s.id,
            title: s.title,
            snippet: s.snippet,
          })),
          output_format: {
            type: 'mindmap',
            schema: {
              nodes: '[{ id: string, label: string }]',
              edges: '[{ id: string, source: string, target: string, label?: string }]',
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

/**
 * Create a tool for generating quizzes from sources.
 */
export function createGenerateQuizTool(): AnyAgentTool {
  return {
    label: 'Generar Quiz',
    name: 'generate_quiz',
    description:
      'Generate a quiz from selected sources. Creates multiple-choice and true/false questions to test knowledge. ' +
      'First use resource_search or resource_list to find relevant resources, then pass their IDs here. ' +
      'The result includes source content that you should use to generate quiz questions. ' +
      'Return the quiz as a JSON structure with `type: "quiz"` containing an array of questions, each with ' +
      'question text, options (for multiple choice), the correct answer index, and an explanation.',
    parameters: GenerateQuizSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Quiz generation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id');
        const sourceIds = readStringArrayParam(params, 'source_ids');
        const numQuestionsRaw = readNumberParam(params, 'num_questions', { integer: true });
        const difficultyRaw = readStringParam(params, 'difficulty');

        const numQuestions = clampLimit(numQuestionsRaw, DEFAULT_QUIZ_QUESTIONS, MAX_QUIZ_QUESTIONS);
        const difficulty = validateDifficulty(difficultyRaw);

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
                  content: result.resource.content || result.resource.transcription || result.resource.summary || '',
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
                    content: result.resource.content || result.resource.transcription || result.resource.summary || '',
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
            error: 'No source content found. Please specify source_ids or a project_id with available resources.',
          });
        }

        // Return the source content info so the AI model can generate the actual quiz
        return jsonResult({
          status: 'success',
          message:
            `Source content gathered for quiz generation. Generate ${numQuestions} questions at ${difficulty} difficulty. ` +
            'Return the quiz as a JSON structure with `type: "quiz"` containing a `questions` array. ' +
            'Each question should have: id (unique string), type ("multiple_choice" or "true_false"), ' +
            'question (the question text), options (array of 4 strings for multiple choice), ' +
            'correct (index of correct answer, 0-based), and explanation (why the answer is correct).',
          num_questions: numQuestions,
          difficulty,
          source_count: sourceContent.length,
          sources: sourceContent.map(s => ({
            id: s.id,
            title: s.title,
            content: s.content.slice(0, 3000),
          })),
          output_format: {
            type: 'quiz',
            schema: {
              questions: '[{ id: string, type: "multiple_choice" | "true_false", question: string, options?: string[], correct: number, explanation: string }]',
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
 * Create all studio output tools.
 */
export function createStudioTools(): AnyAgentTool[] {
  return [
    createGenerateMindmapTool(),
    createGenerateQuizTool(),
  ];
}
