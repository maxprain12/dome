import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeButton from '@/components/ui/DomeButton';

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
  const { t } = useTranslation();
  const isMinZoom = zoom <= minZoom;
  const isMaxZoom = zoom >= maxZoom;

  const iconBtn =
    'min-w-[44px] min-h-[44px] !text-[var(--secondary-text)] hover:bg-[var(--bg-tertiary)]';

  return (
    <div className="flex items-center gap-1">
      <DomeButton
        type="button"
        variant="ghost"
        size="md"
        iconOnly
        onClick={onZoomOut}
        disabled={isMinZoom}
        title={t('viewer.zoom_out')}
        aria-label={t('viewer.zoom_out')}
        className={iconBtn}
      >
        <ZoomOut size={18} />
      </DomeButton>

      {showPercentage && (
        <span className="text-xs font-medium min-w-[3rem] text-center text-[var(--secondary-text)]">
          {Math.round(zoom * 100)}%
        </span>
      )}

      <DomeButton
        type="button"
        variant="ghost"
        size="md"
        iconOnly
        onClick={onZoomIn}
        disabled={isMaxZoom}
        title={t('viewer.zoom_in')}
        aria-label={t('viewer.zoom_in')}
        className={iconBtn}
      >
        <ZoomIn size={18} />
      </DomeButton>

      <DomeButton
        type="button"
        variant="ghost"
        size="md"
        iconOnly
        onClick={onReset}
        title={t('viewer.reset_zoom')}
        aria-label={t('viewer.reset_zoom')}
        className={iconBtn}
      >
        <Maximize2 size={18} />
      </DomeButton>
    </div>
  );
}

export default React.memo(ZoomControlsComponent);
