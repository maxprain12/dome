import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CopyIcon,
  Delete02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';

type PairingState = {
  active: boolean;
  code?: string;
  expiresAt?: number | null;
};

type PresenceDevice = {
  id: string;
  kind: 'desktop' | 'companion';
  displayName: string;
  online: boolean;
  revoked?: boolean;
};

interface RemoteStatus {
  enabled: boolean;
  connected: boolean;
  displayName?: string;
  pairing?: PairingState | null;
  lastError?: string | null;
}

const EMPTY: RemoteStatus = { enabled: false, connected: false, pairing: null, lastError: null };

export default function RemoteManySection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RemoteStatus>(EMPTY);
  const [devices, setDevices] = useState<PresenceDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await window.electron.remoteMany.status();
      if (!result?.success) {
        setError(result?.error ?? t('remote_many.error_generic'));
        return;
      }
      setStatus(result.data ?? EMPTY);
      setError(null);
      if (!result.data?.enabled) {
        setDevices([]);
        return;
      }
      const presence = await window.electron.remoteMany.presence();
      if (presence?.success) {
        const rows = (presence.data?.devices ?? []) as PresenceDevice[];
        setDevices(rows.filter((row) => row.kind === 'companion' && !row.revoked));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('remote_many.error_generic'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const unsubscribe = window.electron.remoteMany.onStatus(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

  const onToggle = (checked: boolean) => {
    window.electron.remoteMany
      .setEnabled({ enabled: checked })
      .then((result) => {
        if (!result?.success) setError(result?.error ?? t('remote_many.error_generic'));
        else void load();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('remote_many.error_generic'));
      });
  };

  const onPair = () => {
    window.electron.remoteMany
      .pairStart()
      .then((result) => {
        if (!result?.success) setError(result?.error ?? t('remote_many.error_generic'));
        else void load();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('remote_many.error_generic'));
      });
  };

  const onCancel = () => {
    window.electron.remoteMany
      .pairCancel()
      .then(() => load())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('remote_many.error_generic'));
      });
  };

  const onCopy = () => {
    const code = status.pairing?.code;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      setError(t('remote_many.error_generic'));
    });
  };

  const onRevoke = (deviceId: string) => {
    window.electron.remoteMany
      .revoke({ deviceId })
      .then((result) => {
        if (!result?.success) setError(result?.error ?? t('remote_many.error_generic'));
        else void load();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('remote_many.error_generic'));
      });
  };

  return (
    <SettingsSurface
      title={t('remote_many.title')}
      description={t('remote_many.subtitle')}
    >
      {error ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup title={t('remote_many.status_label')}>
        <SettingsRow
          title={t('remote_many.enable')}
          description={t('remote_many.enable_desc')}
          control={
            <Switch
              checked={status.enabled}
              onCheckedChange={onToggle}
              aria-label={t('remote_many.enable')}
            />
          }
        />
        <SettingsRow
          title={t('remote_many.connection')}
          description={
            status.connected
              ? t('remote_many.status_online', { name: status.displayName || t('remote_many.this_mac') })
              : t('remote_many.status_offline')
          }
          control={
            <Badge variant={status.connected ? 'default' : 'secondary'}>
              {status.connected ? t('remote_many.online') : t('remote_many.offline')}
            </Badge>
          }
        />
        <SettingsRow title={t('remote_many.refresh_row')} description={t('remote_many.refresh_desc')}>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <HugeiconsIcon icon={RefreshIcon} className="size-4" />
            {t('remote_many.refresh')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('remote_many.pair_label')}>
        <SettingsRow title={t('remote_many.pair_code')} description={t('remote_many.pair_desc')}>
          <div className="flex flex-wrap items-center gap-2">
            {status.pairing?.code ? (
              <>
                <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-widest">
                  {status.pairing.code}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={onCopy}>
                  <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : CopyIcon} className="size-4" />
                  {copied ? t('remote_many.copied') : t('remote_many.copy')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                  {t('remote_many.cancel_code')}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={onPair} disabled={!status.enabled}>
                {t('remote_many.generate_code')}
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('remote_many.devices_label')}>
        {devices.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{t('remote_many.no_devices')}</p>
        ) : (
          devices.map((device) => (
            <SettingsRow
              key={device.id}
              title={device.displayName}
              description={device.online ? t('remote_many.device_online') : t('remote_many.device_offline')}
            >
              <Button type="button" variant="ghost" size="sm" onClick={() => onRevoke(device.id)}>
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                {t('remote_many.revoke')}
              </Button>
            </SettingsRow>
          ))
        )}
      </SettingsGroup>
    </SettingsSurface>
  );
}
