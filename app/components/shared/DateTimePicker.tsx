import { useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Clock01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from './DatePicker';
import { Field, FieldLabel } from '@/components/ui/field';

export interface DateTimePickerProps {
  /** `yyyy-MM-ddTHH:mm` compatible with datetime-local inputs. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function splitDateTime(value: string): { date: string; time: string } {
  if (!value.trim()) return { date: '', time: '09:00' };
  const date = value.slice(0, 10);
  const time = value.length >= 16 ? value.slice(11, 16) : '09:00';
  return { date, time };
}

/**
 * Date + time picker (composición shadcn: Popover+Calendar+Select).
 * Prefer over native `<input type="datetime-local">`.
 */
export function DateTimePicker({
  value,
  onChange,
  label,
  disabled,
  className,
  id,
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const { date, time } = splitDateTime(value);
  const [hour, minute] = time.split(':');

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ value: pad2(h), label: pad2(h) })),
    [],
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const m = pad2(i * 5);
      return { value: m, label: m };
    }),
    [],
  );

  const emit = (nextDate: string, nextTime: string) => {
    const d = nextDate || date || new Date().toISOString().slice(0, 10);
    onChange(`${d}T${nextTime}`);
  };

  return (
    <Field className={cn('min-w-0', className)}>
      {label ? (
        <FieldLabel>{label}</FieldLabel>
      ) : null}
      <DatePicker
        id={id ? `${id}-date` : undefined}
        value={date}
        onChange={(d) => emit(d, time)}
        disabled={disabled}
        clearable={false}
        placeholder={t('common.date_picker_placeholder')}
      />
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Clock01Icon} className="text-muted-foreground" aria-hidden />
        <Select
          value={hour ?? '09'}
          onValueChange={(h) => { if (h != null) emit(date, `${h}:${minute ?? '00'}`); }}
          items={hourOptions}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1 min-w-0" aria-label={t('calendarPage.event_start')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hourOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">:</span>
        <Select
          value={minute ?? '00'}
          onValueChange={(m) => { if (m != null) emit(date, `${hour ?? '09'}:${m}`); }}
          items={minuteOptions}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1 min-w-0" aria-label={t('calendarPage.event_end')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minuteOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

export default DateTimePicker;
