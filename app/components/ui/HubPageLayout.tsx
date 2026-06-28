import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { defineSlot, type SlotComponent } from '@/lib/utils/compoundSlots';

const SecondaryNav = defineSlot('HubPageLayout.SecondaryNav');
const Header = defineSlot('HubPageLayout.Header');

export interface HubPageLayoutProps {
  /** Main scrollable region */
  children: ReactNode;
  className?: string;
}

/**
 * Full-height column layout for Agents / Workflows / Automations / Runs workspaces.
 * Uses dome tokens for a consistent minimal-dense shell.
 */
function HubPageLayout({ children, className = '' }: HubPageLayoutProps) {
  let secondaryNav: ReactNode = null;
  let header: ReactNode = null;
  const content: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      if (child != null && child !== false) content.push(child);
      return;
    }
    const type = child.type as SlotComponent;
    if (type.displayName === SecondaryNav.displayName) {
      secondaryNav = (child as ReactElement<{ children?: ReactNode }>).props.children;
      return;
    }
    if (type.displayName === Header.displayName) {
      header = (child as ReactElement<{ children?: ReactNode }>).props.children;
      return;
    }
    content.push(child);
  });

  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden ${className}`.trim()}
      style={{ background: 'var(--dome-bg)' }}
    >
      {secondaryNav}
      {header}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{content}</div>
    </div>
  );
}

HubPageLayout.SecondaryNav = SecondaryNav;
HubPageLayout.Header = Header;

export default HubPageLayout;
