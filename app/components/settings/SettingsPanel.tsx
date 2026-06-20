import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  children: ReactNode;
  className?: string;
}

/** Root wrapper for settings sections — spacing follows `.settings-content-inner` container width. */
export default function SettingsPanel({ children, className }: SettingsPanelProps) {
  return (
    <div className={cn('settings-panel w-full min-w-0 animate-in fade-in duration-500', className)}>
      {children}
    </div>
  );
}
