import { useId, useMemo, useState } from 'react';
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, Cancel01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/i18n';
import { Field, FieldLabel } from '@/components/ui/field';

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  clearable?: boolean;
  id?: string;
  min?: string;
  max?: string;
  'aria-label'?: string;
}

function parseDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = parseISO(trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed);
  return isValid(d) ? d : null;
}

function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function parseBound(value?: string): Date | undefined {
  const d = value ? parseDateValue(value) : null;
  return d ?? undefined;
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder,
  disabled,
  className,
  fullWidth = true,
  clearable = true,
  id: idProp,
  min,
  max,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  const dfLocale = getDateFnsLocale();
  const placeholderText = placeholder ?? t('common.date_picker_placeholder');
  const selected = parseDateValue(value);
  const [open, setOpen] = useState(false);

  const displayLabel = selected ? format(selected, 'PPP', { locale: dfLocale }) : placeholderText;

  const disabledDays = useMemo(() => {
    const from = parseBound(min);
    const to = parseBound(max);
    if (!from && !to) return undefined;
    return (day: Date) => {
      const d = startOfDay(day);
      if (from && d < startOfDay(from)) return true;
      if (to && d > startOfDay(to)) return true;
      return false;
    };
  }, [min, max]);

  return (
    <Field className={cn('min-w-0', className)}>
      {label ? (
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      ) : null}
      <div className={cn('flex min-w-0 items-center gap-1', fullWidth && 'w-full')}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            id={id}
            disabled={disabled}
            aria-label={ariaLabel ?? label}
            render={
              <Button
                variant="outline"
                className={cn('justify-start font-normal', fullWidth ? 'flex-1' : 'w-auto', !selected && 'text-muted-foreground')}
              />
            }
          >
            <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
            <span className="truncate">{displayLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" className="ml-auto" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selected ?? undefined}
              onSelect={(d) => {
                if (d) {
                  onChange(toIsoDate(d));
                  setOpen(false);
                }
              }}
              disabled={disabledDays}
              locale={dfLocale}
            />
          </PopoverContent>
        </Popover>
        {clearable && selected && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.clear')}
            onClick={() => onChange('')}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

export default DatePicker;
