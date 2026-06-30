/**
 * Decides where the Many context-usage indicator (the "23%" donut) is mounted.
 *
 * Bug it fixes
 * ------------
 * The indicator was rendered in BOTH the header and the composer in docked
 * (sidebar) mode, so the user saw two identical "23%" donuts. The header copy was
 * correctly gated `!isFullscreen && showContextUsage`, but the composer slot was
 * gated only on `showContextUsage` (no `isFullscreen` guard) and handed to the
 * composer in both render branches → duplicate when docked.
 *
 * Contract: the indicator lives in the HEADER when docked (sidebar) and in the
 * COMPOSER when fullscreen — exactly one surface, never both, never neither-when-
 * eligible. Invariant: `!(header && composer)`.
 *
 * Pure (no React) so it is unit-testable under the repo's `tsx --test` runner.
 */
export interface ContextSlotInput {
  isFullscreen: boolean;
  showContextUsage: boolean;
}

export interface ContextSlotPlacement {
  /** Render the indicator in the header action row. */
  header: boolean;
  /** Render the indicator in the composer. */
  composer: boolean;
}

export function manyContextSlotPlacement(input: ContextSlotInput): ContextSlotPlacement {
  const { isFullscreen, showContextUsage } = input;
  return {
    header: showContextUsage && !isFullscreen,
    composer: showContextUsage && isFullscreen,
  };
}
