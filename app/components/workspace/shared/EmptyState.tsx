'use client';

import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-3">
      <Icon
        className="w-12 h-12"
        style={{ color: 'var(--tertiary-text)' }}
      />
      <div className="text-center max-w-md">
        <h3
          className="text-sm font-medium mb-1"
          style={{ color: 'var(--primary-text)' }}
        >
          {title}
        </h3>
        {description && (
          <p
            className="text-sm"
            style={{ color: 'var(--secondary-text)' }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
