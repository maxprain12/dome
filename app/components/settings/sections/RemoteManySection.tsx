import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { Spinner } from '@/components/ui/spinner';
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

const KNOWN_ERROR_CODES = new Set([
  'desktop_unavailable',
  'companion_unavailable',
  'pairing_code_invalid',
  'pairing_inactive',
  'device_kind_conflict',
  'unauthorized',
  'network',
]);

function normalizeErrorCode(raw: string): string {
  const code = raw.trim();
  if (/^remote_http_401$|unauthori[sz]ed|not_connected|no_session/i.test(code)) return 'unauthorized';
  if (/fetch failed|network|ECONN|ENOTFOUND|timeout|aborted/i.test(code)) return 'network';
  return code;
}

function remoteErrorMessage(t: TFunction, raw: unknown): string {
  let text = '';
  if (raw instanceof Error) text = raw.message;
  else if (typeof raw === 'string') text = raw;
  const code = normalizeErrorCode(text);
  if (KNOWN_ERROR_CODES.has(code)) return t(`remote_many.errors.${code}`);
  return t('remote_many.error_generic');
}

export default function RemoteManySection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RemoteStatus>(EMPTY);
  const [devices, setDevices] = useState<PresenceDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pairing, setPairing] = useState(false);

  const fail = useCallback((raw: unknown) => setError(remoteErrorMessage(t, raw)), [t]);

  const load = useCallback(async () => {
    try {
      const result = await window.electron.remoteMany.status();
      if (!result?.success) {
        fail(result?.error);
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
      fail(err);
    }
  }, [fail]);

  const refresh = useCallback(() => {
    load().catch(fail);
  }, [load, fail]);

  useEffect(() => {
    refresh();
    const unsubscribe = window.electron.remoteMany.onStatus(refresh);
    return () => {
      unsubscribe?.();
    };
  }, [refresh]);

  const onToggle = (checked: boolean) => {
    window.electron.remoteMany
      .setEnabled({ enabled: checked })
      .then((result) => {
        if (result?.success) refresh();
        else fail(result?.error);
      })
      .catch(fail);
  };

  const onPair = () => {
    setPairing(true);
    setError(null);
    window.electron.remoteMany
      .pairStart()
      .then((result) => {
        if (result?.success) refresh();
        else fail(result?.error);
      })
      .catch(fail)
      .finally(() => setPairing(false));
  };

  const onCancel = () => {
    window.electron.remoteMany
      .pairCancel()
      .then(refresh)
      .catch(fail);
  };

  const onCopy = () => {
    const code = status.pairing?.code;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    }).catch(fail);
  };

  const onRevoke = (deviceId: string) => {
    window.electron.remoteMany
      .revoke({ deviceId })
      .then((result) => {
        if (result?.success) refresh();
        else fail(result?.error);
      })
      .catch(fail);
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
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <HugeiconsIcon icon={RefreshIcon} className="size-4" />
            {t('remote_many.refresh')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('remote_many.pair_label')}>
        <SettingsRow
          title={t('remote_many.pair_code')}
          description={status.enabled ? t('remote_many.pair_desc') : t('remote_many.pair_requires_enable')}
        >
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
              <Button type="button" size="sm" onClick={onPair} disabled={!status.enabled || pairing}>
                {pairing ? <Spinner className="size-4" /> : null}
                {pairing ? t('remote_many.generating_code') : t('remote_many.generate_code')}
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
