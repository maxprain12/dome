import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ComputerIcon, Mic01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useMediaPermissions } from '@/lib/permissions/useMediaPermissions';
import type { MediaPermissionKind, MediaPermissionStatus } from '@/lib/permissions/types';
import { cn } from '@/lib/utils';

const KIND_ICON = {
  microphone: Mic01Icon,
  screen: ComputerIcon,
} as const;

const STATUS_CLASS: Record<MediaPermissionStatus, string> = {
  granted: 'text-success',
  denied: 'text-destructive',
  restricted: 'text-destructive',
  'not-determined': 'text-warning',
  unknown: 'text-muted-foreground',
};

function statusKey(status: MediaPermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'permissions.status_granted';
    case 'denied':
      return 'permissions.status_denied';
    case 'restricted':
      return 'permissions.status_restricted';
    case 'not-determined':
      return 'permissions.status_not_determined';
    case 'unknown':
      return 'permissions.status_unknown';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

interface PermissionCalloutProps {
  kinds: MediaPermissionKind[];
  /** Only list permissions that still need action (popover / inline use). */
  hideGranted?: boolean;
  className?: string;
}

/** OS permission rows with the right next step: prompt, System Settings, or relaunch. */
export default function PermissionCallout({ kinds, hideGranted = false, className }: PermissionCalloutProps) {
  const { t } = useTranslation();
  const { snapshot, loading, grantedThisSession, request, openSettings, relaunch } = useMediaPermissions();

  if (!snapshot.managedByApp) {
    if (hideGranted) return null;
    return <p className={cn('text-xs text-muted-foreground', className)}>{t('permissions.os_managed')}</p>;
  }

  const visible = hideGranted ? kinds.filter((kind) => snapshot[kind] !== 'granted') : kinds;
  const needsRelaunch = kinds.includes('screen') && grantedThisSession.has('screen');
  if (visible.length === 0 && !needsRelaunch) return null;

  const onAction = (kind: MediaPermissionKind, status: MediaPermissionStatus) => {
    const action = status === 'denied' || status === 'restricted' ? openSettings(kind) : request(kind);
    action.catch(() => undefined);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visible.map((kind) => {
        const status = snapshot[kind];
        const blocked = status === 'denied' || status === 'restricted';
        return (
          <div key={kind} className="flex items-start gap-3 rounded-xl border p-3">
            <HugeiconsIcon icon={KIND_ICON[kind]} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{t(`permissions.${kind}_title`)}</span>
              <span className="text-xs text-muted-foreground">{t(`permissions.${kind}_why`)}</span>
              <span className={cn('text-xs', STATUS_CLASS[status])}>{t(statusKey(status))}</span>
            </div>
            {status === 'granted' ? null : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={loading}
                onClick={() => onAction(kind, status)}
                className="shrink-0"
              >
                {loading ? <Spinner data-icon="inline-start" /> : null}
                {blocked ? t('permissions.open_settings') : t('permissions.request')}
              </Button>
            )}
          </div>
        );
      })}
      {needsRelaunch ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted p-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t('permissions.screen_relaunch_hint')}</p>
          <Button
            type="button"
            size="xs"
            onClick={() => {
              relaunch().catch(() => undefined);
            }}
            className="shrink-0"
          >
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            {t('permissions.relaunch')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
