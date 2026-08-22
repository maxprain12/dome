/** In-folder search effects/handlers for FolderTabView (extracted for Sonar S3776). */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { lazyRef } from '@/lib/utils/lazyRef';
import type { FolderListEntry } from './folderTabViewHelpers';

export function useFolderTabSearchController(opts: {
  searchOpen: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setSearchOpen: (open: boolean) => void;
  searchFocusIndex: number;
  setSearchFocusIndex: (updater: number | ((i: number) => number)) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  filteredListItems: FolderListEntry[];
  normalizedSearchQuery: string;
  isFiltering: boolean;
  openListItem: (entry: FolderListEntry) => void;
}) {
  const {
    searchOpen,
    setSearchQuery,
    setSearchOpen,
    searchFocusIndex,
    setSearchFocusIndex,
    searchInputRef,
    filteredListItems,
    normalizedSearchQuery,
    isFiltering,
    openListItem,
  } = opts;

  const rowRefs = useRef<Map<string, HTMLDivElement> | null>(null);
  const rowRefMap = lazyRef(rowRefs, () => new Map());

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchFocusIndex(0);
  }, [setSearchOpen, setSearchQuery, setSearchFocusIndex]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [setSearchOpen, searchInputRef]);

  useEffect(() => {
    setSearchFocusIndex(0);
  }, [normalizedSearchQuery, setSearchFocusIndex]);

  useEffect(() => {
    if (!isFiltering || filteredListItems.length === 0) return;
    const focused =
      filteredListItems[Math.min(searchFocusIndex, filteredListItems.length - 1)];
    if (!focused) return;
    rowRefMap.get(focused.item.id)?.scrollIntoView({ block: 'nearest' });
  }, [searchFocusIndex, filteredListItems, isFiltering, rowRefMap]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (searchOpen) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          openSearch();
        }
      }
    };
    globalThis.window.addEventListener('keydown', onKeyDown);
    return () => globalThis.window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, openSearch, searchInputRef]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (filteredListItems.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchFocusIndex((i) => Math.min(i + 1, filteredListItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchFocusIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredListItems[searchFocusIndex] ?? filteredListItems[0];
        if (target) openListItem(target);
      }
    },
    [closeSearch, filteredListItems, openListItem, searchFocusIndex, setSearchFocusIndex],
  );

  const setRowRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefMap.set(id, el as unknown as HTMLDivElement);
      else rowRefMap.delete(id);
    },
    [rowRefMap],
  );

  return {
    rowRefMap,
    setRowRef,
    closeSearch,
    openSearch,
    handleSearchKeyDown,
  };
}
