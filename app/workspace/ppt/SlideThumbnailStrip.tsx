'use client';

import React, { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import './slide-thumbnail-strip.css';

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
  /** Cloned HTMLElement[] from PptViewer (legacy pptx-preview). */
  thumbnailElements?: HTMLElement[];
  /** Data URLs for each slide (from Python image extraction). */
  thumbnailImageUrls?: string[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

// One thumbnail cell — shows image URL or mounted element, or placeholder
function ThumbnailCell({
  index,
  isActive,
  element,
  imageUrl,
}: {
  index: number;
  isActive: boolean;
  element?: HTMLElement;
  imageUrl?: string;
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

  // Image-based thumbnail (from Python extraction)
  if (imageUrl) {
    return (
      <div className="ppt-thumb-cell">
        <img
          src={imageUrl}
          alt={`Slide ${index + 1}`}
          className="ppt-thumb-img"
        />
        <div className="ppt-thumb-badge">
          <span className={`ppt-thumb-badge-num${isActive ? ' is-active' : ''}`}>
            {index + 1}
          </span>
        </div>
      </div>
    );
  }

  if (element) {
    return (
      <div className="ppt-thumb-cell">
        {/* Mount point: scaled clone of the real slide */}
        <div
          ref={mountRef}
          className="ppt-thumb-mount"
          style={{ transform: `scale(${thumbScale})` } as CSSProperties}
        />
        {/* Slide number badge */}
        <div className="ppt-thumb-badge">
          <span className={`ppt-thumb-badge-num${isActive ? ' is-active' : ''}`}>
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
        background: 'var(--bg-secondary)',
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
            fontSize: 12,
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
  thumbnailImageUrls,
  collapsed = false,
  onToggleCollapsed,
}: SlideThumbnailStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (index: number) => {
      if (index >= 0 && index < slideCount) {
        onSelect(index);
        const el = scrollRef.current;
        if (el) {
          const item = el.querySelector(`[data-slide-index="${index}"]`);
          if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    },
    [onSelect, slideCount],
  );

  const scrollActiveThumbRef = useCallback((node: HTMLButtonElement | null) => {
    if (node) {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex]);

  if (slideCount === 0) return null;

  return (
    <div
      className={`ppt-thumb-strip${collapsed ? ' is-collapsed' : ' is-expanded'}`}
    >
      {/* Collapse toggle button */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ppt-thumb-collapse-btn"
          aria-label={collapsed ? 'Expandir miniaturas' : 'Colapsar miniaturas'}
        >
          {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      )}

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        className={`ppt-thumb-scroll${collapsed ? ' is-collapsed' : ' is-expanded'}`}
      >
        {Array.from({ length: slideCount }, (_, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              data-slide-index={i}
              ref={isActive ? scrollActiveThumbRef : undefined}
              onClick={() => handleSelect(i)}
              className={`ppt-thumb-select-btn focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1${collapsed ? ' is-collapsed' : ' is-expanded'}`}
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
                      fontSize: 12,
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
                    imageUrl={thumbnailImageUrls?.[i]}
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
