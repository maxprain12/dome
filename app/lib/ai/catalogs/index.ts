/**
 * AI Model Catalogs Index
 * 
 * Re-exports all model catalogs for easy access.
 */

// Synthetic Models (Free)
export {
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_ID,
  SYNTHETIC_DEFAULT_MODEL_REF,
  SYNTHETIC_DEFAULT_COST,
  SYNTHETIC_MODEL_CATALOG,
  buildSyntheticModelDefinition,
  getSyntheticModels,
  findSyntheticModel,
  getDefaultSyntheticModel,
  getSyntheticReasoningModels,
  getSyntheticVisionModels,
} from './synthetic';

// Venice Models (Privacy-focused)
export {
  VENICE_BASE_URL,
  VENICE_DEFAULT_MODEL_ID,
  VENICE_DEFAULT_MODEL_REF,
  VENICE_DEFAULT_COST,
  VENICE_MODEL_CATALOG,
  buildVeniceModelDefinition,
  getVeniceModels,
  findVeniceModel,
  getDefaultVeniceModel,
  getVenicePrivateModels,
  getVeniceAnonymizedModels,
  getVeniceReasoningModels,
  getVeniceVisionModels,
  discoverVeniceModels,
} from './venice';
export type { VenicePrivacyMode } from './venice';

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
import { getSyntheticModels } from './synthetic';
import { getVeniceModels } from './venice';
import { getCopilotModels } from './copilot';

/**
 * Get all models from all catalogs
 */
export function getAllCatalogModels(): ModelDefinition[] {
  return [
    ...getSyntheticModels(),
    ...getVeniceModels(),
    ...getCopilotModels(),
  ];
}

/**
 * Get all free models (Synthetic and Copilot)
 */
export function getAllFreeModels(): ModelDefinition[] {
  return [
    ...getSyntheticModels(),
    ...getCopilotModels(),
  ];
}

/**
 * Get all privacy-focused models (Venice)
 */
export function getAllPrivacyModels(): ModelDefinition[] {
  return getVeniceModels();
}

/**
 * Find a model by ID across all catalogs
 */
export function findCatalogModel(modelId: string): ModelDefinition | undefined {
  const synthetic = getSyntheticModels().find(m => m.id === modelId);
  if (synthetic) return synthetic;
  
  const venice = getVeniceModels().find(m => m.id === modelId);
  if (venice) return venice;
  
  const copilot = getCopilotModels().find(m => m.id === modelId);
  if (copilot) return copilot;
  
  return undefined;
}
