import { memo, type ReactNode } from 'react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export interface UnifiedChatEmptyStateProps {
  avatar: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

/** Centered empty chat: avatar, title, description, optional quick actions. */
export const UnifiedChatEmptyState = memo(function UnifiedChatEmptyState({
  avatar,
  title,
  description,
  children,
}: UnifiedChatEmptyStateProps) {
  return (
    <Empty className="h-full min-h-0 border-0 px-4 py-8">
      <EmptyMedia className="size-14 overflow-hidden rounded-2xl border border-border bg-card">
        {avatar}
      </EmptyMedia>
      <EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
});
