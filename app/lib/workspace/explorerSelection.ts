export function toggleIdInSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllIds(ids: string[]): Set<string> {
  return new Set(ids);
}

export function isExplorerMultiSelectEvent(
  event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
): boolean {
  return Boolean(event.metaKey || event.ctrlKey || event.shiftKey);
}

export function applyExplorerPointerSelect(opts: {
  id: string;
  orderedIds: string[];
  selectedIds: Set<string>;
  anchorId: string | null;
  additive: boolean;
  range: boolean;
}): { selectedIds: Set<string>; anchorId: string } {
  const { id, orderedIds, selectedIds, additive, range } = opts;
  const anchorId = opts.anchorId ?? id;

  if (range) {
    const from = orderedIds.indexOf(anchorId);
    const to = orderedIds.indexOf(id);
    if (from < 0 || to < 0) return { selectedIds: new Set([id]), anchorId: id };
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    return { selectedIds: new Set(orderedIds.slice(start, end + 1)), anchorId };
  }

  if (additive) {
    return { selectedIds: toggleIdInSet(selectedIds, id), anchorId: id };
  }

  return { selectedIds: new Set([id]), anchorId: id };
}

export function moveExplorerFocus(opts: {
  orderedIds: string[];
  currentId: string | null;
  delta: number;
}): string | null {
  if (opts.orderedIds.length === 0) return null;
  if (!opts.currentId) {
    return opts.delta >= 0 ? opts.orderedIds[0] : opts.orderedIds[opts.orderedIds.length - 1];
  }
  const index = opts.orderedIds.indexOf(opts.currentId);
  if (index < 0) return opts.orderedIds[0];
  const next = Math.min(opts.orderedIds.length - 1, Math.max(0, index + opts.delta));
  return opts.orderedIds[next] ?? null;
}
