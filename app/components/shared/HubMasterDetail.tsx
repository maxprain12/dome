import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Split rail + detail used by Social, People, and other hubs. */
export function HubMasterDetail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('@container/hub-row flex h-full min-h-0 flex-1 overflow-hidden', className)}>
      {children}
    </div>
  );
}
