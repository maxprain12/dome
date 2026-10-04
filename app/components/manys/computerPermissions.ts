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
