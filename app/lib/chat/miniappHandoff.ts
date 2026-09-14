import { useManyStore } from '@/lib/store/useManyStore';

/** Open a reviewable draft in Many; never silently submit or create an empty resource. */
export function openMiniappDraft(prompt: string, resource?: { id: string; title: string }) {
  const many = useManyStore.getState();
  if (resource) many.addPinnedResource({ id: resource.id, title: resource.title, type: 'artifact', kind: 'resource' });
  many.setPendingManyHandoff(prompt);
  many.setOpen(true);
}
