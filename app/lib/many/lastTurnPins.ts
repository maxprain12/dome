import type { PinnedResource } from '@/lib/store/useManyStore';

const MAX_HYDRATION_PINS = 4;

function isEmailPin(pin: PinnedResource): boolean {
  return pin.kind === 'email' || pin.type === 'email';
}

/** At most one email (the last in the snapshot) plus non-email pins, capped at 4. */
function collapseStickySnapshot(pins: PinnedResource[]): PinnedResource[] {
  let lastEmail: PinnedResource | undefined;
  const rest: PinnedResource[] = [];
  for (const pin of pins) {
    if (isEmailPin(pin)) {
      lastEmail = pin;
    } else {
      rest.push(pin);
    }
  }
  if (lastEmail) {
    return [...rest.slice(0, MAX_HYDRATION_PINS - 1), lastEmail];
  }
  return rest.slice(0, MAX_HYDRATION_PINS);
}

/**
 * Composer chips win. When the composer is empty, reuse the latest user-turn
 * pins for hydration only (sticky context — not leftover chips).
 */
export function resolvePinsForHydration(
  composerPins: PinnedResource[],
  recentMessages: Array<{ role?: string; pinnedResources?: PinnedResource[] | null }>,
): PinnedResource[] {
  if (composerPins.length > 0) {
    return composerPins;
  }

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const message = recentMessages[i];
    const pins = message?.pinnedResources;
    if (message?.role !== 'user' || !pins?.length) continue;
    return collapseStickySnapshot(pins);
  }

  return [];
}
