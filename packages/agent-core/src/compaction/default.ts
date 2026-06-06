/**
 * @dome/agent-core — default compaction factory.
 *
 * Combines the trimming engine with sane defaults so the runtime
 * loop can just call `createDefaultCompaction()` and get a working
 * `CompactionEngine` without thinking about thresholds.
 *
 * Defaults:
 *   - `thresholdTokens`: 100_000  (≈400 KB of text; matches the
 *     legacy `DEFAULT_TOKEN_BUDGET` order of magnitude).
 *   - `maxRetainedTurns`: 10      (keeps the last 10 user→assistant
 *     exchanges plus their tool results).
 *   - `preserveVision`: true      (always keep the latest image
 *     payload so a model can still answer visual follow-ups).
 */

import type { CompactionEngine, CompactionSettings } from '../types.js';
import { createTrimmingEngine } from './trim.js';

export function createDefaultCompaction(
  overrides?: Partial<CompactionSettings>,
): CompactionEngine {
  const settings: CompactionSettings = {
    thresholdTokens: overrides?.thresholdTokens ?? 100_000,
    maxRetainedTurns: overrides?.maxRetainedTurns ?? 10,
    preserveVision: overrides?.preserveVision ?? true,
  };
  return createTrimmingEngine(settings);
}
