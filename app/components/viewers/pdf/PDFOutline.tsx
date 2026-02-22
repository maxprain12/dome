import React from 'react';
import type { OutlineItem } from '@/lib/pdf/pdf-loader';

interface PDFOutlineProps {
  outline: OutlineItem[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

function OutlineItemNode({
  item,
  currentPage,
  onPageChange,
  depth = 0,
}: {
  item: OutlineItem;
  currentPage: number;
  onPageChange: (page: number) => void;
  depth?: number;
}) {
  const hasChildren = item.items && item.items.length > 0;
  const isActive = item.pageNumber != null && item.pageNumber === currentPage;

  const isClickable = item.pageNumber != null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          if (item.pageNumber != null) onPageChange(item.pageNumber);
        }}
        disabled={!isClickable}
        className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors truncate focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 ${isClickable ? 'hover:underline' : ''}`}
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          color: isClickable ? 'var(--accent)' : 'var(--tertiary-text)',
          background: isActive ? 'var(--dome-accent-bg, rgba(var(--accent-rgb), 0.15))' : 'transparent',
          cursor: isClickable ? 'pointer' : 'default',
        }}
        title={isClickable ? `Ir a página ${item.pageNumber}` : undefined}
      >
        {item.title}
      </button>
      {hasChildren &&
        item.items!.map((child, i) => (
          <OutlineItemNode
            key={i}
            item={child}
            currentPage={currentPage}
            onPageChange={onPageChange}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function PDFOutline({ outline, currentPage, onPageChange }: PDFOutlineProps) {
  if (outline.length === 0) {
    return (
      <p className="text-sm px-2 py-4" style={{ color: 'var(--tertiary-text)' }}>
        No outline available
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {outline.map((item, i) => (
        <OutlineItemNode
          key={i}
          item={item}
          currentPage={currentPage}
          onPageChange={onPageChange}
        />
      ))}
    </div>
  );
}
