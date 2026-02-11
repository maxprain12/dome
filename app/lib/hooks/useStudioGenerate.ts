/**
 * useStudioGenerate Hook
 *
 * Handles AI-powered generation of studio outputs (mind map, quiz, guide, etc.)
 * when the user clicks a tile in the Studio panel. Runs the generation flow
 * directly without requiring the chat UI.
 */

import { useCallback, useState } from 'react';
import {
  getAIConfig,
  chatWithTools,
  chatStream,
  createAllMartinTools,
  providerSupportsTools,
  type AIProviderType,
} from '@/lib/ai';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import type { StudioOutputType, StudioOutput } from '@/types';

const STUDIO_TYPE_TITLES: Record<string, string> = {
  mindmap: 'Mind Map',
  quiz: 'Quiz',
  guide: 'Study Guide',
  faq: 'FAQ',
  timeline: 'Timeline',
  table: 'Data Table',
  flashcards: 'Flashcards',
};

/** Ollama models known to support tools reliably */
const STABLE_TOOLS_MODELS = new Set([
  'llama3.1',
  'llama3.2',
  'llama3.3',
  'qwen2.5',
  'qwen3',
  'qwen2.5-coder',
  'mistral',
  'mixtral',
  'codellama',
  'deepseek-coder',
  'phi3',
  'gemma2',
  'command-r',
]);

function isStableToolsModel(modelId: string): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase().trim();
  return STABLE_TOOLS_MODELS.has(id) || id.startsWith('llama3.1') || id.startsWith('llama3.2') || id.startsWith('qwen2.5') || id.startsWith('qwen3');
}

/** Fetch project resources content for no-tools mode (pre-inject into prompt) */
async function fetchContextForStudio(projectId: string, sourceIds?: string[]): Promise<string> {
  if (typeof window === 'undefined' || !window.electron?.ai?.tools) return '';

  const parts: string[] = [];
  try {
    let resourceIds: string[] = sourceIds ?? [];
    if (resourceIds.length === 0) {
      const listResult = await window.electron.ai.tools.resourceList({
        project_id: projectId,
        limit: 10,
        sort: 'updated_at',
      });
      if (listResult.success && listResult.resources?.length) {
        resourceIds = listResult.resources.map((r: { id: string }) => r.id);
      }
    }
    if (resourceIds.length === 0) return 'No resources found in this project.';

    for (const id of resourceIds.slice(0, 8)) {
      const getResult = await window.electron.ai.tools.resourceGet(id, {
        includeContent: true,
        maxContentLength: 4000,
      });
      if (getResult.success && getResult.resource) {
        const r = getResult.resource;
        const content = r.content || r.summary || r.transcription || '';
        if (content) {
          parts.push(`--- Resource: ${r.title} (${r.type}) ---\n${content}`);
        }
      }
    }
  } catch (e) {
    console.warn('[useStudioGenerate] fetchContextForStudio error:', e);
  }
  return parts.length ? parts.join('\n\n') : 'No content could be extracted from project resources.';
}

/** Extract JSON object from AI response (handles markdown code blocks, extra text, Ollama quirks) */
function extractStudioJson(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== 'string') return null;

  let trimmed = text.trim();
  if (!trimmed) return null;

  function tryParse(raw: string): Record<string, unknown> | null {
    if (!raw?.trim()) return null;
    let s = raw.trim();
    // Remove trailing commas before } or ]
    s = s.replace(/,(\s*[}\]])/g, '$1');
    // Remove single-line // comments
    s = s.replace(/\/\/[^\n]*/g, '');
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  // 1. Markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json|javascript)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1] !== undefined) {
    const parsed = tryParse(codeBlockMatch[1]);
    if (parsed) return parsed;
  }

  // 2. Find JSON object with balanced braces (handles nested structures)
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let stringChar = '';
    for (let i = firstBrace; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === '\\') escape = true;
        else if (c === stringChar) inString = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        stringChar = c;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(firstBrace, i + 1);
          const parsed = tryParse(slice);
          if (parsed) return parsed;
          break;
        }
      }
    }
  }

  // 3. JSON array - wrap in object if needed
  const firstBracket = trimmed.indexOf('[');
  if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
    const arrMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const arr = JSON.parse(arrMatch[0].replace(/,(\s*[}\]])/g, '$1'));
        if (Array.isArray(arr) && arr.length > 0) {
          const first = arr[0];
          if (typeof first === 'object' && first !== null) {
            return { type: 'unknown', items: arr } as Record<string, unknown>;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Greedy fallback: first { to last }, try truncation repair
  const greedyMatch = trimmed.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    let candidate = greedyMatch[0];
    let parsed = tryParse(candidate);
    if (parsed) return parsed;
    const lastClose = candidate.lastIndexOf('}');
    if (lastClose > 0) {
      const truncated = candidate.slice(0, lastClose + 1);
      parsed = tryParse(truncated);
      if (parsed) return parsed;
    }
  }

  // 5. Try parsing the whole trimmed string
  return tryParse(trimmed);
}

