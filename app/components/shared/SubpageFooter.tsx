import { Children, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { collectCompoundSlots, defineSlot, type SlotComponent } from '@/lib/utils/compoundSlots';

const Leading = defineSlot('SubpageFooter.Leading');
const Trailing = defineSlot('SubpageFooter.Trailing');

export interface SubpageFooterProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Pie de subpágina con borde superior (acciones primarias / secundarias).
 */
function SubpageFooter({ children, className }: SubpageFooterProps) {
  const { leading, trailing } = collectCompoundSlots(children, {
    leading: Leading,
    trailing: Trailing,
  });

  const rest: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      if (child != null && child !== false) rest.push(child);
      return;
    }
    const type = child.type as SlotComponent;
    if (type.displayName === Leading.displayName || type.displayName === Trailing.displayName) return;
    rest.push(child);
  });

  const trailingContent = trailing ?? (rest.length > 0 ? rest : null);

  return (
    <footer
      className={cn(
        'shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-background',
        className,
      )}
    >
      <div className="min-w-0 flex items-center gap-2">{leading}</div>
      <div className="shrink-0 flex items-center gap-2">{trailingContent}</div>
    </footer>
  );
}

SubpageFooter.Leading = Leading;
SubpageFooter.Trailing = Trailing;

export default SubpageFooter;
