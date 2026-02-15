'use client';

import { FolderInput, Trash2, X } from 'lucide-react';

interface SelectionActionBarProps {
  count: number;
  onMove: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}

export default function SelectionActionBar({
  count,
  onMove,
  onDelete,
  onDeselect,
}: SelectionActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="selection-action-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--translucent)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 16,
        boxShadow: 'var(--shadow-sm)',
        animation: 'selection-bar-in 0.2s ease-out',
      }}
    >
      <span
        className="selection-action-bar-count"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--dome-text)',
        }}
      >
        {count} {count === 1 ? 'item' : 'items'} selected
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onMove}
          className="selection-action-btn"
          aria-label="Move to folder"
        >
          <FolderInput size={16} />
          <span>Move</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="selection-action-btn selection-action-btn-danger"
          aria-label="Delete selected"
        >
          <Trash2 size={16} />
          <span>Delete</span>
        </button>
        <button
          type="button"
          onClick={onDeselect}
          className="selection-action-btn"
          aria-label="Deselect all"
        >
          <X size={16} />
          <span>Deselect</span>
        </button>
      </div>
    </div>
  );
}
