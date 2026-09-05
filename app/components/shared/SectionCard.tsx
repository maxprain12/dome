import type { ReactNode } from 'react';
import { hubSectionClass, hubSectionTitleClass } from '@/components/shared/hubChrome';

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={hubSectionClass}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={hubSectionTitleClass}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
