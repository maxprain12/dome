/**
 * GitHub Copilot Models Catalog
 * 
 * Models available through GitHub Copilot API.
 * Migrated from clawdbot/src/providers/github-copilot-models.ts
 */

import type { ModelDefinition } from '../models';
import type { ModelCost, ModelInputType } from '../types';

// =============================================================================
// Constants
// =============================================================================

export const COPILOT_BASE_URL = 'https://api.githubcopilot.com';
export const COPILOT_DEFAULT_MODEL_ID = 'gpt-4o';
export const COPILOT_DEFAULT_CONTEXT_WINDOW = 128_000;
export const COPILOT_DEFAULT_MAX_TOKENS = 8192;

/** Copilot models are included with GitHub subscription */
export const COPILOT_DEFAULT_COST: ModelCost = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// =============================================================================
// Default Models
// =============================================================================

/**
 * Default Copilot model IDs.
 * These vary by plan/org and can change. If a model isn't available,
 * Copilot will return an error.
 */
export const DEFAULT_COPILOT_MODEL_IDS = [
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o1',
  'o1-mini',
  'o3-mini',
] as const;

// =============================================================================
// Model Catalog Entry Type
// =============================================================================

interface CopilotCatalogEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: ModelInputType[];
  contextWindow: number;
  maxTokens: number;
  description?: string;
}

// =============================================================================
// Model Catalog
// =============================================================================

export const COPILOT_MODEL_CATALOG: readonly CopilotCatalogEntry[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
    description: 'Rápido y versátil',
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1 (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1047576,
    maxTokens: 32768,
    description: 'Contexto de 1M tokens',
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1047576,
    maxTokens: 32768,
    description: 'Contexto de 1M, económico',
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1047576,
    maxTokens: 16384,
    description: 'Ultra ligero',
  },
  {
    id: 'o1',
    name: 'o1 (Copilot)',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Razonamiento avanzado',
  },
  {
    id: 'o1-mini',
    name: 'o1-mini (Copilot)',
    reasoning: true,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 65536,
    description: 'Razonamiento económico',
  },
  {
    id: 'o3-mini',
    name: 'o3-mini (Copilot)',
    reasoning: true,
    input: ['text'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Siguiente gen razonamiento',
  },
  // Claude models (if available in Copilot)
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 8192,
    description: 'Alta calidad',
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4 (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 64000,
    description: 'Mejor balance',
  },
  // Gemini (if available in Copilot)
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Copilot)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 8192,
    description: 'Rápido',
  },
] as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get default Copilot model IDs
 */
export function getDefaultCopilotModelIds(): string[] {
  return [...DEFAULT_COPILOT_MODEL_IDS];
}

/**
 * Build a full ModelDefinition from a model ID
 */
export function buildCopilotModelDefinition(modelId: string): ModelDefinition {
  const id = modelId.trim();
  if (!id) throw new Error('Model id required');

  // Try to find in catalog first
  const catalogEntry = COPILOT_MODEL_CATALOG.find(m => m.id === id);
  
  if (catalogEntry) {
    return {
      id: catalogEntry.id,
      name: catalogEntry.name,
      reasoning: catalogEntry.reasoning,
      input: [...catalogEntry.input],
      cost: COPILOT_DEFAULT_COST,
      contextWindow: catalogEntry.contextWindow,
      maxTokens: catalogEntry.maxTokens,
      description: catalogEntry.description,
      api: 'openai-responses',
      compat: {
        supportsTools: true,
        supportsStreaming: true,
        supportsVision: catalogEntry.input.includes('image'),
      },
    };
  }

  // Create generic definition for unknown models
  const isReasoning = id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
  
  return {
    id,
    name: `${id} (Copilot)`,
    reasoning: isReasoning,
    input: ['text', 'image'],
    cost: COPILOT_DEFAULT_COST,
    contextWindow: COPILOT_DEFAULT_CONTEXT_WINDOW,
    maxTokens: COPILOT_DEFAULT_MAX_TOKENS,
    api: 'openai-responses',
    compat: {
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
    },
  };
}

/**
 * Get all Copilot models from the catalog
 */
export function getCopilotModels(): ModelDefinition[] {
  return COPILOT_MODEL_CATALOG.map(entry => buildCopilotModelDefinition(entry.id));
}

/**
 * Find a Copilot model by ID
 */
export function findCopilotModel(modelId: string): ModelDefinition | undefined {
  const entry = COPILOT_MODEL_CATALOG.find(m => m.id === modelId);
  return entry ? buildCopilotModelDefinition(entry.id) : undefined;
}

/**
 * Get the default Copilot model
 */
export function getDefaultCopilotModel(): ModelDefinition {
  return buildCopilotModelDefinition(COPILOT_DEFAULT_MODEL_ID);
}

/**
 * Get all reasoning-capable Copilot models
 */
export function getCopilotReasoningModels(): ModelDefinition[] {
  return COPILOT_MODEL_CATALOG
    .filter(m => m.reasoning)
    .map(entry => buildCopilotModelDefinition(entry.id));
}

/**
 * Get all vision-capable Copilot models
 */
export function getCopilotVisionModels(): ModelDefinition[] {
  return COPILOT_MODEL_CATALOG
    .filter(m => m.input.includes('image'))
    .map(entry => buildCopilotModelDefinition(entry.id));
}
