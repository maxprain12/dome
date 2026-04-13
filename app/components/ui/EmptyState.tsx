import type { LucideIcon } from 'lucide-react';
import DomeListState from '@/components/ui/DomeListState';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <DomeListState
      variant="empty"
      icon={<Icon className="w-12 h-12" style={{ color: 'var(--tertiary-text)' }} aria-hidden />}
      title={title}
      description={description}
      fullHeight
    />
  );
}
