import { describe, expect, it } from 'vitest';
import { isProjectScopedTab, isTabStripVisible } from './useTabStore';

describe('tab navigation contract', () => {
  it('separates permanent destinations from closeable work', () => {
    expect(isTabStripVisible({ type: 'settings' })).toBe(false);
    expect(isTabStripVisible({ type: 'note' })).toBe(true);
    expect(isProjectScopedTab({ id: 'n', type: 'note', title: 'Nota', projectId: 'p' })).toBe(true);
  });
});
