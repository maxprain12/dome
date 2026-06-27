/**
 * Prompt loader for renderer process.
 * Loads prompt templates from bundled assets (imported at build time).
 */

import roleMany from '../../../packages/prompts/sections/role-many.txt?raw';
import { buildEditorPromptFromTemplate } from '@/lib/prompt-assembler/bridge';
import editorSystem from '../../../packages/prompts/surfaces/editor/system.txt?raw';
import editorReview from '../../../packages/prompts/surfaces/editor/actions/review.txt?raw';
import editorExpand from '../../../packages/prompts/surfaces/editor/actions/expand.txt?raw';
import editorSummarize from '../../../packages/prompts/surfaces/editor/actions/summarize.txt?raw';
import editorImprove from '../../../packages/prompts/surfaces/editor/actions/improve.txt?raw';
import editorTranslate from '../../../packages/prompts/surfaces/editor/actions/translate.txt?raw';
import editorContinue from '../../../packages/prompts/surfaces/editor/actions/continue.txt?raw';
import editorShorten from '../../../packages/prompts/surfaces/editor/actions/shorten.txt?raw';
import editorTodo from '../../../packages/prompts/surfaces/editor/actions/todo.txt?raw';
import editorExplain from '../../../packages/prompts/surfaces/editor/actions/explain.txt?raw';
import studioWithTools from '../../../packages/prompts/surfaces/studio/with-tools.txt?raw';
import studioWithoutTools from '../../../packages/prompts/surfaces/studio/without-tools.txt?raw';

export const prompts = {
  editor: {
    system: editorSystem,
    actions: {
      review: editorReview,
      expand: editorExpand,
      summarize: editorSummarize,
      improve: editorImprove,
      translate: editorTranslate,
      continue: editorContinue,
      shorten: editorShorten,
      todo: editorTodo,
      explain: editorExplain,
    },
  },
  studio: {
    withTools: studioWithTools,
    withoutTools: studioWithoutTools,
  },
} as const;

/** Coarse local time-of-day bucket (stable for prompt caching; avoids minute-level churn). */
export function getPartOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

/**
 * Build Many floating persona (stable prefix — no UI context, date, or resource).
 */
export function buildManyFloatingPrompt(): string {
  return roleMany;
}

/**
 * Build editor system prompt.
 */
export function buildEditorSystemPrompt(contextSnippet: string, actionInstruction?: string): string {
  return buildEditorPromptFromTemplate({
    systemTemplate: prompts.editor.system,
    contextSnippet,
    actionInstruction: actionInstruction ?? 'Apply the action described in the user message.',
  });
}

/**
 * Get editor action prompt by action type.
 */
export function getEditorActionPrompt(
  action: 'review' | 'expand' | 'summarize' | 'improve' | 'translate' | 'continue' | 'shorten' | 'todo' | 'explain',
): string {
  return prompts.editor.actions[action];
}

/**
 * Get Studio system prompt.
 */
export function getStudioPrompt(withTools: boolean): string {
  return withTools ? prompts.studio.withTools : prompts.studio.withoutTools;
}
