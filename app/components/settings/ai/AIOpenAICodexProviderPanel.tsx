import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import ModelSelector from '../ModelSelector';
import type { ModelDefinition } from '@/lib/ai/models';
import type { TestResult } from './aiSectionHelpers';

export interface AIOpenAICodexProviderPanelProps {
  model: string;
  onModelChange: (model: string) => void;
  models: ModelDefinition[];
  onTestResult: (result: TestResult | null) => void;
}

export default function AIOpenAICodexProviderPanel({
  model,
  onModelChange,
  models,
  onTestResult,
}: AIOpenAICodexProviderPanelProps) {
  const { t } = useTranslation();
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexUserCode, setCodexUserCode] = useState<string | null>(null);

  const refreshCodexStatus = useCallback(async () => {
    if (!window.electron?.openaiCodexAuth) return;
    try {
      const s = await window.electron.openaiCodexAuth.status();
      setCodexConnected(s.success && s.connected === true);
    } catch {
      setCodexConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshCodexStatus();
  }, [refreshCodexStatus]);

  const handleConnectCodex = async () => {
    if (!window.electron?.openaiCodexAuth) {
      onTestResult({ success: false, message: t('settings.ai.openai_codex_unavailable') });
      return;
    }
    setCodexConnecting(true);
    setCodexUserCode(null);
    onTestResult(null);
    const unsubscribe = window.electron.openaiCodexAuth.onDeviceCode?.((info) => {
      setCodexUserCode(info.userCode);
    });
    try {
      const result = await window.electron.openaiCodexAuth.login();
      if (result.success) {
        setCodexConnected(true);
        onTestResult({ success: true, message: t('settings.ai.openai_codex_connected_ok') });
      } else {
        onTestResult({
          success: false,
          message: result.error || t('settings.ai.openai_codex_connect_failed'),
        });
      }
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.openai_codex_connect_failed'),
      });
    } finally {
      unsubscribe?.();
      setCodexConnecting(false);
      setCodexUserCode(null);
    }
  };

  const handleDisconnectCodex = async () => {
    if (!window.electron?.openaiCodexAuth) return;
    try {
      await window.electron.openaiCodexAuth.disconnect();
      setCodexConnected(false);
      onTestResult({ success: true, message: t('settings.ai.openai_codex_disconnected') });
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.disconnect_failed'),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">{t('settings.ai.openai_codex_connect_title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('settings.ai.openai_codex_connect_desc')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={codexConnected ? 'secondary' : 'outline'}>
          {codexConnected
            ? t('settings.ai.status_connected')
            : t('settings.ai.status_disconnected')}
        </Badge>
        <Button
          type="button"
          onClick={() => {
            handleConnectCodex().catch(() => {});
          }}
          disabled={codexConnecting}
        >
          {codexConnecting ? <Spinner data-icon="inline-start" /> : null}
          {codexConnecting
            ? t('settings.ai.connecting')
            : codexConnected
              ? t('settings.ai.reconnect')
              : t('settings.ai.openai_codex_connect')}
        </Button>
        {codexConnected ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              handleDisconnectCodex().catch(() => {});
            }}
          >
            {t('settings.ai.disconnect')}
          </Button>
        ) : null}
      </div>
      {codexConnecting && codexUserCode ? (
        <Alert>
          <AlertDescription>
            <span>{t('settings.ai.openai_codex_enter_code')}</span>
            <code className="ml-2 font-mono text-base font-semibold tracking-widest">
              {codexUserCode}
            </code>
          </AlertDescription>
        </Alert>
      ) : null}
      {codexConnected && models.length > 0 ? (
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
            providerId="openai-codex"
            configuredHint
          />
        </Field>
      ) : null}
    </div>
  );
}
