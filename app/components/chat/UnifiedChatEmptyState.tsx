import { memo, type ReactNode } from 'react';

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
    <div className="flex flex-col items-center justify-center h-full min-h-0 gap-4 text-center px-4 py-8">
      <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 bg-[var(--bg-secondary)] border border-[var(--border)]">
        {avatar}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--primary-text)]">{title}</h2>
        <p className="text-sm mt-1 max-w-md mx-auto text-[var(--tertiary-text)]">{description}</p>
      </div>
      {children}
    </div>
  );
});