/** Build user prompt for each studio type (with tools) */
function buildGeneratePrompt(
  type: StudioOutputType,
  projectId: string,
  sourceIds?: string[],
): string {
  const base = projectId ? `Project ID: ${projectId}` : '';
  const sources = sourceIds && sourceIds.length > 0
    ? ` Use these source IDs: ${sourceIds.join(', ')}`
    : '';

  switch (type) {
    case 'mindmap':
      return `Generate a mind map from the project sources.${sources} ${base}
Use the generate_mindmap tool first to get source content, then return a JSON object with type "mindmap" containing:
- nodes: array of { id: string, label: string }
- edges: array of { id: string, source: string, target: string, label?: string }
Return ONLY the JSON, no other text.`;
    case 'quiz':
      return `Generate a quiz from the project sources.${sources} ${base}
Use the generate_quiz tool first to get source content, then return a JSON object with type "quiz" containing:
- questions: array of { id: string, type: "multiple_choice"|"true_false", question: string, options?: string[], correct: number, explanation: string }
Return ONLY the JSON, no other text.`;
    case 'guide':
      return `Generate a study guide from the project sources.${sources} ${base}
Use resource_list and resource_get to fetch content, then return a JSON object with type "guide" containing:
- sections: array of { title: string, content: string } (content in markdown)
Return ONLY the JSON, no other text.`;
    case 'faq':
      return `Generate an FAQ from the project sources.${sources} ${base}
Use resource_list and resource_get to fetch content, then return a JSON object with type "faq" containing:
- pairs: array of { question: string, answer: string }
Return ONLY the JSON, no other text.`;
    case 'timeline':
      return `Generate a timeline from the project sources.${sources} ${base}
Use resource_list and resource_get to fetch content, then return a JSON object with type "timeline" containing:
- events: array of { date: string, title: string, description: string }
Return ONLY the JSON, no other text.`;
    case 'table':
      return `Generate a data table from the project sources.${sources} ${base}
Use resource_list and resource_get to fetch content, then return a JSON object with type "table" containing:
- columns: array of { key: string, label: string }
- rows: array of record objects with column keys
Return ONLY the JSON, no other text.`;
    case 'flashcards':
      return `Create a flashcard deck from the project sources.${sources} ${base}
Use resource_list and resource_get to fetch content from the project, then use the flashcard_create tool to create a deck with at least 5-10 question-answer pairs. Use a descriptive title based on the content.`;
    default:
      return `Generate ${STUDIO_TYPE_TITLES[type] || type} from the project sources.${sources} ${base}
Return a JSON object with type "${type}". Return ONLY the JSON, no other text.`;
  }
}

/** Build user prompt for no-tools mode (context pre-injected) */
function buildGeneratePromptNoTools(
  type: StudioOutputType,
  projectId: string,
  context: string,
): string {
  const base = projectId ? `Project ID: ${projectId}` : '';
  const ctxBlock = context ? `\n\nSOURCE CONTENT:\n${context}\n` : '';

  const jsonSpecs: Record<string, string> = {
    mindmap: 'type "mindmap": nodes: [{ id, label }], edges: [{ id, source, target, label? }]',
    quiz: 'type "quiz": questions: [{ id, type: "multiple_choice"|"true_false", question, options?, correct, explanation }]',
    guide: 'type "guide": sections: [{ title, content }] (content in markdown)',
    faq: 'type "faq": pairs: [{ question, answer }]',
    timeline: 'type "timeline": events: [{ date, title, description }]',
    table: 'type "table": columns: [{ key, label }], rows: [object]',
  };
  const spec = jsonSpecs[type] || `type "${type}"`;

  return `Generate ${STUDIO_TYPE_TITLES[type] || type} from the source content below.${base}${ctxBlock}

Return a valid JSON object with ${spec}. Return ONLY the JSON object, no markdown, no explanation.`;
}

