import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DetailModal, type DetailModalProps } from './DetailModal';

/** Colored identity pill — overrides Badge h-5/overflow clip. */
export function ColorPill({
  color,
  children,
  className,
}: {
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant={color ? 'outline' : 'secondary'}
      className={cn(
        'h-auto max-w-full min-w-0 gap-1 overflow-visible border-transparent py-0.5 font-normal leading-none',
        '[&_svg]:size-2.5 [&_svg]:shrink-0',
        color && 'text-white',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </Badge>
  );
}

export interface InlineDetailCardProps {
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  accent?: string;
  accentLabel?: string;
  icon?: ReactNode;
  badges?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Container query name prefix for responsive padding. */
  containerName?: string;
  size?: DetailModalProps['size'];
  bodyClassName?: string;
}

/**
 * Existing domain fichas use the standard DetailModal surface.
 * See `.claude/sops/inline-detail-surfaces.md`.
 */
export function InlineDetailCard({
  onClose,
  title,
  description,
  accent,
  accentLabel,
  icon,
  badges,
  footer,
  children,
  className,
  containerName = 'detail-card',
  size = 'reading',
  bodyClassName,
}: InlineDetailCardProps) {
  return (
    <DetailModal onClose={onClose} title={title} description={description} icon={icon}
      size={size} className={cn(`@container/${containerName}`, className)} bodyClassName={bodyClassName}
      badges={accentLabel || badges ? <>{accentLabel ? <ColorPill color={accent}>{accentLabel}</ColorPill> : null}{badges}</> : undefined}
      footer={footer}>
      {children}
    </DetailModal>
  );
}
