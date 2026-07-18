/** Color swatch popover for folder cards (03/T02 — extracted from FolderTabView.tsx). */

import { useTranslation } from 'react-i18next';
import { FOLDER_TAB_SWATCHES } from '@/lib/ui/palettes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

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
  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverTrigger render={<span className="fixed size-px" style={{ top: pos.top, left: pos.left }} aria-hidden />} />
      <PopoverContent align="start" side="bottom" sideOffset={4} className="w-[196px] p-2.5">
    <fieldset
      aria-label={t('folder.changeColor', 'Cambiar color')}
      className="m-0 min-w-0 border-0 p-0"
    >
      <div role="presentation" onMouseDown={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-6 gap-1.5">
          {SWATCHES.map((color) => (
            <Button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => { onSave(color); onClose(); }}
              variant="outline"
              size="icon-sm"
              className="size-6 rounded-md transition-transform duration-150 ease-[var(--ease-out)] hover:scale-110 motion-reduce:transition-none"
              style={{
                backgroundColor: color,
                border: currentColor.toLowerCase() === color.toLowerCase()
                  ? '2px solid var(--primary)'
                  : '2px solid transparent',
                outline: currentColor.toLowerCase() === color.toLowerCase()
                  ? '1px solid var(--primary)'
                  : 'none',
                outlineOffset: 1,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>
    </fieldset>
      </PopoverContent>
    </Popover>
  );
}
