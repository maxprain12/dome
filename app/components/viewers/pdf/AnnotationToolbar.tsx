
import { Highlighter, StickyNote } from 'lucide-react';
import type { AnnotationType } from '@/lib/pdf/annotation-utils';

interface AnnotationToolbarProps {
  activeTool: AnnotationType | null;
  onToolSelect: (tool: AnnotationType | null) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
}

const TOOLS: Array<{ type: AnnotationType; icon: React.ReactNode; label: string }> = [
  { type: 'highlight', icon: <Highlighter size={18} />, label: 'Highlight' },
  { type: 'note', icon: <StickyNote size={18} />, label: 'Note' },
];

const COLORS = [
  '#ffeb3b', // Yellow
  '#4caf50', // Green
  '#2196f3', // Blue
  '#f44336', // Red
  '#ff9800', // Orange
  '#9c27b0', // Purple
];

export default function AnnotationToolbar({
  activeTool,
  onToolSelect,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
}: AnnotationToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      {/* Tool Selection */}
      <div className="flex items-center gap-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.type}
            onClick={() => onToolSelect(activeTool === tool.type ? null : tool.type)}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md transition-colors duration-200 cursor-pointer hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              background: activeTool === tool.type ? 'var(--bg-secondary)' : 'transparent',
              color: activeTool === tool.type ? 'var(--accent)' : 'var(--secondary-text)',
            }}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={activeTool === tool.type}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-6" style={{ background: 'var(--border)' }} />

      {/* Color Picker */}
      {(activeTool === 'highlight' || activeTool === 'note') && (
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className="min-w-[44px] min-h-[44px] w-8 h-8 flex items-center justify-center rounded border-2 transition-colors duration-200 cursor-pointer hover:border-[var(--accent)]/70 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                background: c,
                borderColor: color === c ? 'var(--accent)' : 'var(--border)',
                borderWidth: color === c ? 3 : 2,
              }}
              title={c}
              aria-label={`Select color ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      )}

      {/* Help Text */}
      <div className="flex-1 text-right">
        <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
          {activeTool
            ? `Active: ${TOOLS.find((t) => t.type === activeTool)?.label || activeTool}`
            : 'Select a tool to annotate'}
        </span>
      </div>
    </div>
  );
}
