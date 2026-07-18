import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

export interface HubSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  clearLabel?: string;
  onSubmit?: () => void;
  className?: string;
}

/** Search field for hub rails or headers (InputGroup + clear). */
export function HubSearch({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  clearLabel = 'Clear',
  onSubmit,
  className,
}: HubSearchProps) {
  return (
    <InputGroup className={cn(className)}>
      <InputGroupAddon align="inline-start">
        <HugeiconsIcon icon={Search01Icon} />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            onSubmit();
          } else if (e.key === 'Escape') {
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onChange('')}
            aria-label={clearLabel}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
