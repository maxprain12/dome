import { dispatchDomeEvent } from '@/lib/events/domeEvents';

export const CONTEXTUAL_EVENT_TAGS = [
  'resource_opened',
  'resource_added',
  'note_updated',
  'social_comment_matched',
] as const;

export type ContextualEventTag = (typeof CONTEXTUAL_EVENT_TAGS)[number];

export function isContextualEventTag(value: string): value is ContextualEventTag {
  return (CONTEXTUAL_EVENT_TAGS as readonly string[]).includes(value);
}

export function contextualEventPreview(tag: string): { tag: string; official: boolean } {
  return { tag, official: isContextualEventTag(tag) };
}

export async function notifyContextualEvent(
  tag: ContextualEventTag,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    const result = await globalThis.window?.electron?.invoke?.('automations:notifyContext', {
      tag,
      ...extra,
    });
    const fired = result && typeof result === 'object' && 'data' in result
      ? Number((result as { data?: { fired?: number } }).data?.fired ?? 0)
      : 0;
    dispatchDomeEvent('dome:contextual-fired', { tag, fired });
  } catch {
    /* non-Electron or older build */
  }
}
