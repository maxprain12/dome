
import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  minZoom?: number;
  maxZoom?: number;
  showPercentage?: boolean;
}

function ZoomControlsComponent({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  minZoom = 0.25,
  maxZoom = 4,
  showPercentage = true,
}: ZoomControlsProps) {
  const isMinZoom = zoom <= minZoom;
  const isMaxZoom = zoom >= maxZoom;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onZoomOut}
        disabled={isMinZoom}
        className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color: 'var(--secondary-text)',
        }}
        onMouseEnter={(e) => {
          if (!isMinZoom) {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Zoom Out"
        aria-label="Zoom out"
      >
        <ZoomOut size={18} />
      </button>

      {showPercentage && (
        <span
          className="text-xs font-medium min-w-[3rem] text-center"
          style={{ color: 'var(--secondary-text)' }}
        >
          {Math.round(zoom * 100)}%
        </span>
      )}

      <button
        onClick={onZoomIn}
        disabled={isMaxZoom}
        className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color: 'var(--secondary-text)',
        }}
        onMouseEnter={(e) => {
          if (!isMaxZoom) {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Zoom In"
        aria-label="Zoom in"
      >
        <ZoomIn size={18} />
      </button>

      <button
        onClick={onReset}
        className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        style={{
          color: 'var(--secondary-text)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Reset Zoom"
        aria-label="Reset zoom"
      >
        <Maximize2 size={18} />
      </button>
    </div>
  );
}

export default React.memo(ZoomControlsComponent);
