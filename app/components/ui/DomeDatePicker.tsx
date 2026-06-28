import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfDay,
  subMonths,
} from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/i18n';

export interface DomeDatePickerProps {
  /** ISO date `yyyy-MM-dd`, or empty string for no selection. */
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

function isBeforeMin(day: Date, min?: string): boolean {
  const minDate = min ? parseDateValue(min) : null;
  if (!minDate) return false;
  return startOfDay(day) < startOfDay(minDate);
}

function isAfterMax(day: Date, max?: string): boolean {
  const maxDate = max ? parseDateValue(max) : null;
  if (!maxDate) return false;
  return startOfDay(day) > startOfDay(maxDate);
}

/**
 * Dome-styled date picker with a custom calendar popover. Prefer over native
 * `<input type="date">`, whose UI is rendered by the OS and looks generic.
 */
export function DomeDatePicker({
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
}: DomeDatePickerProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  const dfLocale = getDateFnsLocale();
  const placeholderText = placeholder ?? t('common.date_picker_placeholder');

  const selected = parseDateValue(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDialogElement>(null);

  const displayLabel = selected
    ? format(selected, 'PPP', { locale: dfLocale })
    : placeholderText;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 280);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setRect({ left, top: r.bottom + 4, width });
  }, []);

  const openPicker = () => {
    if (disabled) return;
    setViewDate(selected ?? new Date());
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => place();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  const weekdayLabels = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(base, i), 'EEEEE', { locale: dfLocale }),
    );
  }, [dfLocale]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewDate]);

  const pickDay = (day: Date) => {
    if (isBeforeMin(day, min) || isAfterMax(day, max)) return;
    onChange(toIsoDate(day));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      openPicker();
    }
    if (open && e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
          {label}
        </label>
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? label ?? placeholderText}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={onKeyDown}
        className="inline-flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors"
        style={{
          width: fullWidth ? '100%' : undefined,
          background: 'var(--dome-bg, var(--bg))',
          color: selected ? 'var(--dome-text, var(--primary-text))' : 'var(--dome-text-muted, var(--tertiary-text))',
          border: `1px solid ${open ? 'var(--dome-accent, var(--accent))' : 'var(--dome-border, var(--border))'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className="inline-flex items-center gap-1.5 truncate min-w-0">
          <Calendar size={14} style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }} />
          <span className="truncate">{displayLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled ? (
            <button
              type="button"
              aria-label={t('common.date_picker_clear')}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setOpen(false);
              }}
              className="rounded p-0.5 border-0 bg-transparent"
              style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover, var(--bg-hover))';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <X size={12} />
            </button>
          ) : null}
          <ChevronDown size={14} style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }} />
        </span>
      </button>

      {open && rect
        ? createPortal(
            <dialog
              ref={popoverRef}
              open
              aria-label={t('common.date_picker_placeholder')}
              tabIndex={-1}
              className="fixed z-[10001] rounded-lg p-3 shadow-lg outline-none border m-0 max-w-none w-auto"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                background: 'var(--dome-surface, var(--bg-secondary))',
                borderColor: 'var(--dome-border, var(--border))',
                boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  aria-label={t('common.date_picker_prev_month')}
                  onClick={() => setViewDate((d) => subMonths(d, 1))}
                  className="rounded-md p-1"
                  style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover, var(--bg-hover))';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold capitalize" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
                  {format(viewDate, 'LLLL yyyy', { locale: dfLocale })}
                </span>
                <button
                  type="button"
                  aria-label={t('common.date_picker_next_month')}
                  onClick={() => setViewDate((d) => addMonths(d, 1))}
                  className="rounded-md p-1"
                  style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover, var(--bg-hover))';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {weekdayLabels.map((wd) => (
                  <div
                    key={wd}
                    className="text-center text-[10px] font-medium uppercase py-1"
                    style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((day) => {
                  const inMonth = isSameMonth(day, viewDate);
                  const isSelected = selected ? isSameDay(day, selected) : false;
                  const today = isToday(day);
                  const outOfRange = isBeforeMin(day, min) || isAfterMax(day, max);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => pickDay(day)}
                      className="h-8 rounded-md text-sm transition-colors"
                      style={{
                        opacity: inMonth ? (outOfRange ? 0.35 : 1) : 0.35,
                        background: isSelected
                          ? 'var(--dome-accent, var(--accent))'
                          : today
                            ? 'color-mix(in srgb, var(--dome-accent, var(--accent)) 12%, transparent)'
                            : 'transparent',
                        color: isSelected
                          ? 'var(--dome-on-accent)'
                          : 'var(--dome-text, var(--primary-text))',
                        fontWeight: today ? 700 : 400,
                        cursor: outOfRange ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (outOfRange || isSelected) return;
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover, var(--bg-hover))';
                      }}
                      onMouseLeave={(e) => {
                        if (isSelected) return;
                        (e.currentTarget as HTMLButtonElement).style.background = today
                          ? 'color-mix(in srgb, var(--dome-accent, var(--accent)) 12%, transparent)'
                          : 'transparent';
                      }}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--dome-border, var(--border))' }}>
                <button
                  type="button"
                  onClick={() => pickDay(new Date())}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    color: 'var(--dome-accent, var(--accent))',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {t('calendarPage.today')}
                </button>
                {clearable ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{
                      color: 'var(--dome-text-muted, var(--tertiary-text))',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {t('common.date_picker_clear')}
                  </button>
                ) : null}
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </div>
  );
}

export default DomeDatePicker;
