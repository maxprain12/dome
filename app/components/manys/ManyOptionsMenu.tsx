import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CloudMany } from '@/lib/manys/api';
import { cn } from '@/lib/utils';

interface ManyOptionsMenuProps {
  many: CloudMany;
  onDelete: (many: CloudMany) => void;
  className?: string;
}

/** Per-Many options. Today that is deleting the agent; the person confirms in a dialog owned by the view. */
export default function ManyOptionsMenu({ many, onDelete, className }: ManyOptionsMenuProps) {
  const { t } = useTranslation();
  const label = t('manys.options', { name: many.name });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" size="icon-xs" variant="ghost" aria-label={label} title={label} className={cn('shrink-0', className)} />}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(many)}>
          <HugeiconsIcon icon={Delete02Icon} aria-hidden />
          {t('manys.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
