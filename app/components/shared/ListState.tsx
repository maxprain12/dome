import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface ListStateProps {
  variant: 'loading' | 'empty' | 'error';
  loadingLabel?: string;
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  /** Ocupa altura completa (p. ej. estados de página). */
  fullHeight?: boolean;
}

function listStatePadding(compact?: boolean): string {
  return compact ? 'py-10' : 'py-14';
}

function ListStateLoading({
  loadingLabel,
  fullHeight,
  py,
}: {
  loadingLabel: string;
  fullHeight?: boolean;
  py: string;
}) {
  return (
    <output
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4',
        fullHeight ? 'h-full p-8 gap-4' : py,
      )}
      aria-live="polite"
    >
      <Spinner
        className={cn(
          'animate-spin motion-reduce:animate-none',
          fullHeight ? 'size-8 text-primary' : 'size-5 text-muted-foreground',
        )}
        aria-hidden
      />
      <p className={cn('text-center', fullHeight ? 'text-sm text-muted-foreground' : 'text-xs text-muted-foreground')}>
        {loadingLabel}
      </p>
    </output>
  );
}

function ListStateError({
  errorMessage,
  onRetry,
  retryLabel,
  action,
  fullHeight,
  py,
}: {
  errorMessage: string;
  onRetry?: () => void;
  retryLabel: string;
  action?: ReactNode;
  fullHeight?: boolean;
  py: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 text-center',
        fullHeight ? 'h-full p-8 gap-4' : py,
      )}
    >
      <HugeiconsIcon icon={Alert02Icon} className="size-12 shrink-0 text-destructive" aria-hidden />
      <p className={cn('font-medium text-destructive', fullHeight ? 'text-sm max-w-md' : 'text-sm')}>
        {errorMessage}
      </p>
      {onRetry ? (
        <Button type="button" onClick={onRetry} size="sm">
          {retryLabel}
        </Button>
      ) : null}
      {action}
    </div>
  );
}

function ListStateEmpty({
  icon,
  title,
  description,
  action,
  fullHeight,
  py,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  fullHeight?: boolean;
  py: string;
}) {
  return (
    <Empty className={cn('border-0 px-6', fullHeight ? 'h-full p-8' : py)}>
      {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
      <EmptyHeader>
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

/**
 * Estados unificados: carga, vacío y error (hub y vistas generales).
 */
export default function ListState({
  variant,
  loadingLabel,
  icon,
  title,
  description,
  action,
  errorMessage,
  onRetry,
  retryLabel,
  compact,
  fullHeight,
}: ListStateProps) {
  const { t } = useTranslation();
  const py = listStatePadding(compact);
  const retry = retryLabel ?? t('ui.try_again');

  if (variant === 'loading') {
    return (
      <ListStateLoading
        loadingLabel={loadingLabel ?? t('ui.loading')}
        fullHeight={fullHeight}
        py={py}
      />
    );
  }

  if (variant === 'error') {
    return (
      <ListStateError
        errorMessage={errorMessage ?? 'Error'}
        onRetry={onRetry}
        retryLabel={retry}
        action={action}
        fullHeight={fullHeight}
        py={py}
      />
    );
  }

  return (
    <ListStateEmpty
      icon={icon}
      title={title}
      description={description}
      action={action}
      fullHeight={fullHeight}
      py={py}
    />
  );
}
