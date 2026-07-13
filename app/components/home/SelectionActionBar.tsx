'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  FolderInputIcon,
  FolderOpenIcon,
  Delete02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
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
        {actionBtn(<HugeiconsIcon icon={FolderOpenIcon} size={compact ? 14 : 16} />, t('selection.move_to_folder'), onMoveToFolder)}
        {onMoveToProject
          ? actionBtn(<HugeiconsIcon icon={FolderInputIcon} size={compact ? 14 : 16} />, t('selection.move_to_project'), onMoveToProject)
          : null}
        {actionBtn(<HugeiconsIcon icon={Delete02Icon} size={compact ? 14 : 16} />, t('selection.delete'), onDelete, true)}
        {actionBtn(<HugeiconsIcon icon={Cancel01Icon} size={compact ? 14 : 16} />, t('selection.deselect'), onDeselect)}
      </div>
    </div>
  );
}
