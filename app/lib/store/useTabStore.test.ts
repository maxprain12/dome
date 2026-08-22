import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_TAB_ID,
  ensureHomeTab,
  filterTabsForActiveProject,
  resolveStoredActiveTabId,
  tabsFromParsedPayload,
  useTabStore,
  type DomeTab,
} from './useTabStore';

const HOME: DomeTab = { id: HOME_TAB_ID, type: 'home', title: 'Home', pinned: true };

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

describe('loadStoredTabs helpers (S3776)', () => {
  const foreignNote: DomeTab = {
    id: 'note:x',
    type: 'note',
    title: 'X',
    resourceId: 'x',
    projectId: 'project-b',
  };
  const settings: DomeTab = { id: 'settings', type: 'settings', title: 'Settings' };

  it('filterTabsForActiveProject drops foreign project-scoped tabs only', () => {
    const tabs = [HOME, foreignNote, settings];
    expect(filterTabsForActiveProject(tabs).map((t) => t.id)).toEqual([
      HOME_TAB_ID,
      'note:x',
      'settings',
    ]);
    expect(filterTabsForActiveProject(tabs, 'project-a').map((t) => t.id)).toEqual([
      HOME_TAB_ID,
      'settings',
    ]);
    expect(filterTabsForActiveProject(tabs, 'project-b').map((t) => t.id)).toEqual([
      HOME_TAB_ID,
      'note:x',
      'settings',
    ]);
  });

  it('ensureHomeTab prepends Home when missing', () => {
    expect(ensureHomeTab([settings]).map((t) => t.id)).toEqual([HOME_TAB_ID, 'settings']);
    expect(ensureHomeTab([HOME, settings])).toEqual([HOME, settings]);
  });

  it('resolveStoredActiveTabId falls back to Home when missing', () => {
    const tabs = [HOME, settings];
    expect(resolveStoredActiveTabId(tabs, 'settings')).toBe('settings');
    expect(resolveStoredActiveTabId(tabs, 'gone')).toBe(HOME_TAB_ID);
    expect(resolveStoredActiveTabId(tabs, null)).toBe(HOME_TAB_ID);
  });

  it('tabsFromParsedPayload restores empty and filtered payloads safely', () => {
    expect(tabsFromParsedPayload({ tabs: [] })).toEqual({
      tabs: [HOME],
      activeTabId: HOME_TAB_ID,
    });
    const restored = tabsFromParsedPayload(
      { tabs: [foreignNote, settings], activeTabId: 'note:x' },
      'project-a',
    );
    expect(restored.tabs.map((t) => t.id)).toEqual([HOME_TAB_ID, 'settings']);
    expect(restored.activeTabId).toBe(HOME_TAB_ID);
  });
});
