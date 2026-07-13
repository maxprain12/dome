import React from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Maximize02Icon, ZoomInAreaIcon, ZoomOutAreaIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

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

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        onClick={onZoomOut}
        disabled={isMinZoom}
        title={t('viewer.zoom_out')}
        aria-label={t('viewer.zoom_out')}
        size="icon"
      >
        <HugeiconsIcon icon={ZoomOutAreaIcon} />
      </Button>

      {showPercentage && (
        <span className="text-xs font-medium min-w-[3rem] text-center text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={onZoomIn}
        disabled={isMaxZoom}
        title={t('viewer.zoom_in')}
        aria-label={t('viewer.zoom_in')}
        size="icon"
      >
        <HugeiconsIcon icon={ZoomInAreaIcon} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={onReset}
        title={t('viewer.reset_zoom')}
        aria-label={t('viewer.reset_zoom')}
        size="icon"
      >
        <HugeiconsIcon icon={Maximize02Icon} />
      </Button>
    </div>
  );
}

export default React.memo(ZoomControlsComponent);
