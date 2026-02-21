'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

// Must match PptViewer's internal resolution
const SLIDE_W = 960;
const SLIDE_H = 540;

// Thumbnail display size (fits the 220px strip with padding)
const THUMB_W = 186;
const THUMB_H = Math.round(THUMB_W * (SLIDE_H / SLIDE_W)); // ≈ 105px

interface SlideThumbnailStripProps {
  slideCount: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Cloned HTMLElement[] from PptViewer, one per slide. Used for real previews. */
  thumbnailElements?: HTMLElement[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

// One thumbnail cell — appends the real slide element (scaled) or shows a placeholder
function ThumbnailCell({
  index,
  isActive,
  element,
}: {
  index: number;
  isActive: boolean;
  element?: HTMLElement;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !element) return;
    container.appendChild(element);
    return () => {
      if (container.contains(element)) container.removeChild(element);
    };
  }, [element]);

  const thumbScale = THUMB_W / SLIDE_W;

  if (element) {
    return (
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
          overflow: 'hidden',
          position: 'relative',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        {/* Mount point: scaled clone of the real slide */}
        <div
          ref={mountRef}
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${thumbScale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {/* Slide number badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 3,
            right: 4,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)',
            borderRadius: 3,
            padding: '1px 5px',
            zIndex: 2,
          }}
        >
          <span
            style={{
              color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
              fontSize: 9,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {index + 1}
          </span>
        </div>
      </div>
    );
  }

  // Placeholder: shown while thumbnails are being generated
  return (
    <div
      style={{
        width: THUMB_W,
        height: THUMB_H,
        background: '#1e1e2e',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Fake slide structure */}
      <div style={{ padding: '14% 12%' }}>
        <div
          style={{
            height: 5,
            width: '62%',
            borderRadius: 2,
            background: isActive ? 'rgba(123,118,208,0.65)' : 'rgba(255,255,255,0.18)',
            marginBottom: 7,
          }}
        />
        <div style={{ height: 3, width: '90%', borderRadius: 1, background: 'rgba(255,255,255,0.09)', marginBottom: 4 }} />
        <div style={{ height: 3, width: '76%', borderRadius: 1, background: 'rgba(255,255,255,0.09)', marginBottom: 4 }} />
        <div style={{ height: 3, width: '58%', borderRadius: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 3,
          right: 4,
          background: 'rgba(0,0,0,0.45)',
          borderRadius: 3,
          padding: '1px 5px',
        }}
      >
        <span
          style={{
            color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
            fontSize: 9,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1}
        </span>
      </div>
    </div>
  );
}

const MemoThumbnailCell = React.memo(ThumbnailCell);

function SlideThumbnailStripComponent({
  slideCount,
  activeIndex,
  onSelect,
  thumbnailElements,
  collapsed = false,
  onToggleCollapsed,
}: SlideThumbnailStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (index: number) => {
      if (index >= 0 && index < slideCount) onSelect(index);
    },
    [onSelect, slideCount]
  );

  // Keep active item visible in the strip
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || slideCount === 0) return;
    const item = el.querySelector(`[data-slide-index="${activeIndex}"]`);
    if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex, slideCount]);

  if (slideCount === 0) return null;

  return (
    <div
      style={{
        width: collapsed ? 44 : 218,
        minWidth: collapsed ? 44 : 218,
        background: '#0e0e18',
        borderRight: '1px solid #1c1c2c',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 180ms ease, min-width 180ms ease',
      }}
    >
      {/* Collapse toggle button */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          style={{
            position: 'absolute',
            right: -26,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            width: 26,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0e0e18',
            color: 'rgba(255,255,255,0.45)',
            border: '1px solid #1c1c2c',
            borderLeft: 'none',
            borderRadius: '0 6px 6px 0',
            cursor: 'pointer',
          }}
          aria-label={collapsed ? 'Expandir miniaturas' : 'Colapsar miniaturas'}
        >
          {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      )}

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        className="ppt-thumb-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: collapsed ? '8px 4px' : '10px 16px',
          scrollbarWidth: 'none',
        }}
      >
        {Array.from({ length: slideCount }, (_, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              data-slide-index={i}
              onClick={() => handleSelect(i)}
              style={{
                width: '100%',
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                marginBottom: 8,
                outline: 'none',
              }}
              aria-label={`Slide ${i + 1}`}
              aria-pressed={isActive}
            >
              {collapsed ? (
                /* Collapsed: just the number */
                <div
                  style={{
                    width: 32,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    background: isActive ? 'rgba(123,118,208,0.2)' : 'transparent',
                  }}
                >
                  <span
                    style={{
                      color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
              ) : (
                /* Expanded: thumbnail with active border */
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: isActive
                      ? '2px solid var(--accent)'
                      : '2px solid rgba(255,255,255,0.07)',
                    boxShadow: isActive
                      ? '0 0 0 1px rgba(123,118,208,0.2), 0 4px 16px rgba(0,0,0,0.45)'
                      : 'none',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  {/* Active indicator bar at top */}
                  <div
                    style={{
                      height: 3,
                      background: isActive ? 'var(--accent)' : 'transparent',
                      transition: 'background 150ms ease',
                      flexShrink: 0,
                    }}
                  />
                  <MemoThumbnailCell
                    index={i}
                    isActive={isActive}
                    element={thumbnailElements?.[i]}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(SlideThumbnailStripComponent);
