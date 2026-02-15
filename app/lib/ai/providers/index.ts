/**
 * AI Providers Index
 * 
 * Re-exports all provider implementations.
 */

// =============================================================================
// Provider Factory
// =============================================================================

import type { AIProviderInterface } from '../types';
import type { AIProviderType } from '../models';

/**
 * Configuration for creating providers
 */
export interface ProviderFactoryConfig {
  // Add provider configs as they are implemented
}

/**
 * Create a provider instance by type.
 * 
 * Note: OpenAI, Anthropic, Google use the existing client.ts implementation.
 * This factory is for providers that need a separate implementation.
 */
export function createProvider(
  type: AIProviderType,
  config?: ProviderFactoryConfig,
): AIProviderInterface | null {
  switch (type) {
    // TODO: Add providers that need native implementation
    default:
      return null;
  }
}

/**
 * Check if a provider type has a native implementation.
 */
export function hasNativeProvider(type: AIProviderType): boolean {
  return false;
}
