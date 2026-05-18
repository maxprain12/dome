/**
 * Flashcard Tools
 *
 * Tool that allows the AI agent to create study flashcard decks
 * from resource content in the user's knowledge base.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Schemas
// =============================================================================

const FlashcardCreateSchema = Type.Object({
  resource_id: Type.Optional(
    Type.String({
      description: 'The ID of the primary source resource. Pass this to associate the deck with the resource.',
    }),
  ),
  source_ids: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Array of resource IDs used as sources for the flashcards.',
    }),
  ),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID. Defaults to the current project.',
    }),
  ),
  title: Type.Optional(Type.String({
    description: 'Title for the flashcard deck. Defaults to "Untitled Deck" if omitted.',
  })),
  description: Type.Optional(
    Type.String({
      description: 'Brief description of what this deck covers.',
    }),
  ),
  cards: Type.Array(
    Type.Object({
      question: Type.String({ description: 'The question (front of card).' }),
      answer: Type.String({ description: 'The answer (back of card).' }),
      difficulty: Type.Optional(
        Type.String({ description: "'easy', 'medium', or 'hard'. Default: 'medium'." }),
      ),
    }),
    {
      description: 'Array of flashcard question-answer pairs to create.',
      minItems: 1,
    },
  ),
});

// =============================================================================
// Helper
// =============================================================================

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a tool for generating flashcard decks.
 */
export function createFlashcardCreateTool(): AnyAgentTool {
  return {
    label: 'Create Flashcards',
    name: 'flashcard_create',
    description:
      'Create a flashcard deck (question/answer pairs) for spaced-repetition study. ' +
      'First read the source resource with resource_get, then generate the Q&A pairs, then call this tool to save them. ' +
      'The user can review cards with a swipe-to-answer spaced-repetition interface.',
    parameters: FlashcardCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'Flashcard creation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: false }) || 'Untitled Deck';
        const resourceId = readStringParam(params, 'resource_id');
        const sourceIds = params.source_ids as string[] | undefined;
        const projectId = readStringParam(params, 'project_id');
        const description = readStringParam(params, 'description');
        const cards = params.cards as Array<{ question: string; answer: string; difficulty?: string }>;

        if (!cards || !Array.isArray(cards) || cards.length === 0) {
          return jsonResult({ status: 'error', error: 'At least one card is required.' });
        }

        const result = await window.electron.ai.tools.flashcardCreate({
          resource_id: resourceId,
          source_ids: sourceIds,
          project_id: projectId || 'default',
          title,
          description,
          cards: cards.map(c => ({
            question: c.question,
            answer: c.answer,
            difficulty: c.difficulty,
          })),
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to create flashcard deck',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Flashcard deck "${title}" created with ${result.deck?.card_count || cards.length} cards. The user can now study them from the Flashcards section.`,
          deck: result.deck,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

// =============================================================================
// Bundle Export
// =============================================================================

export function createFlashcardTools(): AnyAgentTool[] {
  return [createFlashcardCreateTool()];
}
