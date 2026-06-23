import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DomeSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
}

export interface DomeSelectMenuProps<T extends string = string> {
  value: T | null | undefined;
  options: DomeSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Width of the trigger; the menu matches it. Default '100%'. */
  fullWidth?: boolean;
  'aria-label'?: string;
}

/**
 * Dome-styled select. Unlike the native `<select>` (whose expanded list is
 * rendered by the OS and looks generic), this renders a custom popover with
 * Dome design tokens, keyboard navigation and a portal so it escapes overflow.
 * Prefer this over raw `<select>` for any user-facing choice in the app.
 */
export function DomeSelectMenu<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = '—',
  label,
  disabled,
  className,
  fullWidth = true,
  'aria-label': ariaLabel,
}: DomeSelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setActiveIdx(idx);
    setOpen(true);
  };

  // Close on outside click / scroll / resize; reposition on scroll.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
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

  const choose = (idx: number) => {
    const opt = options[idx];
    if (opt) {
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(activeIdx);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <span className="text-xs font-medium" style={{ color: 'var(--primary-text)' }}>
          {label}
        </span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="inline-flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors"
        style={{
          width: fullWidth ? '100%' : undefined,
          background: 'var(--bg)',
          color: selected ? 'var(--primary-text)' : 'var(--tertiary-text)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={14} style={{ color: 'var(--tertiary-text)' }} />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              id={listId}
              tabIndex={-1}
              className="fixed z-[10001] rounded-lg py-1 shadow-lg overflow-y-auto outline-none"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                maxHeight: 280,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))',
              }}
              onKeyDown={onKeyDown}
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm" style={{ color: 'var(--tertiary-text)' }}>
                  {placeholder}
                </div>
              ) : (
                options.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => choose(idx)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                      style={{
                        background: isActive ? 'var(--bg-hover)' : 'transparent',
                        color: 'var(--primary-text)',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.icon}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{opt.label}</span>
                        {opt.description ? (
                          <span className="block truncate text-xs" style={{ color: 'var(--tertiary-text)' }}>
                            {opt.description}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? <Check size={14} style={{ color: 'var(--accent)' }} /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default DomeSelectMenu;
