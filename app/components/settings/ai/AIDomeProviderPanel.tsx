import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CloudIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import ModelSelector from '../ModelSelector';
import type { ModelDefinition } from '@/lib/ai/models';
import { formatTokens, type DomeQuota, type TestResult } from './aiSectionHelpers';

export interface AIDomeProviderPanelProps {
  model: string;
  onModelChange: (model: string) => void;
  models: ModelDefinition[];
  modelsLoading: boolean;
  onTestResult: (result: TestResult | null) => void;
}

export default function AIDomeProviderPanel({
  model,
  onModelChange,
  models,
  modelsLoading,
  onTestResult,
}: AIDomeProviderPanelProps) {
  const { t } = useTranslation();
  const [domeConnected, setDomeConnected] = useState(false);
  const [domeConnecting, setDomeConnecting] = useState(false);
  const [domeEmail, setDomeEmail] = useState('');
  const [domePassword, setDomePassword] = useState('');
  const [domeLoggingIn, setDomeLoggingIn] = useState(false);
  const [domeQuota, setDomeQuota] = useState<DomeQuota | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);

  const refreshDomeSession = useCallback(async () => {
    if (!window.electron?.domeAuth) return;
    try {
      const session = await window.electron.domeAuth.getSession();
      const connected = session.success && session.connected === true;
      setDomeConnected(connected);
      if (connected && window.electron.domeAuth.getQuota) {
        const quotaRes = await window.electron.domeAuth.getQuota();
        if (quotaRes.success && quotaRes.planId) {
          setDomeQuota({
            planId: quotaRes.planId,
            limit: quotaRes.limit,
            used: quotaRes.used,
            remaining: quotaRes.remaining,
            periodEnd: quotaRes.periodEnd,
            subscriptionStatus: quotaRes.subscriptionStatus,
          });
        } else {
          setDomeQuota(null);
        }
      } else {
        setDomeQuota(null);
      }
    } catch {
      setDomeConnected(false);
      setDomeQuota(null);
    }
  }, []);

  const refreshCloudSyncStatus = useCallback(async () => {
    if (!window.electron?.domainSync?.getStatus || !domeConnected) {
      setCloudSyncMsg(null);
      return;
    }
    try {
      const s = await window.electron.domainSync.getStatus();
      if (s.success && s.domains) {
        const domains = s.domains as Record<string, { lastPushAt?: number }>;
        const last = Math.max(0, ...Object.values(domains).map((d) => d?.lastPushAt ?? 0));
        setCloudSyncMsg(last > 0 ? new Date(last).toLocaleString() : null);
      } else {
        setCloudSyncMsg(null);
      }
    } catch {
      setCloudSyncMsg(null);
    }
  }, [domeConnected]);

  useEffect(() => {
    refreshDomeSession();
  }, [refreshDomeSession]);

  useEffect(() => {
    refreshCloudSyncStatus();
  }, [refreshCloudSyncStatus]);

  useEffect(() => {
    const onFocus = () => {
      refreshDomeSession();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDomeSession]);

  const handleDomePasswordLogin = async () => {
    if (!window.electron?.domeAuth?.nativeLogin) {
      onTestResult({ success: false, message: 'Login nativo no disponible en esta versión.' });
      return;
    }
    const email = domeEmail.trim();
    if (!email || !domePassword) return;
    setDomeLoggingIn(true);
    onTestResult(null);
    try {
      const result = await window.electron.domeAuth.nativeLogin(email, domePassword, false);
      if (!result.success) {
        const messages: Record<string, string> = {
          invalid_credentials: t('settings.ai.dome_login_invalid_credentials'),
          network_error: t('settings.ai.dome_login_network_error'),
        };
        onTestResult({
          success: false,
          message:
            (result.errorCode && messages[result.errorCode]) ||
            result.error ||
            t('settings.ai.dome_login_failed'),
        });
        return;
      }
      setDomePassword('');
      await refreshDomeSession();
      onTestResult({ success: true, message: t('settings.ai.dome_login_ok') });
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.dome_login_failed'),
      });
    } finally {
      setDomeLoggingIn(false);
    }
  };

  const handleConnectDome = async () => {
    if (!window.electron?.domeAuth) {
      onTestResult({ success: false, message: 'Dome OAuth no disponible en esta versión.' });
      return;
    }
    setDomeConnecting(true);
    onTestResult(null);
    try {
      const result = await window.electron.domeAuth.openDashboard();
      onTestResult(
        result.success
          ? {
              success: true,
              message: 'Dashboard abierto. Inicia sesión y haz clic en "Conectar Dome Desktop".',
            }
          : { success: false, message: result.error || 'No se pudo abrir el dashboard.' },
      );
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setDomeConnecting(false);
    }
  };

  const handleDisconnectDome = async () => {
    if (!window.electron?.domeAuth) return;
    try {
      await window.electron.domeAuth.disconnect();
      setDomeConnected(false);
      onTestResult({ success: true, message: 'Cuenta de Dome desconectada.' });
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'No se pudo desconectar.',
      });
    }
  };

  const handleCloudSyncNow = async () => {
    if (!window.electron?.domainSync?.syncNow) return;
    setCloudSyncBusy(true);
    try {
      const r = await window.electron.domainSync.syncNow({});
      if (!r?.success && !r?.skipped) {
        setCloudSyncMsg(r?.error || t('settings.ai.cloud_sync_error'));
        return;
      }
      await refreshCloudSyncStatus();
    } catch (e) {
      setCloudSyncMsg(e instanceof Error ? e.message : t('settings.ai.cloud_sync_error'));
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const showQuota = Boolean(domeConnected && domeQuota && domeQuota.planId !== 'unsubscribed');
  const quotaPct =
    domeQuota?.limit && domeQuota.limit > 0
      ? Math.min(((domeQuota.used ?? 0) / domeQuota.limit) * 100, 100)
      : 0;
  const quotaLabel =
    domeQuota?.used != null && domeQuota.limit != null
      ? `${formatTokens(domeQuota.used)} / ${formatTokens(domeQuota.limit)}`
      : '—';

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">{t('settings.ai.dome_connect_title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('settings.ai.dome_connect_desc')}</p>
      </div>

      {!domeConnected ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleDomePasswordLogin().catch(() => {});
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dome-email">{t('settings.ai.dome_login_email')}</FieldLabel>
              <Input
                id="dome-email"
                type="email"
                autoComplete="email"
                value={domeEmail}
                onChange={(event) => setDomeEmail(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dome-password">{t('settings.ai.dome_login_password')}</FieldLabel>
              <Input
                id="dome-password"
                type="password"
                autoComplete="current-password"
                value={domePassword}
                onChange={(event) => setDomePassword(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={domeLoggingIn || !domeEmail.trim() || !domePassword}>
              {domeLoggingIn ? <Spinner data-icon="inline-start" /> : null}
              {domeLoggingIn ? t('settings.ai.connecting') : t('settings.ai.dome_login_submit')}
            </Button>
          </FieldGroup>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={domeConnected ? 'secondary' : 'outline'}>
          {domeConnected
            ? t('settings.ai.status_connected')
            : t('settings.ai.status_disconnected')}
        </Badge>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            handleConnectDome().catch(() => {});
          }}
          disabled={domeConnecting}
        >
          {domeConnecting ? <Spinner data-icon="inline-start" /> : null}
          {domeConnecting
            ? t('settings.ai.connecting')
            : domeConnected
              ? t('settings.ai.reconnect')
              : t('settings.ai.dome_login_via_dashboard')}
        </Button>
        {domeConnected ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              handleDisconnectDome().catch(() => {});
            }}
          >
            {t('settings.ai.disconnect')}
          </Button>
        ) : null}
      </div>

      {domeConnected ? (
        <Field>
          <FieldLabel>{t('settings.ai.model')}</FieldLabel>
          <ModelSelector
            models={models}
            selectedModelId={model}
            onChange={onModelChange}
            showBadges
            searchable={models.length > 5}
            placeholder={t('settings.ai.model')}
            providerType="cloud"
            providerId="dome"
            configuredHint
          />
          {modelsLoading ? (
            <p className="text-xs text-muted-foreground">{t('settings.ai.loading_models')}</p>
          ) : null}
        </Field>
      ) : null}

      {showQuota ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t('settings.ai.usage_period')}</p>
            <p className="text-xs tabular-nums text-muted-foreground">{quotaLabel}</p>
          </div>
          <Progress value={quotaPct} />
          {domeQuota?.periodEnd ? (
            <p className="text-xs text-muted-foreground">
              {t('settings.ai.renewal')}: {new Date(domeQuota.periodEnd).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {domeConnected ? (
        <Alert>
          <HugeiconsIcon icon={CloudIcon} />
          <AlertDescription className="flex flex-col gap-3">
            <span>{t('settings.ai.cloud_sync_desc')}</span>
            {cloudSyncMsg ? <code className="break-all text-xs">{cloudSyncMsg}</code> : null}
            <Button
              type="button"
              size="sm"
              className="self-start"
              disabled={cloudSyncBusy}
              onClick={() => {
                handleCloudSyncNow().catch(() => {});
              }}
            >
              {cloudSyncBusy ? <Spinner data-icon="inline-start" /> : null}
              {cloudSyncBusy
                ? t('settings.ai.cloud_sync_busy')
                : t('settings.domain_sync.sync_now')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
