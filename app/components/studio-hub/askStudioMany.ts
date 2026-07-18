import { useManyStore } from '@/lib/store/useManyStore';

export type StudioManyPin = {
  id: string;
  title: string;
  type: string;
  kind?: 'person' | 'resource' | 'issue' | 'email' | 'social_post';
  meta?: Record<string, unknown>;
};

/** Open Many with an optional pinned entity and a one-shot prompt. */
export function askStudioMany(prompt: string, pin?: StudioManyPin | null): void {
  const many = useManyStore.getState();
  if (pin) {
    many.addPinnedResource({
      id: pin.id,
      title: pin.title,
      type: pin.type,
      kind: pin.kind ?? 'resource',
      meta: pin.meta ?? null,
    });
  }
  many.setPendingManyHandoff(prompt);
  many.setOpen(true);
}