export function useStudioGenerate(options?: {
  projectId?: string | null;
  resourceId?: string | null;
  selectedSourceIds?: string[];
}) {
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(
    async (type: StudioOutputType): Promise<boolean> => {
      setIsGenerating(true);
      try {
        const projectId = options?.projectId ?? useAppStore.getState().currentProject?.id ?? undefined;
        const sourceIds = options?.selectedSourceIds ?? useAppStore.getState().selectedSourceIds;

        if (!projectId) {
          showToast('error', 'No project selected. Open a resource from a project first.');
          return false;
        }

        if (typeof window === 'undefined' || !window.electron) {
          showToast('error', 'Studio generation requires the desktop app.');
          return false;
        }

        const config = await getAIConfig();
        if (!config) {
          showToast('error', 'AI not configured. Go to Settings > AI to configure.');
          return false;
        }

        const needsApiKey = ['openai', 'anthropic', 'google'].includes(config.provider);
        if (needsApiKey && !config.apiKey) {
          showToast('error', 'API key not configured. Go to Settings > AI.');
          return false;
        }

        const title = `${STUDIO_TYPE_TITLES[type] || type} - ${new Date().toLocaleDateString()}`;
        const hasTools = providerSupportsTools(config.provider as AIProviderType);
        const isFlashcards = type === 'flashcards';
        const modelId = config.provider === 'ollama' ? (config.ollamaModel || config.model || '') : (config.model || '');
        const stableTools = isStableToolsModel(modelId);

        // Flashcards always need tools (flashcard_create). Other types: use no-tools fallback when model has unstable tools
        const useTools =
          hasTools &&
          (isFlashcards || stableTools) &&
          (isFlashcards || type === 'mindmap' || type === 'quiz' || type === 'guide' || type === 'faq' || type === 'timeline' || type === 'table');

        let userPrompt: string;
        let systemPrompt: string;
        let messages: Array<{ role: string; content: string }>;

        if (useTools) {
          userPrompt = buildGeneratePrompt(type, projectId, sourceIds);
          systemPrompt = `You are a study assistant. Generate structured study materials from the user's knowledge base.
When asked to generate, use the appropriate tools to fetch source content first, then return a valid JSON object.
The JSON must have a "type" field matching the requested type. Return ONLY the JSON object, no markdown formatting or explanation.`;
          messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ];
        } else {
          const context = await fetchContextForStudio(projectId, sourceIds);
          userPrompt = buildGeneratePromptNoTools(type, projectId, context);
          systemPrompt = `You are a study assistant. Generate structured study materials from the provided source content.
Return a valid JSON object with a "type" field matching the requested type. Return ONLY the JSON object, no markdown formatting or explanation.`;
          messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ];
        }

        const tools = useTools ? createAllMartinTools() : undefined;
        let response = '';

        if (useTools && tools && tools.length > 0) {
          const result = await chatWithTools(messages, tools, { maxIterations: 5 });
          response = result.response;
        } else {
          for await (const chunk of chatStream(messages)) {
            if (chunk.type === 'text' && chunk.text) {
              response += chunk.text;
            } else if (chunk.type === 'error') {
              throw new Error(chunk.error);
            }
          }
        }

        // Flashcards: tool creates deck + studio_output; broadcast adds to list
        if (isFlashcards) {
          showToast('success', 'Mazo creado. Abierto en Studio.');
          return true;
        }

        const parsed = extractStudioJson(response);
        if (!parsed) {
          let hint: string;
          if (!response?.trim()) {
            hint = 'La IA no devolvió ningún texto. Prueba con otro modelo o menos fuentes.';
          } else if (hasTools && !stableTools && config.provider === 'ollama') {
            hint = 'La IA no devolvió JSON válido. Con Ollama, prueba modelos como llama3.1, llama3.2 o qwen2.5 que soportan tools correctamente.';
          } else {
            hint = 'La IA no devolvió JSON válido. Prueba de nuevo o con un modelo que soporte tools (p. ej. llama3.1, qwen3).';
          }
          showToast('error', hint);
          if (process.env.NODE_ENV === 'development') {
            console.warn('[useStudioGenerate] Raw response:', response?.slice(0, 500));
          }
          return false;
        }

        // Ensure type field
        const content = { ...parsed, type: parsed.type || type };
        const contentStr = JSON.stringify(content);

        const createResult = await window.electron.db.studio.create({
          project_id: projectId,
          type,
          title,
          content: contentStr,
          source_ids: sourceIds?.length ? (Array.isArray(sourceIds) ? JSON.stringify(sourceIds) : sourceIds) : null,
          resource_id: options?.resourceId ?? undefined,
        });

        if (!createResult.success || !createResult.data) {
          showToast('error', createResult.error || 'Failed to save output.');
          return false;
        }

        const output = createResult.data as {
          id: string;
          project_id: string;
          type: string;
          title: string;
          content?: string;
          source_ids?: string;
          created_at: number;
          updated_at: number;
        };
        addStudioOutput(output as StudioOutput);
        setActiveStudioOutput(output as StudioOutput);
        showToast('success', `${STUDIO_TYPE_TITLES[type] || type} generated.`);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        showToast('error', msg);
        console.error('[useStudioGenerate]', err);
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [options?.projectId, options?.selectedSourceIds, addStudioOutput, setActiveStudioOutput],
  );

  return { generate, isGenerating };
}
