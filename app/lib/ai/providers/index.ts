/**
 * AI Providers Index
 * 
 * Re-exports all provider implementations.
 */

// Synthetic Provider
export {
  SyntheticProvider,
  createSyntheticProvider,
  type SyntheticProviderConfig,
} from './synthetic';

// =============================================================================
// Provider Factory
// =============================================================================

import type { AIProviderInterface } from '../types';
import type { AIProviderType } from '../models';
import { SyntheticProvider, type SyntheticProviderConfig } from './synthetic';

/**
 * Configuration for creating providers
 */
export interface ProviderFactoryConfig {
  synthetic?: SyntheticProviderConfig;
  // Add more provider configs as they are implemented
}

/**
 * Create a provider instance by type.
 * 
 * Note: This currently only supports Synthetic provider.
 * Other providers (OpenAI, Anthropic, Google) use the existing
 * client.ts implementation which will be refactored later.
 */
export function createProvider(
  type: AIProviderType,
  config?: ProviderFactoryConfig,
): AIProviderInterface | null {
  switch (type) {
    case 'synthetic':
      return new SyntheticProvider(config?.synthetic);
    // TODO: Add other providers
    default:
      return null;
  }
}

/**
 * Check if a provider type has a native implementation.
 */
export function hasNativeProvider(type: AIProviderType): boolean {
  return type === 'synthetic';
}
