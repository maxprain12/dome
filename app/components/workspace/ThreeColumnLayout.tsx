import { useEffect, useCallback, type ReactNode } from 'react';
import { useResizeStore } from '@/lib/store/useResizeStore';
import ResizeHandle from './ResizeHandle';

interface ThreeColumnLayoutProps {
  leftSidebar: ReactNode;
  content: ReactNode;
  rightSidebar: ReactNode;
  showRightSidebar?: boolean;
}

export default function ThreeColumnLayout({
  leftSidebar,
  content,
  rightSidebar,
  showRightSidebar = true,
}: ThreeColumnLayoutProps) {
  const {
    leftSidebarWidth,
    leftSidebarCollapsed,
    rightSidebarWidth,
    rightSidebarCollapsed,
    setLeftSidebarWidth,
    toggleLeftSidebar,
    setRightSidebarWidth,
    toggleRightSidebar,
  } = useResizeStore();

  const handleLeftResize = useCallback(
    (delta: number) => {
      setLeftSidebarWidth(leftSidebarWidth + delta);
    },
    [leftSidebarWidth, setLeftSidebarWidth]
  );

  const handleRightResize = useCallback(
    (delta: number) => {
      setRightSidebarWidth(rightSidebarWidth - delta);
    },
    [rightSidebarWidth, setRightSidebarWidth]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      
      if (isMeta && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        toggleLeftSidebar();
      }
      
      if (isMeta && e.key === 'b' && e.shiftKey) {
        e.preventDefault();
        if (showRightSidebar) toggleRightSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleLeftSidebar, toggleRightSidebar, showRightSidebar]);

  const effectiveLeftWidth = leftSidebarCollapsed ? 0 : leftSidebarWidth;
  const effectiveRightWidth = rightSidebarCollapsed || !showRightSidebar ? 0 : rightSidebarWidth;

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ background: 'var(--dome-bg)' }}
    >
      {leftSidebarCollapsed ? null : (
        <>
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{
              width: effectiveLeftWidth,
              minWidth: effectiveLeftWidth,
              transition: 'width 200ms ease, min-width 200ms ease',
            }}
          >
            {leftSidebar}
          </div>
          <ResizeHandle onResize={handleLeftResize} direction="horizontal" />
        </>
      )}

      <div className="flex-1 overflow-hidden">
        {content}
      </div>

      {showRightSidebar && (
        <>
          <ResizeHandle onResize={handleRightResize} direction="horizontal" />
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{
              width: effectiveRightWidth,
              minWidth: effectiveRightWidth,
              transition: 'width 200ms ease, min-width 200ms ease',
            }}
          >
            {rightSidebar}
          </div>
        </>
      )}
    </div>
  );
}
