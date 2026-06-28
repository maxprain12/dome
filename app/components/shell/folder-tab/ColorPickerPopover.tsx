/** Color swatch popover for folder cards (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FOLDER_TAB_SWATCHES } from '@/lib/ui/palettes';

const SWATCHES = FOLDER_TAB_SWATCHES;

export default function ColorPickerPopover({
  pos, currentColor, onSave, onClose,
}: {
  pos: { top: number; left: number };
  currentColor: string;
  onSave: (color: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  const popoverWidth = 196;
  const clampedLeft = Math.min(Math.max(8, pos.left), window.innerWidth - popoverWidth - 8);
  const clampedTop = Math.min(Math.max(8, pos.top), window.innerHeight - 100);

  return (
    <fieldset
      ref={ref}
      aria-label={t('folder.changeColor', 'Cambiar color')}
      className="fixed z-[var(--z-popover)] rounded-xl shadow-lg p-2.5 border-0 m-0 min-w-0"
      style={{ top: clampedTop, left: clampedLeft, background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      <div role="presentation" onMouseDown={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-6 gap-1.5">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            onClick={() => { onSave(color); onClose(); }}
            className="size-6 rounded-md transition-all hover:scale-110"
            style={{
              backgroundColor: color,
              border: currentColor.toLowerCase() === color.toLowerCase()
                ? '2px solid var(--dome-accent)'
                : '2px solid transparent',
              outline: currentColor.toLowerCase() === color.toLowerCase()
                ? '1px solid var(--dome-accent)'
                : 'none',
              outlineOffset: 1,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
      </div>
    </fieldset>
  );
}

// ─── SubfolderCard ────────────────────────────────────────────────────────────

