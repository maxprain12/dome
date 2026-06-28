import type { ReactNode } from 'react';
import { collectCompoundSlots, defineSlot } from '@/lib/utils/compoundSlots';

export interface HubToolbarProps {
  /** Compact variant: less vertical padding */
  dense?: boolean;
  className?: string;
  children?: ReactNode;
}

const Leading = defineSlot('HubToolbar.Leading');
const Center = defineSlot('HubToolbar.Center');
const Trailing = defineSlot('HubToolbar.Trailing');

/**
 * Unified top bar for hub workspaces — dense, single border-bottom.
 *
 * @example
 * <HubToolbar dense>
 *   <HubToolbar.Leading>...</HubToolbar.Leading>
 *   <HubToolbar.Center>...</HubToolbar.Center>
 *   <HubToolbar.Trailing>...</HubToolbar.Trailing>
 * </HubToolbar>
 */
function HubToolbar({ dense, className = '', children }: HubToolbarProps) {
  const { leading, center, trailing } = collectCompoundSlots(children, {
    leading: Leading,
    center: Center,
    trailing: Trailing,
  });
  const py = dense ? 'py-2' : 'py-2.5';
  return (
    <header
      className={`shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-4 ${py} ${className}`.trim()}
      style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
    >
      {leading ? <div className="flex items-center gap-2.5 min-w-0 shrink-0 sm:max-w-[40%]">{leading}</div> : null}
      {center != null && center !== false ? (
        <div className="flex-1 min-w-0 flex items-center justify-center sm:justify-stretch order-3 sm:order-none">
          {center}
        </div>
      ) : null}
      {trailing != null && trailing !== false ? (
        <div className="flex flex-wrap items-center gap-1.5 justify-end shrink-0 order-2 sm:order-none">{trailing}</div>
      ) : null}
    </header>
  );
}

HubToolbar.Leading = Leading;
HubToolbar.Center = Center;
HubToolbar.Trailing = Trailing;

export default HubToolbar;
