import { PHASES, SCHEMA_VERSION } from './constants.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Self-Harness data: ${message}`);
}

export function validateManifest(manifest) {
  assert(manifest?.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  assert(typeof manifest.id === 'string' && manifest.id.length >= 3, 'id is required');
  assert(typeof manifest.provider === 'string' && manifest.provider, 'provider is required');
  assert(typeof manifest.model === 'string' && manifest.model, 'model is required');
  assert(typeof manifest.baseSha === 'string' && manifest.baseSha, 'baseSha is required');
  assert(Array.isArray(manifest.splits?.heldIn), 'held-in split is required');
  assert(Array.isArray(manifest.splits?.heldOut), 'held-out split is required');
  assert(manifest.splits.heldIn.length > 0, 'held-in split cannot be empty');
  assert(manifest.splits.heldOut.length > 0, 'held-out split cannot be empty');
  const overlap = manifest.splits.heldIn.filter((id) => manifest.splits.heldOut.includes(id));
  assert(overlap.length === 0, `splits overlap: ${overlap.join(', ')}`);
  return manifest;
}

export function validateState(state) {
  assert(PHASES.includes(state?.phase), `unknown phase ${state?.phase}`);
  assert(Number.isInteger(state.round) && state.round >= 0, 'round must be a non-negative integer');
  assert(Array.isArray(state.lineage), 'lineage must be an array');
  return state;
}

export function validateProposal(proposal) {
  assert(typeof proposal?.id === 'string' && proposal.id, 'proposal id is required');
  assert(typeof proposal.patch === 'string', 'proposal patch is required');
  assert(typeof proposal.targetMechanism === 'string' && proposal.targetMechanism, 'targetMechanism is required');
  assert(Array.isArray(proposal.expectedTests), 'expectedTests must be an array');
  return proposal;
}
