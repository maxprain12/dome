import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_TAB_ID, useTabStore } from './useTabStore';

describe('useTabStore', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [{ id: HOME_TAB_ID, type: 'home', title: 'Home', pinned: true }], activeTabId: HOME_TAB_ID });
  });

  it('keeps Home while opening, activating and closing transient work', () => {
    useTabStore.getState().openTab({ id: 'note:1', type: 'note', title: 'Nota', resourceId: '1', projectId: 'project-a' });
    expect(useTabStore.getState().activeTabId).toBe('note:1');
    useTabStore.getState().closeTab('note:1');
    expect(useTabStore.getState().tabs.map((tab) => tab.id)).toEqual([HOME_TAB_ID]);
    expect(useTabStore.getState().activeTabId).toBe(HOME_TAB_ID);
  });
});
