/**
 * Prompt loader for renderer process.
 * Loads prompt templates from bundled assets (imported at build time).
 */

import martinBase from '../../../prompts/martin/base.txt?raw';
import martinTools from '../../../prompts/martin/tools.txt?raw';
import martinResourceContext from '../../../prompts/martin/resource-context.txt?raw';
import martinNotebookContext from '../../../prompts/martin/notebook-context.txt?raw';
import martinFloatingBase from '../../../prompts/martin/floating-base.txt?raw';
import editorSystem from '../../../prompts/editor/system.txt?raw';
import editorReview from '../../../prompts/editor/actions/review.txt?raw';
import editorExpand from '../../../prompts/editor/actions/expand.txt?raw';
import editorSummarize from '../../../prompts/editor/actions/summarize.txt?raw';
import editorImprove from '../../../prompts/editor/actions/improve.txt?raw';
import editorTranslate from '../../../prompts/editor/actions/translate.txt?raw';
import editorContinue from '../../../prompts/editor/actions/continue.txt?raw';
import studioWithTools from '../../../prompts/studio/with-tools.txt?raw';
import studioWithoutTools from '../../../prompts/studio/without-tools.txt?raw';

export const prompts = {
  martin: {
    base: martinBase,
    tools: martinTools,
    resourceContext: martinResourceContext,
    notebookContext: martinNotebookContext,
    floatingBase: martinFloatingBase,
  },
  editor: {
    system: editorSystem,
    actions: {
      review: editorReview,
      expand: editorExpand,
      summarize: editorSummarize,
      improve: editorImprove,
      translate: editorTranslate,
      continue: editorContinue,
    },
  },
  studio: {
    withTools: studioWithTools,
    withoutTools: studioWithoutTools,
  },
} as const;

function replaceAll(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Build Martin base prompt with placeholders replaced.
 */
export function buildMartinBasePrompt(options: {
  location: 'workspace' | 'home' | 'whatsapp';
  date?: string;
  time?: string;
  resourceTitle?: string;
  includeDateTime?: boolean;
}): string {
  const resourceTitleLine = options.resourceTitle
    ? `- Active resource: "${options.resourceTitle}"\n`
    : '';
  const dateTimeSection =
    options.includeDateTime !== false && options.date && options.time
      ? `- Date: ${options.date}\n- Time: ${options.time}\n`
      : '';
  return replaceAll(prompts.martin.base, {
    location: options.location === 'workspace' ? 'Workspace' : options.location === 'home' ? 'Home' : 'WhatsApp',
    dateTimeSection,
    resourceTitleLine,
  });
}

/**
 * Build Martin floating button prompt.
 */
export function buildMartinFloatingPrompt(options: {
  location: string;
  description: string;
  date: string;
  time: string;
  resourceTitle?: string;
  whatsappConnected?: boolean;
}): string {
  const resourceTitleLine = options.resourceTitle ? `- Active resource: "${options.resourceTitle}"\n` : '';
  const whatsappSuffix = options.whatsappConnected ? ' (connected)' : '';
  return replaceAll(prompts.martin.floatingBase, {
    location: options.location,
    description: options.description,
    date: options.date,
    time: options.time,
    resourceTitleLine,
    whatsappSuffix,
  });
}

/**
 * Build Martin resource context section.
 */
export function buildMartinResourceContext(options: {
  type?: string;
  summary?: string;
  content?: string;
  transcription?: string;
  maxContentLen?: number;
  maxTranscriptionLen?: number;
}): string {
  const maxContent = options.maxContentLen ?? 2000;
  const maxTranscription = options.maxTranscriptionLen ?? 2000;
  const resourceTypeLine = options.type ? `Type: ${options.type}` : '';
  const resourceSummarySection = options.summary ? `\n\nSummary: ${options.summary}` : '';
  const contentTruncated = (options.content?.length ?? 0) > maxContent;
  const resourceContentSection = options.content
    ? `\n\nContent${contentTruncated ? ' (excerpt)' : ''}:\n${options.content.substring(0, maxContent)}${contentTruncated ? '...' : ''}`
    : '';
  const transcriptionTruncated = (options.transcription?.length ?? 0) > maxTranscription;
  const resourceTranscriptionSection = options.transcription
    ? `\n\nTranscription${transcriptionTruncated ? ' (excerpt)' : ''}:\n${options.transcription.substring(0, maxTranscription)}${transcriptionTruncated ? '...' : ''}`
    : '';

  return replaceAll(prompts.martin.resourceContext, {
    resourceTypeLine,
    resourceSummarySection,
    resourceContentSection,
    resourceTranscriptionSection,
  });
}

/**
 * Build editor system prompt.
 */
export function buildEditorSystemPrompt(contextSnippet: string): string {
  return replaceAll(prompts.editor.system, { contextSnippet });
}

/**
 * Get editor action prompt by action type.
 */
export function getEditorActionPrompt(
  action: 'review' | 'expand' | 'summarize' | 'improve' | 'translate' | 'continue',
): string {
  return prompts.editor.actions[action];
}

/**
 * Get Studio system prompt.
 */
export function getStudioPrompt(withTools: boolean): string {
  return withTools ? prompts.studio.withTools : prompts.studio.withoutTools;
}
