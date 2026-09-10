import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CopyIcon,
  Delete02Icon,
  Link01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';

type PairingState = { active: boolean; expiresAt: number | null };
type ClientRow = { id: string; name: string; createdAt: number; lastSeenAt: number };

interface BridgeStatus {
  running: boolean;
  port: number | null;
  pairing: PairingState;
  clients: ClientRow[];
}

const EMPTY_STATUS: BridgeStatus = {
  running: false,
  port: null,
  pairing: { active: false, expiresAt: null },
  clients: [],
};

export default function BrowserExtensionSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BridgeStatus>(EMPTY_STATUS);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await window.electron?.browserExtension?.status?.();
      if (!result?.success || !result.data) return;
      setStatus({
        running: Boolean(result.data.running),
        port: result.data.port ?? null,
        pairing: result.data.pairing ?? { active: false, expiresAt: null },
        clients: Array.isArray(result.data.clients) ? result.data.clients : [],
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const startPairing = async () => {
    setError(null);
    try {
      const result = await window.electron?.browserExtension?.pairStart?.();
      if (!result?.success || !result.data?.code) {
        setError(result?.error ?? t('browser_extension.error_generic'));
        return;
      }
      setCode(result.data.code);
      setExpiresAt(result.data.expiresAt);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('browser_extension.error_generic'));
    }
  };

  const cancelPairing = async () => {
    setError(null);
    try {
      await window.electron?.browserExtension?.pairCancel?.();
      setCode(null);
      setExpiresAt(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('browser_extension.error_generic'));
    }
  };

  const revoke = async (clientId: string) => {
    setError(null);
    try {
      const result = await window.electron?.browserExtension?.revoke?.({ clientId });
      if (!result?.success) setError(result?.error ?? t('browser_extension.error_generic'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('browser_extension.error_generic'));
    }
  };

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SettingsSurface
      title={t('browser_extension.title')}
      description={t('browser_extension.subtitle')}
    >
      {error ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup title={t('browser_extension.status_label')}>
        <SettingsRow title={t('browser_extension.bridge')} description={t('browser_extension.bridge_desc')}>
          <div className="flex items-center gap-2">
            <Badge variant={status.running ? 'default' : 'secondary'}>
              {status.running
                ? t('browser_extension.status_running', { port: status.port ?? 37215 })
                : t('browser_extension.status_stopped')}
            </Badge>
            <Button type="button" variant="ghost" size="sm" onClick={() => refresh()}>
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              {t('browser_extension.refresh')}
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('browser_extension.pair_label')}>
        <SettingsRow title={t('browser_extension.pair_code')} description={t('browser_extension.pair_desc')}>
          <div className="flex flex-col items-end gap-2">
            {code ? (
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-lg tracking-[0.3em]">{code}</code>
                <Button type="button" variant="ghost" size="sm" onClick={() => { copyCode().catch(() => {}); }}>
                  <HugeiconsIcon
                    icon={copied ? CheckmarkCircle02Icon : CopyIcon}
                    data-icon="inline-start"
                  />
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" onClick={() => { startPairing().catch(() => {}); }}>
                <HugeiconsIcon icon={Link01Icon} data-icon="inline-start" />
                {t('browser_extension.generate_code')}
              </Button>
              {code || status.pairing.active ? (
                <Button type="button" variant="outline" onClick={() => { cancelPairing().catch(() => {}); }}>
                  {t('browser_extension.cancel_code')}
                </Button>
              ) : null}
            </div>
            {expiresAt ? (
              <p className="text-xs text-muted-foreground">
                {t('browser_extension.code_expires')}
              </p>
            ) : null}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('browser_extension.clients_label')}>
        {status.clients.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{t('browser_extension.no_clients')}</p>
        ) : (
          status.clients.map((client) => (
            <SettingsRow key={client.id} title={client.name} description={t('browser_extension.client_seen')}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { revoke(client.id).catch(() => {}); }}
              >
                <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                {t('browser_extension.revoke')}
              </Button>
            </SettingsRow>
          ))
        )}
      </SettingsGroup>
    </SettingsSurface>
  );
}
