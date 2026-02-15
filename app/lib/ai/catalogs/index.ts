/**
 * AI Model Catalogs Index
 * 
 * Re-exports all model catalogs for easy access.
 */

// GitHub Copilot Models
export {
  COPILOT_BASE_URL,
  COPILOT_DEFAULT_MODEL_ID,
  COPILOT_DEFAULT_CONTEXT_WINDOW,
  COPILOT_DEFAULT_MAX_TOKENS,
  COPILOT_DEFAULT_COST,
  DEFAULT_COPILOT_MODEL_IDS,
  COPILOT_MODEL_CATALOG,
  getDefaultCopilotModelIds,
  buildCopilotModelDefinition,
  getCopilotModels,
  findCopilotModel,
  getDefaultCopilotModel,
  getCopilotReasoningModels,
  getCopilotVisionModels,
} from './copilot';

// =============================================================================
// Aggregate Functions
// =============================================================================

import type { ModelDefinition } from '../models';
import { getCopilotModels } from './copilot';

/**
 * Get all models from all catalogs
 */
export function getAllCatalogModels(): ModelDefinition[] {
  return [...getCopilotModels()];
}

/**
 * Get all free models (Copilot)
 */
export function getAllFreeModels(): ModelDefinition[] {
  return [...getCopilotModels()];
}

/**
 * Get all privacy-focused models (empty - Venice removed)
 */
export function getAllPrivacyModels(): ModelDefinition[] {
  return [];
}

/**
 * Find a model by ID across all catalogs
 */
export function findCatalogModel(modelId: string): ModelDefinition | undefined {
  return getCopilotModels().find(m => m.id === modelId);
}
