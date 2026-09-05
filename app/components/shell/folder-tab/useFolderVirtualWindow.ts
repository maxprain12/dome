import { useEffect, useRef, useState } from 'react';
import type { FolderViewMode } from './folderTabViewHelpers';

const VIRTUALIZE_AFTER = 60;
const LIST_ROW_PX = 44;
const GRID_CARD_PX = 148;
const GRID_COL_PX = 180;
const OVERSCAN_ROWS = 4;

export function useFolderVirtualWindow(count: number, viewMode: FolderViewMode) {
  const hostRef = useRef<HTMLDivElement>(null);
  const enabled = count > VIRTUALIZE_AFTER;
  const [range, setRange] = useState({ start: 0, end: count });

  useEffect(() => {
    if (!enabled) {
      setRange({ start: 0, end: count });
      return;
    }
    const scroller = hostRef.current?.closest('.dome-folder-view__list');
    if (!(scroller instanceof HTMLElement)) {
      setRange({ start: 0, end: count });
      return;
    }

    const update = () => {
      const itemSize = viewMode === 'list' ? LIST_ROW_PX : GRID_CARD_PX;
      const cols =
        viewMode === 'grid' ? Math.max(1, Math.floor(scroller.clientWidth / GRID_COL_PX)) : 1;
      const startRow = Math.max(0, Math.floor(scroller.scrollTop / itemSize) - OVERSCAN_ROWS);
      const visibleRows = Math.ceil(scroller.clientHeight / itemSize) + OVERSCAN_ROWS * 2;
      const start = startRow * cols;
      const end = Math.min(count, start + visibleRows * cols);
      setRange({ start, end });
    };

    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [count, enabled, viewMode]);

  return { hostRef, start: range.start, end: range.end, enabled };
}
