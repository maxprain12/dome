import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import ModelSelector from '../ModelSelector';
import type { ModelDefinition } from '@/lib/ai/models';
import type { TestResult } from './aiSectionHelpers';

export interface AIClaudeOAuthProviderPanelProps {
  model: string;
  onModelChange: (model: string) => void;
  models: ModelDefinition[];
  onTestResult: (result: TestResult | null) => void;
}

export default function AIClaudeOAuthProviderPanel({
  model,
  onModelChange,
  models,
  onTestResult,
}: AIClaudeOAuthProviderPanelProps) {
  const { t } = useTranslation();
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [claudeConnecting, setClaudeConnecting] = useState(false);

  const refreshClaudeStatus = useCallback(async () => {
    if (!window.electron?.claudeAuth) return;
    try {
      const s = await window.electron.claudeAuth.status();
      setClaudeConnected(s.success && s.connected === true);
    } catch {
      setClaudeConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshClaudeStatus();
  }, [refreshClaudeStatus]);

  const handleConnectClaude = async () => {
    if (!window.electron?.claudeAuth) {
      onTestResult({ success: false, message: t('settings.ai.claude_oauth_unavailable') });
      return;
    }
    setClaudeConnecting(true);
    onTestResult(null);
    try {
      const result = await window.electron.claudeAuth.login();
      if (result.success) {
        setClaudeConnected(true);
        onTestResult({ success: true, message: t('settings.ai.claude_oauth_connected_ok') });
      } else {
        onTestResult({
          success: false,
          message: result.error || t('settings.ai.claude_oauth_connect_failed'),
        });
      }
    } catch (error) {
      onTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.claude_oauth_connect_failed'),
      });
    } finally {
      setClaudeConnecting(false);
    }
  };

  const handleDisconnectClaude = async () => {
    if (!window.electron?.claudeAuth) return;
    try {
      await window.electron.claudeAuth.disconnect();
      setClaudeConnected(false);
      onTestResult({ success: true, message: t('settings.ai.claude_oauth_disconnected') });
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
        <p className="text-sm font-medium">{t('settings.ai.claude_oauth_connect_title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('settings.ai.claude_oauth_connect_desc')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={claudeConnected ? 'secondary' : 'outline'}>
          {claudeConnected
            ? t('settings.ai.status_connected')
            : t('settings.ai.status_disconnected')}
        </Badge>
        <Button
          type="button"
          onClick={() => {
            handleConnectClaude().catch(() => {});
          }}
          disabled={claudeConnecting}
        >
          {claudeConnecting ? <Spinner data-icon="inline-start" /> : null}
          {claudeConnecting
            ? t('settings.ai.connecting')
            : claudeConnected
              ? t('settings.ai.reconnect')
              : t('settings.ai.claude_oauth_connect')}
        </Button>
        {claudeConnected ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              handleDisconnectClaude().catch(() => {});
            }}
          >
            {t('settings.ai.disconnect')}
          </Button>
        ) : null}
      </div>
      {claudeConnected && models.length > 0 ? (
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
            providerId="claude-oauth"
            configuredHint
          />
        </Field>
      ) : null}
    </div>
  );
}
