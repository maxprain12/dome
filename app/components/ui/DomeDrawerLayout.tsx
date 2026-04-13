import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DomeDrawerLayoutProps {
  header: ReactNode;
  /** Contenido fijo entre cabecera y el área con scroll (p. ej. barra de progreso). */
  afterHeader?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyClassName?: string;
}

/**
 * Layout de drawer: cabecera fija, cuerpo con scroll, pie opcional fijo.
 */
export default function DomeDrawerLayout({
  header,
  afterHeader,
  footer,
  children,
  className,
  style,
  bodyClassName,
}: DomeDrawerLayoutProps) {
  return (
    <div
      className={cn('flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg)]', className)}
      style={style}
    >
      {header}
      {afterHeader}
      <div className={cn('flex-1 min-h-0 overflow-y-auto', bodyClassName)}>{children}</div>
      {footer}
    </div>
  );
}
