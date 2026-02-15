'use client';

import { memo, useState, useEffect } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Check } from 'lucide-react';

/** Paleta ampliada: acento del proyecto + tonos oliva + neutros */
const FOLDER_COLOR_SWATCHES = [
  '#596037',
  '#6d7a42',
  '#7d8b52',
  '#8a9668',
  '#4a5429',
  '#3d4622',
  '#7b76d0',
  '#998eec',
  '#5550a8',
  '#22c55e',
  '#3b82f6',
  '#f97316',
  '#ef4444',
  '#6b7280',
  '#9ca3af',
  '#64748b',
];

const normalizeHex = (c: string) =>
  c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '#596037';

interface FolderColorPickerProps {
  value: string;
  onSave: (color: string) => void;
}

export default memo(function FolderColorPicker({ value, onSave }: FolderColorPickerProps) {
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
            className="w-6 h-6 rounded border-2 transition-all focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
            style={{
              backgroundColor: color,
              borderColor:
                localColor.toLowerCase() === color.toLowerCase() ? 'var(--dome-accent)' : 'var(--border)',
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
          className="w-8 h-8 rounded border shrink-0"
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
          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[var(--dome-accent)] focus:ring-offset-1"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--primary-text)',
          }}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-sm font-medium rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
        style={{
          backgroundColor: 'var(--dome-accent)',
          color: 'white',
        }}
        aria-label="Guardar color"
      >
        <Check size={14} />
        Guardar
      </button>
    </div>
  );
});
