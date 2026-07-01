'use client';

import { FolderInput, FolderOpen, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SelectionActionBarProps {
  count: number;
  onMoveToFolder: () => void;
  onMoveToProject?: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  /** Icon-only single-row variant for narrow containers (sidebar tree). */
  compact?: boolean;
}

export default function SelectionActionBar({
  count,
  onMoveToFolder,
  onMoveToProject,
  onDelete,
  onDeselect,
  compact = false,
}: SelectionActionBarProps) {
  const { t } = useTranslation();
  if (count === 0) return null;

  const countLabel = t(
    count === 1 ? 'selection.items_selected_one' : 'selection.items_selected_other',
    { count },
  );

  const actionBtn = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger = false,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`selection-action-btn${danger ? ' selection-action-btn-danger' : ''}`}
      aria-label={label}
      title={compact ? label : undefined}
    >
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  );

  return (
    <div className={`selection-action-bar${compact ? ' selection-action-bar--compact' : ''}`}>
      <span className="selection-action-bar-count" title={compact ? countLabel : undefined}>
        {compact ? count : countLabel}
      </span>
      <div className="selection-action-bar-actions">
        {actionBtn(<FolderOpen size={compact ? 14 : 16} />, t('selection.move_to_folder'), onMoveToFolder)}
        {onMoveToProject
          ? actionBtn(<FolderInput size={compact ? 14 : 16} />, t('selection.move_to_project'), onMoveToProject)
          : null}
        {actionBtn(<Trash2 size={compact ? 14 : 16} />, t('selection.delete'), onDelete, true)}
        {actionBtn(<X size={compact ? 14 : 16} />, t('selection.deselect'), onDeselect)}
      </div>
    </div>
  );
}
