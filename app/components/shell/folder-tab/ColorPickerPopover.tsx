/** Color swatch popover for folder cards (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FOLDER_TAB_SWATCHES } from '@/lib/ui/palettes';

const SWATCHES = FOLDER_TAB_SWATCHES;
const POPOVER_WIDTH = 196;

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
  const [coords, setCoords] = useState(() => ({
    top: pos.top,
    left: Math.min(Math.max(8, pos.left), window.innerWidth - POPOVER_WIDTH - 8),
  }));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.offsetHeight;
    const width = el.offsetWidth;
    const left = Math.min(Math.max(8, pos.left), window.innerWidth - width - 8);
    let top = pos.top;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, pos.top - height - 8);
    }
    top = Math.min(Math.max(8, top), window.innerHeight - height - 8);
    setCoords({ top, left });
  }, [pos.top, pos.left]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <fieldset
      ref={ref}
      aria-label={t('folder.changeColor', 'Cambiar color')}
      className="fixed z-[var(--z-popover)] rounded-xl shadow-lg p-2.5 border-0 m-0 min-w-0"
      style={{
        top: coords.top,
        left: coords.left,
        width: POPOVER_WIDTH,
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-border)',
      }}
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
    </fieldset>,
    document.body,
  );
}
