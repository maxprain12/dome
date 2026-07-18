import { sha256 } from './io.mjs';

function stableRank(seed, caseId) {
  return sha256(`${seed}:${caseId}`);
}

export function createStratifiedSplit(cases, seed, heldOutRatio = 0.3) {
  if (!(heldOutRatio > 0 && heldOutRatio < 1)) throw new Error('heldOutRatio must be between 0 and 1');
  const groups = new Map();
  for (const item of cases) {
    if (!item.id) continue;
    const category = item.category || 'uncategorized';
    const group = groups.get(category) || [];
    group.push(item);
    groups.set(category, group);
  }

  const heldIn = [];
  const heldOut = [];
  for (const group of groups.values()) {
    group.sort((a, b) => stableRank(seed, a.id).localeCompare(stableRank(seed, b.id)));
    const count = group.length === 1
      ? 0
      : Math.max(1, Math.min(group.length - 1, Math.round(group.length * heldOutRatio)));
    const heldOutIds = new Set(group.slice(0, count).map((item) => item.id));
    for (const item of group) {
      (heldOutIds.has(item.id) ? heldOut : heldIn).push(item.id);
    }
  }
  heldIn.sort();
  heldOut.sort();
  return { heldIn, heldOut };
}
