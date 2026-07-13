'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckIcon,
} from '@hugeicons/core-free-icons';
import { memo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { FOLDER_COLOR_SWATCHES, FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';

export { FOLDER_COLOR_SWATCHES } from '@/lib/ui/palettes';

const normalizeHex = (c: string) =>
  c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : FOLDER_COLOR_DEFAULT;

interface FolderColorPickerProps {
  value: string;
  onSave: (color: string) => void;
}

export default memo(function FolderColorPicker({ value, onSave }: FolderColorPickerProps) {
  const { t } = useTranslation();
  const initialColor = normalizeHex(value);
  const [localColor, setLocalColor] = useState(initialColor);

  useEffect(() => {
    setLocalColor(normalizeHex(value));
  }, [value]);

  const handleSave = () => {
    onSave(localColor);
  };

  return (
    <div className="folder-color-picker" style={{ minWidth: 200 }}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {FOLDER_COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setLocalColor(color)}
            className="size-6 rounded border-2 transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            style={{
              backgroundColor: color,
              borderColor:
                localColor.toLowerCase() === color.toLowerCase() ? 'var(--primary)' : 'var(--border)',
            }}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>
      <div className="react-colorful-wrapper mb-2">
        <HexColorPicker color={localColor} onChange={setLocalColor} />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="size-8 rounded border shrink-0"
          style={{
            backgroundColor: localColor,
            borderColor: 'var(--border)',
          }}
          aria-hidden
        />
        <HexColorInput
          color={localColor}
          onChange={setLocalColor}
          prefixed
          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
          }}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-sm font-medium rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
        aria-label={t('ui.save')}
      >
        <HugeiconsIcon icon={CheckIcon} size={14} />
        {t('ui.save')}
      </button>
    </div>
  );
});
