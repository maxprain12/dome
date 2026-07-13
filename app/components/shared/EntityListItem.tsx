import type { ReactNode } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';

export interface EntityListItemProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconSvgElement;
  media?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  /** Highlights the row as the current selection (e.g. an open list item). */
  active?: boolean;
  className?: string;
}

export function EntityListItem({ title, description, icon, media, actions, onClick, active, className }: EntityListItemProps) {
  return (
    <Item
      variant={active ? 'muted' : 'outline'}
      className={cn('h-auto items-start whitespace-normal', active && 'border-transparent bg-accent', className)}
      render={onClick ? <button type="button" onClick={onClick} /> : undefined}
    >
      {media ? <ItemMedia>{media}</ItemMedia> : icon ? <ItemMedia variant="icon"><HugeiconsIcon icon={icon} /></ItemMedia> : null}
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description ? <ItemDescription>{description}</ItemDescription> : null}
      </ItemContent>
      {actions ? <ItemActions className="self-start">{actions}</ItemActions> : null}
    </Item>
  );
}
