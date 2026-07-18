'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  FolderInputIcon,
  FolderOpenIcon,
  Delete02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    <Button
      type="button"
      variant="outline"
      size={compact ? 'icon-sm' : 'sm'}
      onClick={onClick}
      className={cn(
        !compact && 'gap-1.5',
        danger && 'text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive',
      )}
      aria-label={label}
      title={compact ? label : undefined}
    >
      {icon}
      {!compact && label}
    </Button>
  );

  return (
    <div
      className={cn(
        'flex animate-in fade-in items-center rounded-lg border bg-primary/10 shadow-sm duration-150',
        compact ? 'gap-1.5 p-1.5' : 'mb-4 gap-3 px-4 py-2.5',
      )}
    >
      <Badge
        variant="secondary"
        className={cn(compact && 'size-5 shrink-0 justify-center rounded-full p-0')}
        title={compact ? countLabel : undefined}
      >
        {compact ? count : countLabel}
      </Badge>
      <div className={cn('flex flex-wrap items-center', compact ? 'gap-1' : 'gap-2')}>
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
