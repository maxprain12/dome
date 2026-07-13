import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  children: ReactNode;
  className?: string;
}

/** Consistent vertical rhythm for every Settings destination. */
export default function SettingsPanel({ children, className }: SettingsPanelProps) {
  return (
    <section className={cn('flex w-full min-w-0 flex-col gap-6', className)}>
      {children}
    </section>
  );
}
