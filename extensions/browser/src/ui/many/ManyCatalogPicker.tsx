import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../../../app/components/ui/popover';

interface ManyCatalogPickerProps {
  trigger: ReactNode;
  label: string;
  items: Array<{ id: string; label: string; description?: string }>;
  selectedIds?: string[];
  onSelect: (item: { id: string; label: string }) => void;
}

export default function ManyCatalogPicker({
  trigger,
  label,
  items,
  selectedIds = [],
  onSelect,
}: ManyCatalogPickerProps) {
  return (
    <Popover>
      <PopoverTrigger render={<span className="inline-flex" />}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 gap-2">
        <p className="px-1 text-xs font-medium">{label}</p>
        <div className="max-h-56 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => onSelect(item)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
              {selectedIds.includes(item.id) ? (
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="shrink-0 text-primary"
                />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
