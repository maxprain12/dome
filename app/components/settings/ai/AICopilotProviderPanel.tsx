import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import ModelSelector from '../ModelSelector';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import type { TestResult } from './aiSectionHelpers';

export interface AICopilotProviderPanelProps {
  model: string;
  onModelChange: (model: string) => void;
  onTestResult: (result: TestResult | null) => void;
}

export default function AICopilotProviderPanel({
  model,
  onModelChange,
  onTestResult,
}: AICopilotProviderPanelProps) {
  const { t } = useTranslation();
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotConnecting, setCopilotConnecting] = useState(false);
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);

  const { models: copilotVisibleModels } = useProviderModels({
    provider: 'copilot',
    applyVisibleFilter: true,
  });

  const refreshCopilotStatus = useCallback(async () => {
    if (!window.electron?.copilotAuth) return;
    try {
      const s = await window.electron.copilotAuth.status();
      setCopilotConnected(s.success && s.connected === true);
    } catch {
      setCopilotConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshCopilotStatus();
  }, [refreshCopilotStatus]);

  const handleConnectCopilot = async () => {
    if (!window.electron?.copilotAuth) {
      onTestResult({ success: false, message: 'GitHub Copilot no disponible en esta versión.' });
      return;
    }
    setCopilotConnecting(true);
    setCopilotUserCode(null);
    onTestResult(null);
    try {
      const started = await window.electron.copilotAuth.start();
      if (!started.success || !started.deviceCode || !started.userCode) {
        onTestResult({
          success: false,
          message: started.error || 'No se pudo iniciar el login de GitHub Copilot.',
        });
        return;
      }
      setCopilotUserCode(started.userCode);
      const result = await window.electron.copilotAuth.poll({
        deviceCode: started.deviceCode,
        interval: started.interval,
        expiresIn: started.expiresIn,
      });
      if (result.success) {
        setCopilotConnected(true);
        onTestResult({ success: true, message: t('settings.ai.copilot_connected_ok') });
      } else {
        onTestResult({
          success: false,
          message: result.error || t('settings.ai.copilot_connect_failed'),
        });
      }
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setCopilotConnecting(false);
      setCopilotUserCode(null);
    }
  };

  const handleDisconnectCopilot = async () => {
    if (!window.electron?.copilotAuth) return;
    try {
      await window.electron.copilotAuth.disconnect();
      setCopilotConnected(false);
      onTestResult({ success: true, message: t('settings.ai.copilot_disconnected') });
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'No se pudo desconectar.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">{t('settings.ai.copilot_connect_title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('settings.ai.copilot_connect_desc')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={copilotConnected ? 'secondary' : 'outline'}>
          {copilotConnected
            ? t('settings.ai.status_connected')
            : t('settings.ai.status_disconnected')}
        </Badge>
        <Button
          type="button"
          onClick={() => {
            handleConnectCopilot().catch(() => {});
          }}
          disabled={copilotConnecting}
        >
          {copilotConnecting ? <Spinner data-icon="inline-start" /> : null}
          {copilotConnecting
            ? t('settings.ai.connecting')
            : copilotConnected
              ? t('settings.ai.reconnect')
              : t('settings.ai.copilot_connect')}
        </Button>
        {copilotConnected ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              handleDisconnectCopilot().catch(() => {});
            }}
          >
            {t('settings.ai.disconnect')}
          </Button>
        ) : null}
      </div>
      {copilotConnecting && copilotUserCode ? (
        <Alert>
          <AlertDescription>
            <span>{t('settings.ai.copilot_enter_code')}</span>
            <code className="ml-2 font-mono text-base font-semibold tracking-widest">
              {copilotUserCode}
            </code>
          </AlertDescription>
        </Alert>
      ) : null}
      {copilotConnected && copilotVisibleModels.length > 0 ? (
        <Field>
          <FieldLabel>{t('settings.ai.model')}</FieldLabel>
          <ModelSelector
            models={copilotVisibleModels}
            selectedModelId={model}
            onChange={onModelChange}
            showBadges
            searchable={copilotVisibleModels.length > 5}
            placeholder={t('settings.ai.model')}
            providerType="cloud"
            providerId="copilot"
            configuredHint
          />
        </Field>
      ) : null}
    </div>
  );
}
