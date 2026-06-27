import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { DomeDatePicker } from './DomeDatePicker';
import { DomeSelectMenu } from './DomeSelectMenu';

export interface DomeDateTimePickerProps {
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
 * Dome-styled date + time picker. Prefer over native `<input type="datetime-local">`.
 */
export function DomeDateTimePicker({
  value,
  onChange,
  label,
  disabled,
  className,
  id,
}: DomeDateTimePickerProps) {
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
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <span className="text-xs font-medium c-calendar-modal-label" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
          {label}
        </span>
      ) : null}
      <DomeDatePicker
        id={id ? `${id}-date` : undefined}
        value={date}
        onChange={(d) => emit(d, time)}
        disabled={disabled}
        clearable={false}
        placeholder={t('common.date_picker_placeholder')}
      />
      <div className="flex items-center gap-2">
        <Clock size={14} style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }} aria-hidden />
        <DomeSelectMenu
          value={hour ?? '09'}
          options={hourOptions}
          onChange={(h) => emit(date, `${h}:${minute ?? '00'}`)}
          disabled={disabled}
          aria-label={t('calendarPage.event_start')}
          fullWidth={false}
          className="flex-1 min-w-0"
        />
        <span style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>:</span>
        <DomeSelectMenu
          value={minute ?? '00'}
          options={minuteOptions}
          onChange={(m) => emit(date, `${hour ?? '09'}:${m}`)}
          disabled={disabled}
          aria-label={t('calendarPage.event_end')}
          fullWidth={false}
          className="flex-1 min-w-0"
        />
      </div>
    </div>
  );
}

export default DomeDateTimePicker;
