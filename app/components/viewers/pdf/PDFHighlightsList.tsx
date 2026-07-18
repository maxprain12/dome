import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronRightIcon,
} from '@hugeicons/core-free-icons';
import React, { useMemo } from 'react';
import { LEGACY_PDF_HIGHLIGHT_VARS } from '@/lib/ui/palettes';
import type { PDFAnnotation } from '@/lib/pdf/annotation-utils';

const COLOR_ORDER = [
  'var(--warning)', 'var(--success)', 'var(--primary)', 'var(--destructive)',
];

const HEX_TO_VAR_MAP = LEGACY_PDF_HIGHLIGHT_VARS;

function normalizeColor(color: string | undefined): string {
  if (!color) return 'var(--warning)';
  if (color.startsWith('var(')) return color;
  return HEX_TO_VAR_MAP[color.toUpperCase()] ?? 'var(--warning)';
}

const SNIPPET_MAX_LENGTH = 80;

function truncateText(text: string, maxLen: number = SNIPPET_MAX_LENGTH): string {
  if (!text || !text.trim()) return '(no text)';
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + '…';
}

interface PDFHighlightsListProps {
  annotations: PDFAnnotation[];
  onGoToPage: (page: number) => void;
}

export default function PDFHighlightsList({ annotations, onGoToPage }: PDFHighlightsListProps) {
  const highlights = useMemo(
    () => annotations.filter((a) => a.type === 'highlight'),
    [annotations]
  );

  const groupedByColor = useMemo(() => {
    const map = new Map<string, PDFAnnotation[]>();
    for (const h of highlights) {
      const c = normalizeColor(h.style.color);
      const list = map.get(c) ?? [];
      list.push(h);
      map.set(c, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.pageIndex - b.pageIndex);
    }
    return map;
  }, [highlights]);

  const orderedColors = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of COLOR_ORDER) {
      if (groupedByColor.has(c)) {
        result.push(c);
        seen.add(c);
      }
    }
    for (const c of groupedByColor.keys()) {
      if (!seen.has(c)) result.push(c);
    }
    return result;
  }, [groupedByColor]);

  if (highlights.length === 0) {
    return (
      <p className="text-sm px-2 py-4 text-muted-foreground">
        No highlights yet
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {orderedColors.map((color) => {
        const items = groupedByColor.get(color) ?? [];
        if (items.length === 0) return null;

        return (
          <div key={color} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2">
              <div
                className="size-3 rounded-sm shrink-0"
                style={{ background: color, opacity: 0.8 }}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {items.length} highlight{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {items.map((ann) => (
                <div
                  key={ann.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded text-sm transition-colors hover:bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs mb-0.5 text-muted-foreground">
                      Page {ann.pageIndex + 1}
                    </div>
                    <p
                      className="line-clamp-2 break-words text-foreground"
                    >
                      {truncateText(ann.selectedText ?? '')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoToPage(ann.pageIndex + 1)}
                    className="p-1 rounded shrink-0 cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                    style={{ color: 'var(--muted-foreground)' }}
                    title="Go to page"
                    aria-label={`Go to page ${ann.pageIndex + 1}`}
                  >
                    <HugeiconsIcon icon={ChevronRightIcon} size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
