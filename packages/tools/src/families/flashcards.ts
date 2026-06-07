/**
 * @dome/tools — `flashcards` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The flashcards-family tool names (subset of the 103-tool catalog). */
export const FLASHCARDS_TOOL_NAMES = ['flashcard_create'] as const;

export type FlashcardsToolName = (typeof FLASHCARDS_TOOL_NAMES)[number];

export function flashcardsToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'flashcard_create',
        description:
          'Create a flashcard deck from Q&A pairs. Each card must have only question (string) and answer (string). Optionally difficulty: "easy"|"medium"|"hard". Do not add tags or other fields.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Deck title' },
            description: { type: 'string', description: 'Deck description' },
            project_id: { type: 'string', description: 'Project ID' },
            resource_id: { type: 'string', description: 'Source resource ID' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs used as sources' },
            cards: {
              type: 'array',
              description: 'Array of { question: string, answer: string, difficulty?: "easy"|"medium"|"hard" } - no other fields',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['question', 'answer'],
              },
            },
          },
          required: ['title', 'cards'],
        },
      },
    },
  ];
}
