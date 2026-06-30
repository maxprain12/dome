/** Inline new-folder name input (03/T02 — extracted from FolderTabView.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Folder, X } from 'lucide-react';
import { FOLDER_COLOR_DEFAULT, FOLDER_TAB_SWATCHES } from '@/lib/ui/palettes';

const SWATCHES = FOLDER_TAB_SWATCHES;

export default function NewFolderInline({
  onConfirm,
  onCancel,
  variant = 'grid',
}: {
  onConfirm: (name: string, color: string) => void;
  onCancel: () => void;
  variant?: 'grid' | 'list';
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLOR_DEFAULT);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleConfirm = () => {
    if (value.trim()) onConfirm(value.trim(), selectedColor);
  };

  const swatches = (
    <div className="dome-new-folder__swatches" role="group" aria-label={t('folder.changeColor', 'Cambiar color')}>
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          aria-pressed={selectedColor.toLowerCase() === color.toLowerCase()}
          onClick={() => setSelectedColor(color)}
          className="dome-new-folder__swatch"
          style={{
            backgroundColor: color,
            borderColor: selectedColor.toLowerCase() === color.toLowerCase()
              ? 'var(--dome-accent)'
              : 'transparent',
          }}
        />
      ))}
    </div>
  );

  const actions = (
    <div className="dome-new-folder__actions">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!value.trim()}
        className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--confirm"
        aria-label={t('ui.create')}
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--cancel"
        aria-label={t('ui.cancel')}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );

  if (variant === 'list') {
    return (
      <div className="dome-new-folder dome-new-folder--list">
        <Folder className="size-4 shrink-0" style={{ color: selectedColor }} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('folder.folderNamePlaceholder')}
          aria-label={t('folder.folderNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          className="dome-fs-tree-row__rename-input flex-1 min-w-0"
        />
        {swatches}
        {actions}
      </div>
    );
  }

  return (
    <div className="dome-fs-card dome-fs-card--creating">
      <div
        className="dome-fs-card__cover"
        style={{ background: `color-mix(in srgb, ${selectedColor} 12%, var(--dome-surface))` }}
      >
        <Folder
          className="dome-fs-card__cover-icon"
          style={{ color: selectedColor }}
          strokeWidth={1.25}
        />
      </div>
      <div className="dome-new-folder__body">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('folder.folderNamePlaceholder')}
          aria-label={t('folder.folderNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          className="dome-new-folder__input"
        />
        {swatches}
        <div className="dome-new-folder__footer">
          {actions}
        </div>
      </div>
    </div>
  );
}
