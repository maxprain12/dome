import { describe, expect, it } from 'vitest';
import {
  CONTEXTUAL_EVENT_TAGS,
  contextualEventPreview,
  isContextualEventTag,
} from './contextualEvents';

describe('contextualEvents', () => {
  it('lists the official tags', () => {
    expect(CONTEXTUAL_EVENT_TAGS).toContain('resource_opened');
    expect(CONTEXTUAL_EVENT_TAGS).toContain('resource_added');
    expect(CONTEXTUAL_EVENT_TAGS).toContain('note_updated');
    expect(CONTEXTUAL_EVENT_TAGS).toContain('social_comment_matched');
  });

  it('previews official vs custom tags', () => {
    expect(isContextualEventTag('resource_opened')).toBe(true);
    expect(contextualEventPreview('resource_opened').official).toBe(true);
    expect(contextualEventPreview('my_custom_tag').official).toBe(false);
  });
});
