import type { ComputerPermissions, Grants } from '@/lib/manys/api';

export type ComputerKind = keyof ComputerPermissions;
export const COMPUTER_KINDS: readonly ComputerKind[] = ['browser', 'files', 'shell'];

/** The computer is on when the Many may both look at it and ask to act on it. */
export const computerEnabled = (grants: Grants): boolean =>
  grants.capabilities.includes('computer.read') && grants.capabilities.includes('computer.write');

/** What the owner allows. Nothing set means everything the capabilities allow, as before. */
export function computerAllows(grants: Grants, kind: ComputerKind): boolean {
  return computerEnabled(grants) && (grants.computer?.[kind] ?? true);
}

export function withComputerEnabled(grants: Grants, enabled: boolean): Grants {
  const rest = grants.capabilities.filter((capability) => capability !== 'computer.read' && capability !== 'computer.write');
  return { ...grants, capabilities: enabled ? [...rest, 'computer.read', 'computer.write'] : rest };
}

export function withComputerKind(grants: Grants, kind: ComputerKind, allowed: boolean): Grants {
  return { ...grants, computer: { browser: true, files: true, shell: true, ...grants.computer, [kind]: allowed } };
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
