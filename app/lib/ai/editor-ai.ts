/**
 * Editor AI Service
 *
 * Provides AI-powered text operations for inline use within the Tiptap editor.
 * Uses the existing chatStream infrastructure from the AI client.
 */

import { chatStream, getAIConfig } from '@/lib/ai/client';
import { buildEditorSystemPrompt, getEditorActionPrompt } from '@/lib/prompts/loader';

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

// Action prompts are loaded from prompts/editor/actions/*.txt via getEditorActionPrompt

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
    throw new Error('AI not configured. Go to Settings > AI to configure your provider and API key.');
  }

  // Pre-validate API key for providers that need one
  const needsApiKey = config.provider !== 'ollama';
  if (needsApiKey && !config.apiKey) {
    throw new Error(`API key missing for ${config.provider}. Go to Settings > AI to add your key.`);
  }

  const actionPrompt =
    action === 'custom'
      ? customPrompt || 'Help me with this text.'
      : getEditorActionPrompt(action);

  const contextSnippet = documentContext.substring(0, 3000);
  const systemContent = buildEditorSystemPrompt(contextSnippet);

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: `${actionPrompt}\n\nText:\n${selectedText}` },
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
    throw new Error('AI not configured. Go to Settings > AI to configure your provider and API key.');
  }

  // Pre-validate API key for providers that need one
  const needsApiKey = config.provider !== 'ollama';
  if (needsApiKey && !config.apiKey) {
    throw new Error(`API key missing for ${config.provider}. Go to Settings > AI to add your key.`);
  }

  const actionPrompt =
    action === 'custom'
      ? customPrompt || 'Help me with this text.'
      : getEditorActionPrompt(action);

  const contextSnippet = documentContext.substring(0, 3000);
  const systemContent = buildEditorSystemPrompt(contextSnippet);

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: `${actionPrompt}\n\nText:\n${selectedText}` },
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
