/**
 * Editor AI Service
 *
 * Provides AI-powered text operations for inline use within the Tiptap editor.
 * Uses the existing chatStream infrastructure from the AI client.
 */

import { chatStream, getAIConfig } from '@/lib/ai/client';

// =============================================================================
// Types
// =============================================================================

export type EditorAIAction =
  | 'review'
  | 'expand'
  | 'summarize'
  | 'improve'
  | 'translate'
  | 'continue'
  | 'custom';

// =============================================================================
// Action Prompts
// =============================================================================

const ACTION_PROMPTS: Record<Exclude<EditorAIAction, 'custom'>, string> = {
  review:
    'Review the following text for grammar, spelling, and style issues. Return the corrected version only, with no explanation. Preserve all formatting (HTML tags, markdown, etc.).',
  expand:
    'Expand on the following text, adding more detail, depth, and supporting points while maintaining the same tone, style, and formatting. Return only the expanded text.',
  summarize:
    'Summarize the following text concisely, capturing the key points. Return only the summary.',
  improve:
    'Improve the writing quality of the following text — make it clearer, more engaging, and better structured. Preserve the formatting. Return only the improved version.',
  translate:
    'Translate the following text. If it is in Spanish, translate to English. If it is in English, translate to Spanish. If it is in another language, translate to English. Return only the translation, preserving formatting.',
  continue:
    'Continue writing from where the following text ends. Match the tone, style, and topic. Write 2-3 additional paragraphs. Return only the new content (do not repeat the original text).',
};

// =============================================================================
// Main Function
// =============================================================================

/**
 * Execute an AI action on text within the editor.
 *
 * @param action - The type of AI action to perform
 * @param selectedText - The text the user selected (or full document for some actions)
 * @param documentContext - Surrounding document content for context (truncated)
 * @param customPrompt - Custom prompt when action is 'custom'
 * @param signal - Optional AbortSignal for cancellation
 * @returns The AI-generated replacement text
 */
export async function executeEditorAIAction(
  action: EditorAIAction,
  selectedText: string,
  documentContext: string,
  customPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI not configured. Go to Settings to set up your API key.');
  }

  const actionPrompt =
    action === 'custom'
      ? customPrompt || 'Help me with this text.'
      : ACTION_PROMPTS[action];

  const contextSnippet = documentContext.substring(0, 3000);

  const messages = [
    {
      role: 'system',
      content: `You are an inline writing assistant embedded in a note-taking application called Dome. You help users improve, expand, review, and transform their text.

CRITICAL RULES:
- Respond ONLY with the modified/generated text
- Do NOT include explanations, commentary, or meta-text
- Do NOT wrap your response in quotes or code blocks
- Preserve the original formatting (HTML tags, markdown, lists, etc.)
- Match the language of the original text unless translating
- Be concise and direct

Document context (for reference only — do NOT repeat this):
${contextSnippet}`,
    },
    {
      role: 'user',
      content: `${actionPrompt}\n\nText:\n${selectedText}`,
    },
  ];

  let result = '';

  for await (const chunk of chatStream(messages, undefined, signal)) {
    if (chunk.type === 'text' && chunk.text) {
      result += chunk.text;
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error || 'AI streaming error');
    }
  }

  return result.trim();
}

/**
 * Execute an AI action with streaming callback for real-time UI updates.
 */
export async function executeEditorAIActionStreaming(
  action: EditorAIAction,
  selectedText: string,
  documentContext: string,
  onChunk: (partialResult: string) => void,
  customPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI not configured. Go to Settings to set up your API key.');
  }

  const actionPrompt =
    action === 'custom'
      ? customPrompt || 'Help me with this text.'
      : ACTION_PROMPTS[action];

  const contextSnippet = documentContext.substring(0, 3000);

  const messages = [
    {
      role: 'system',
      content: `You are an inline writing assistant embedded in a note-taking application called Dome. You help users improve, expand, review, and transform their text.

CRITICAL RULES:
- Respond ONLY with the modified/generated text
- Do NOT include explanations, commentary, or meta-text
- Do NOT wrap your response in quotes or code blocks
- Preserve the original formatting (HTML tags, markdown, lists, etc.)
- Match the language of the original text unless translating
- Be concise and direct

Document context (for reference only — do NOT repeat this):
${contextSnippet}`,
    },
    {
      role: 'user',
      content: `${actionPrompt}\n\nText:\n${selectedText}`,
    },
  ];

  let result = '';

  for await (const chunk of chatStream(messages, undefined, signal)) {
    if (chunk.type === 'text' && chunk.text) {
      result += chunk.text;
      onChunk(result);
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error || 'AI streaming error');
    }
  }

  return result.trim();
}
