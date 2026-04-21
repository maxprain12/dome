import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface DomeContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  /** Si es true, inserta un separador antes de este ítem. */
  separator?: boolean;
}

export interface DomeContextMenuProps {
  trigger: ReactNode;
  items: DomeContextMenuItem[];
  /** Alineación horizontal del menú respecto al disparador (`end` = como Mantine bottom-end). */
  align?: 'start' | 'end';
  className?: string;
}

type TriggerProps = { onClick?: (e: ReactMouseEvent) => void };

/**
 * Menú desplegable sin Mantine: portal, cierre por fuera y Escape.
 * El trigger fusiona onClick aquí para que stopPropagation en el hijo no impida abrir el menú.
 */
export default function DomeContextMenu({
  trigger,
  items,
  align = 'end',
  className,
}: DomeContextMenuProps) {
  const genId = useId();
  const menuId = `dome-context-menu-${genId}`;
  const [open, setOpen] = useState(false);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    minWidth: 0,
    zIndex: 'var(--z-max, 9999)',
  });

  const updatePosition = useCallback(() => {
    const el = triggerWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const minW = Math.max(r.width, 160);
    if (align === 'end') {
      setMenuStyle({
        position: 'fixed',
        top: r.bottom + 4,
        right: Math.max(8, window.innerWidth - r.right),
        minWidth: minW,
        zIndex: 'var(--z-max, 9999)',
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: Math.max(8, r.left),
        minWidth: minW,
        zIndex: 'var(--z-max, 9999)',
      });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (triggerWrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
  };

  const renderTrigger = () => {
    if (isValidElement(trigger)) {
      const el = trigger as ReactElement<TriggerProps>;
      return cloneElement(el, {
        onClick: (e: ReactMouseEvent) => {
          e.stopPropagation();
          toggle();
          el.props.onClick?.(e);
        },
      });
    }
    return (
      <span
        className="inline-flex"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        role="presentation"
      >
        {trigger}
      </span>
    );
  };

  return (
    <div ref={triggerWrapRef} className={cn('inline-flex items-center', className)}>
      {renderTrigger()}
      {open && items.length > 0
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className={cn(
                'rounded-lg border py-1 shadow-lg',
                'border-[var(--dome-border,var(--border))]',
                'bg-[var(--dome-surface,var(--bg-secondary))]',
              )}
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item, idx) => (
                <div key={`${item.label}-${idx}`}>
                  {item.separator ? (
                    <div
                      role="separator"
                      className="my-1 h-px bg-[var(--border)]"
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      'hover:bg-[var(--dome-bg,var(--bg-hover))]',
                      'focus-visible:outline-none focus-visible:bg-[var(--dome-bg,var(--bg-hover))]',
                      item.variant === 'danger'
                        ? 'text-[var(--error)]'
                        : 'text-[var(--dome-text,var(--primary-text))]',
                      item.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onClick();
                      setOpen(false);
                    }}
                  >
                    {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                    <span className="min-w-0 flex-1">{item.label}</span>
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
