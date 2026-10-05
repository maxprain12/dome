import type { Grants } from '@/lib/manys/api';

/** The computer is on when the Many may both look at it and ask to act on it. */
export const computerEnabled = (grants: Grants): boolean =>
  grants.capabilities.includes('computer.read') && grants.capabilities.includes('computer.write');

/** Turning it on gives the whole machine (browser, files, terminal): the person decides on or off, not which part. */
export function withComputerOn(grants: Grants, on: boolean): Grants {
  const rest = grants.capabilities.filter((capability) => capability !== 'computer.read' && capability !== 'computer.write');
  return {
    ...grants,
    capabilities: on ? [...rest, 'computer.read', 'computer.write'] : rest,
    ...(on ? { computer: { browser: true, files: true, shell: true } } : {}),
  };
}

export const withPaused = (grants: Grants, paused: boolean): Grants => ({ ...grants, paused });

/** Sending, publishing, buying and deleting always pass through a proposal the person reviews, so they are one switch. */
export const OUTSIDE_CAPABILITIES = ['external.send', 'external.publish', 'external.purchase', 'external.delete'] as const;

export const hasCapability = (grants: Grants, capability: string): boolean => grants.capabilities.includes(capability);

/** The outside switch reads as on if any of its four is granted, so an older, partial setting is not hidden. */
export const outsideEnabled = (grants: Grants): boolean => OUTSIDE_CAPABILITIES.some((capability) => hasCapability(grants, capability));

export function withCapabilities(grants: Grants, capabilities: readonly string[], on: boolean): Grants {
  const rest = grants.capabilities.filter((capability) => !capabilities.includes(capability));
  return { ...grants, capabilities: on ? [...rest, ...capabilities] : rest };
}
