import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DomeListRowProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Resalta fila como interactiva. */
  interactive?: boolean;
  /** Atributos extra en la fila interactiva (p. ej. `role="option"` en listbox). */
  rowButtonProps?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-selected' | 'id'>;
}

const rowClass = (interactive: boolean, isBtn: boolean) =>
  cn(
    'flex items-center gap-3 w-full min-w-0 text-left rounded-lg px-3 py-2.5 border border-transparent',
    interactive || isBtn ? 'hover:bg-[var(--bg-secondary)] cursor-pointer' : '',
    isBtn &&
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
  );

/**
 * Fila de lista genérica: icono, título, subtítulo, meta, acciones.
 */
export default function DomeListRow({
  icon,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  className,
  interactive = false,
  rowButtonProps,
}: DomeListRowProps) {
  const isBtn = Boolean(onClick);
  const inner = (
    <>
      {icon ? <div className="shrink-0">{icon}</div> : null}
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="text-sm font-medium text-[var(--primary-text)] truncate">{title}</div>
        {subtitle ? (
          <div className="text-xs text-[var(--secondary-text)] line-clamp-2">{subtitle}</div>
        ) : null}
        {meta ? (
          <div className="text-[11px] text-[var(--tertiary-text)] flex flex-wrap gap-x-3 gap-y-0.5">{meta}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 flex items-center">{trailing}</div> : null}
    </>
  );

  if (isBtn) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(rowClass(interactive, true), className)}
        {...rowButtonProps}
      >
        {inner}
      </button>
    );
  }

  return <div className={cn(rowClass(interactive, false), className)}>{inner}</div>;
}
