'use client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DropdownMenuTrigger render={<span className="fixed size-px" style={{ left: x, top: y }} aria-hidden />} />
      <DropdownMenuContent align="start" side="bottom" sideOffset={0} className="min-w-48 max-w-80">
        <DropdownMenuGroup>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            variant={item.danger ? 'destructive' : 'default'}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </DropdownMenuItem>
        ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
