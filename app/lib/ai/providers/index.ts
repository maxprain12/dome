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
export type ProviderFactoryConfig = Record<string, never>;

/**
 * Create a provider instance by type.
 * 
 * Note: OpenAI, Anthropic, Google use the existing client.ts implementation.
 * This factory is for providers that need a separate implementation.
 */
export function createProvider(
  type: AIProviderType,
  _config?: ProviderFactoryConfig,
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
export function hasNativeProvider(_type: AIProviderType): boolean {
  return false;
}
