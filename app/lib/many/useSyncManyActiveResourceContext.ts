import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore, type TabType } from '@/lib/store/useTabStore';

const MANY_CONTEXT_TAB_TYPES = new Set<TabType>([
  'note',
  'notebook',
  'resource',
  'url',
  'youtube',
  'ppt',
  'docx',
  'artifact',
]);

/**
 * Keeps Many's active resource context in sync with the shell tab strip.
 * Notes and other resource tabs never went through WorkspaceLayout.setContext.
 */
export function useSyncManyActiveResourceContext(): void {
  const { activeTabId, tabs } = useTabStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, tabs: s.tabs })),
  );
  const setContext = useManyStore((s) => s.setContext);
  const clearContext = useManyStore((s) => s.clearContext);

  useEffect(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (
      activeTab?.resourceId &&
      MANY_CONTEXT_TAB_TYPES.has(activeTab.type)
    ) {
      setContext(activeTab.resourceId, activeTab.title ?? null);
    } else {
      clearContext();
    }
  }, [activeTabId, tabs, setContext, clearContext]);
}
