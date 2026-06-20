import { useCallback, useLayoutEffect, useReducer } from 'react';
import {
  canGoBackFolder,
  canGoForwardFolder,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  initFolderHistory,
  pushFolderLocation,
  type FolderLocation,
} from '@/lib/folder/folderNavigationHistory';

export function useFolderNavigationHistory(
  tabId: string,
  location: FolderLocation,
  navigateFolderTab: (fromTabId: string, loc: FolderLocation) => void,
) {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    initFolderHistory(tabId, location);
  }, [tabId, location]);

  const navigate = useCallback(
    (loc: FolderLocation) => {
      if (!pushFolderLocation(tabId, loc)) return;
      navigateFolderTab(tabId, loc);
      bump();
    },
    [tabId, navigateFolderTab],
  );

  const goBack = useCallback(() => {
    const loc = goBackInFolderHistory(tabId);
    if (!loc) return;
    navigateFolderTab(tabId, loc);
    bump();
  }, [tabId, navigateFolderTab]);

  const goForward = useCallback(() => {
    const loc = goForwardInFolderHistory(tabId);
    if (!loc) return;
    navigateFolderTab(tabId, loc);
    bump();
  }, [tabId, navigateFolderTab]);

  return {
    canGoBack: canGoBackFolder(tabId),
    canGoForward: canGoForwardFolder(tabId),
    navigate,
    goBack,
    goForward,
  };
}
