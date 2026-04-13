import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type DomeIconBoxSize = 'sm' | 'md';

export interface DomeIconBoxProps extends HTMLAttributes<HTMLDivElement> {
  size?: DomeIconBoxSize;
  /** Fondo CSS (p. ej. color-mix o var). Si no se pasa, usa superficie tenue del tema. */
  background?: CSSProperties['background'];
}

const boxSize: Record<DomeIconBoxSize, string> = {
  sm: 'w-7 h-7 rounded-md',
  md: 'w-8 h-8 rounded-lg',
};

/**
 * Contenedor cuadrado para iconos (tiles), tokens del tema.
 */
export default function DomeIconBox({
  size = 'sm',
  className,
  style,
  background = 'color-mix(in srgb, var(--accent) 15%, var(--bg-secondary))',
  children,
  ...rest
}: DomeIconBoxProps) {
  return (
    <div
      className={cn('shrink-0 flex items-center justify-center', boxSize[size], className)}
      style={{ background, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
