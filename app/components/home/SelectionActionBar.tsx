'use client';

import { FolderInput, FolderOpen, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SelectionActionBarProps {
  count: number;
  onMoveToFolder: () => void;
  onMoveToProject?: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}

export default function SelectionActionBar({
  count,
  onMoveToFolder,
  onMoveToProject,
  onDelete,
  onDeselect,
}: SelectionActionBarProps) {
  const { t } = useTranslation();
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
        {t(count === 1 ? 'selection.items_selected_one' : 'selection.items_selected_other', { count })}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onMoveToFolder}
          className="selection-action-btn"
          aria-label={t('selection.move_to_folder')}
        >
          <FolderOpen size={16} />
          <span>{t('selection.move_to_folder')}</span>
        </button>
        {onMoveToProject ? (
          <button
            type="button"
            onClick={onMoveToProject}
            className="selection-action-btn"
            aria-label={t('selection.move_to_project')}
          >
            <FolderInput size={16} />
            <span>{t('selection.move_to_project')}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="selection-action-btn selection-action-btn-danger"
          aria-label={t('selection.delete')}
        >
          <Trash2 size={16} />
          <span>{t('selection.delete')}</span>
        </button>
        <button
          type="button"
          onClick={onDeselect}
          className="selection-action-btn"
          aria-label={t('selection.deselect')}
        >
          <X size={16} />
          <span>{t('selection.deselect')}</span>
        </button>
      </div>
    </div>
  );
}
