type Listener = (text: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

export function setPendingSelection(text: string): void {
  const next = String(text || '').trim();
  if (!next) return;
  pending = next;
  for (const listener of listeners) listener(next);
}

export function consumePendingSelection(): string | null {
  const current = pending;
  pending = null;
  return current;
}

export function subscribePendingSelection(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}
