import { useState, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ChevronDownIcon } from '@hugeicons/core-free-icons';
import { SidebarProvider, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useResizeStore } from '@/lib/store/useResizeStore';
import { cn } from '@/lib/utils';

/** The shell owns width/collapse; shadcn supplies navigation and disclosure semantics. */
export function ShellSidebar({ collapsed, label, children }: { collapsed: boolean; label: string; children: ReactNode }) {
  return <SidebarProvider open={!collapsed} onOpenChange={(open) => useResizeStore.setState({ leftSidebarCollapsed: !open })} keyboardShortcut={false} className="contents">
    <aside aria-label={label} aria-hidden={collapsed} hidden={collapsed} className={cn('dome-left-sidebar h-full w-(--chrome-rail-width) shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground', collapsed ? 'hidden' : 'flex')}>
      {children}
    </aside>
  </SidebarProvider>;
}

export function ShellNavItem({ icon, label, active, count, dataTour, onClick, nested = false }: {
  icon: IconSvgElement;
  label: string;
  active?: boolean;
  count?: number;
  dataTour?: string;
  onClick: () => void;
  nested?: boolean;
}) {
  const content = <><HugeiconsIcon icon={icon} aria-hidden /><span className="min-w-0 flex-1 truncate">{label}</span></>;
  if (nested) return <SidebarMenuSubItem>
    <SidebarMenuSubButton render={<button type="button" />} isActive={active} aria-current={active ? 'page' : undefined} data-tour={dataTour} onClick={onClick}>{content}{count !== undefined && <span className="ml-auto tabular-nums">{count}</span>}</SidebarMenuSubButton>
  </SidebarMenuSubItem>;
  return <SidebarMenuItem>
    <SidebarMenuButton type="button" isActive={active} aria-current={active ? 'page' : undefined} data-tour={dataTour} onClick={onClick} className={count !== undefined ? 'pr-9' : undefined}>{content}</SidebarMenuButton>
    {count !== undefined && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
  </SidebarMenuItem>;
}

/** A selected child is revealed on navigation; users can still close its group. */
export function ShellNavSection({ label, icon, activeId, forceOpen = false, children }: {
  label: string;
  icon: IconSvgElement;
  activeId?: string;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [disclosure, setDisclosure] = useState({ activeId, open: Boolean(activeId) });
  const open = forceOpen || (disclosure.activeId === activeId ? disclosure.open : Boolean(activeId));
  return <SidebarMenu><SidebarMenuItem>
    <Collapsible open={open} onOpenChange={(next) => setDisclosure({ activeId, open: next })}>
      <CollapsibleTrigger render={<SidebarMenuButton isActive={Boolean(activeId) && !open} title={label} />}>
        <HugeiconsIcon icon={icon} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <HugeiconsIcon icon={ChevronDownIcon} aria-hidden className={cn('ml-auto transition-transform motion-reduce:transition-none', !open && '-rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>{children}</SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  </SidebarMenuItem></SidebarMenu>;
}
