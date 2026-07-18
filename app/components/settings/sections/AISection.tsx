import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  BrainIcon,
  CheckmarkCircle02Icon,
  CloudIcon,
  Comment01Icon,
  Layers01Icon,
  Mic01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsGroup, SettingsSurface } from '../blocks';
import AIEmbeddingsTab from '../ai/AIEmbeddingsTab';
import AIWebSearchTab from '../ai/AIWebSearchTab';
import AgentContextSettingsTab from '../ai/AgentContextSettingsTab';
import AIProviderSelection from '../ai/AIProviderSelection';
import AICloudProviderConfig from '../ai/AICloudProviderConfig';
import AIOllamaProviderConfig from '../ai/AIOllamaProviderConfig';
import ProviderModelsConfigModal from '../ai/ProviderModelsConfigModal';
import ModelSelector from '../ModelSelector';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from '../TranscriptionSettingsSections';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import { PROVIDERS, getDefaultModelId, type AIProviderType } from '@/lib/ai/models';
import { resolveVisibleModelAfterSave, isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import { saveChatModelForProvider } from '@/lib/ai/client';
import type { OpenAIProviderSettingsDetail } from '@/lib/ai/open-provider-settings';
import { showToast } from '@/lib/store/useToastStore';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import { isOllamaCloudMissingApiKey } from '@/lib/ai/providerAuth';

type AISettingsTab = 'chat' | 'embeddings' | 'transcription' | 'tools' | 'context';

const TAB_DEFINITIONS: Array<{ value: AISettingsTab; labelKey: string; icon: IconSvgElement }> = [
  { value: 'chat', labelKey: 'settings.ai.tab_chat', icon: Comment01Icon },
  { value: 'embeddings', labelKey: 'settings.ai.tab_embeddings', icon: Layers01Icon },
  { value: 'transcription', labelKey: 'settings.ai.tab_transcription', icon: Mic01Icon },
  { value: 'tools', labelKey: 'settings.ai.tab_tools', icon: Search01Icon },
  { value: 'context', labelKey: 'settings.ai.tab_context', icon: BrainIcon },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function AISection() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [providerKeyStatus, setProviderKeyStatus] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState('gpt-5.2');
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [domeConnected, setDomeConnected] = useState(false);
  const [domeConnecting, setDomeConnecting] = useState(false);
  const [domeEmail, setDomeEmail] = useState('');
  const [domePassword, setDomePassword] = useState('');
  const [domeLoggingIn, setDomeLoggingIn] = useState(false);
  const [domeQuota, setDomeQuota] = useState<{
    planId?: string;
    limit?: number;
    used?: number;
    remaining?: number;
    periodEnd?: number;
    subscriptionStatus?: string;
  } | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotConnecting, setCopilotConnecting] = useState(false);
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);
  const transcriptionRef = useRef<TranscriptionSettingsSectionsHandle>(null);
  const [activeTab, setActiveTab] = useState<AISettingsTab>('chat');
  const [modelsConfigProvider, setModelsConfigProvider] = useState<AIProviderType | null>(null);

  const { models: currentProviderModels, loading: providerModelsLoading } = useProviderModels({
    provider,
    apiKey,
  });

  const { models: copilotVisibleModels } = useProviderModels({
    provider: 'copilot',
    applyVisibleFilter: true,
  });

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config) {
        const loadedProviderBase = (config.provider as string) === 'local' ? 'ollama' : config.provider;
        const loadedProvider =
          loadedProviderBase === 'dome' && !DOME_PROVIDER_ENABLED ? 'openai' : loadedProviderBase;
        setProvider(loadedProvider as AIProviderType);
        setApiKey(config.api_key || '');
        const defaultModel = getDefaultModelId(loadedProvider as AIProviderType);
        setModel(config.model || defaultModel);
        const providerModels = PROVIDERS[loadedProvider as AIProviderType]?.models || [];
        // Dome: los modelos del plan llegan del provider (no están en el
        // catálogo estático) — no son "modelos custom".
        if (
          loadedProvider !== 'dome' &&
          config.model &&
          !providerModels.find((m) => m.id === config.model)
        ) {
          setCustomModel(true);
        }
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');
        setOllamaApiKey(config.ollama_api_key || '');
      }
    };
    loadConfig();
  }, []);

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

  const refreshCopilotStatus = useCallback(async () => {
    if (!window.electron?.copilotAuth) return;
    try {
      const s = await window.electron.copilotAuth.status();
      setCopilotConnected(s.success && s.connected === true);
    } catch {
      setCopilotConnected(false);
    }
  }, []);

  const handleConnectCopilot = async () => {
    if (!window.electron?.copilotAuth) {
      setTestResult({ success: false, message: 'GitHub Copilot no disponible en esta versión.' });
      return;
    }
    setCopilotConnecting(true);
    setCopilotUserCode(null);
    setTestResult(null);
    try {
      const started = await window.electron.copilotAuth.start();
      if (!started.success || !started.deviceCode || !started.userCode) {
        setTestResult({
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
        setTestResult({ success: true, message: t('settings.ai.copilot_connected_ok') });
      } else {
        setTestResult({
          success: false,
          message: result.error || t('settings.ai.copilot_connect_failed'),
        });
      }
    } catch (error) {
      setTestResult({
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
      setTestResult({ success: true, message: t('settings.ai.copilot_disconnected') });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'No se pudo desconectar.',
      });
    }
  };

  useEffect(() => { refreshDomeSession();
  }, [refreshDomeSession]);
  useEffect(() => { refreshCopilotStatus();
  }, [refreshCopilotStatus]);
  useEffect(() => { refreshCloudSyncStatus();
  }, [refreshCloudSyncStatus]);
  useEffect(() => {
    const onFocus = () => refreshDomeSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDomeSession]);

  const refreshProviderKeyStatus = useCallback(async () => {
    try {
      const res = await window.electron.invoke('db:settings:aiProviderKeyStatus');
      if (res?.success && res.data) setProviderKeyStatus(res.data as Record<string, boolean>);
    } catch {
      /* non-fatal: badges quedan vacíos */
    }
  }, []);

  useEffect(() => { refreshProviderKeyStatus();
  }, [refreshProviderKeyStatus]);

  // Deep link from the model switcher: jump to a provider (and optionally its models modal).
  useEffect(() => {
    const onOpenProviderSettings = (e: Event) => {
      const detail = (e as CustomEvent<OpenAIProviderSettingsDetail>).detail;
      if (!detail?.provider) return;
      setActiveTab('chat');
      setProvider(detail.provider);
      if (isCloudAIProvider(detail.provider)) { (async () => {
          try {
            const { db } = await import('@/lib/db/client');
            const res = await db.getSetting(`ai_api_key_${detail.provider}`);
            setApiKey(res.data || '');
          } catch {
            setApiKey('');
          }
        })();
      }
      if (detail.openModelsModal && isVisibleModelsConfigurable(detail.provider)) {
        setModelsConfigProvider(detail.provider);
      }
    };
    window.addEventListener('dome:open-ai-provider-settings', onOpenProviderSettings);
    return () => window.removeEventListener('dome:open-ai-provider-settings', onOpenProviderSettings);
  }, []);

  const handleProviderChange = (newProvider: AIProviderType) => {
    setProvider(newProvider);
    setCustomModel(false);
    setModel(getDefaultModelId(newProvider));
    // Cada provider tiene su propia clave en DB: al cambiar, carga la suya
    // (enmascarada) en vez de arrastrar la del provider anterior.
    if (isCloudAIProvider(newProvider)) { (async () => {
        try {
          const { db } = await import('@/lib/db/client');
          const res = await db.getSetting(`ai_api_key_${newProvider}`);
          setApiKey(res.data || '');
        } catch {
          setApiKey('');
        }
      })();
    } else {
      setApiKey('');
    }
  };

  const handleSave = async () => {
    if (provider === 'ollama' && isOllamaCloudMissingApiKey(ollamaBaseURL, ollamaApiKey)) {
      setTestResult({ success: false, message: t('settings.ai.ollama_cloud_api_key_required') });
      return;
    }
    const config: Partial<AISettings> = { provider };
    switch (provider) {
      case 'dome':
        config.model = model || 'dome/auto';
        config.base_url = '';
        break;
      case 'copilot':
        config.model = model;
        config.base_url = '';
        break;
      case 'ollama':
        config.ollama_base_url = ollamaBaseURL;
        config.ollama_model = ollamaModel;
        config.ollama_api_key = ollamaApiKey;
        break;
      case 'minimax':
        config.api_key = apiKey;
        config.model = model;
        break;
      default:
        config.api_key = apiKey;
        config.model = model;
        config.base_url = '';
        break;
    }
    try {
      await saveAIConfig(config); refreshProviderKeyStatus();
      await transcriptionRef.current?.save();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
    } catch (error) {
      console.error('[AISettings] Error saving config:', error);
      showToast('error', error instanceof Error ? error.message : t('common.error'));
    }
  };

  const handleTestConnection = async () => {
    await handleSave();
    setTesting(true);
    setTestResult(null);
    try {
      if (window.electron?.ai?.testConnection) {
        const result = await window.electron.ai.testConnection();
        setTestResult(
          result.success
            ? {
                success: true,
                message: t('settings.ai.connected_to', {
                  provider: result.provider ?? '',
                  model: result.model ?? '',
                }),
              }
            : { success: false, message: result.error || t('settings.ai.connection_failed') },
        );
      } else {
        setTestResult({ success: false, message: 'Test no disponible en esta versión' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDomePasswordLogin = async () => {
    if (!window.electron?.domeAuth?.nativeLogin) {
      setTestResult({ success: false, message: 'Login nativo no disponible en esta versión.' });
      return;
    }
    const email = domeEmail.trim();
    if (!email || !domePassword) return;
    setDomeLoggingIn(true);
    setTestResult(null);
    try {
      const result = await window.electron.domeAuth.nativeLogin(email, domePassword, false);
      if (!result.success) {
        const messages: Record<string, string> = {
          invalid_credentials: t('settings.ai.dome_login_invalid_credentials'),
          network_error: t('settings.ai.dome_login_network_error'),
        };
        setTestResult({
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
      setTestResult({ success: true, message: t('settings.ai.dome_login_ok') });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.dome_login_failed'),
      });
    } finally {
      setDomeLoggingIn(false);
    }
  };

  const handleConnectDome = async () => {
    if (!window.electron?.domeAuth) {
      setTestResult({ success: false, message: 'Dome OAuth no disponible en esta versión.' });
      return;
    }
    setDomeConnecting(true);
    setTestResult(null);
    try {
      const result = await window.electron.domeAuth.openDashboard();
      setTestResult(
        result.success
          ? {
              success: true,
              message: 'Dashboard abierto. Inicia sesión y haz clic en "Conectar Dome Desktop".',
            }
          : { success: false, message: result.error || 'No se pudo abrir el dashboard.' },
      );
    } catch (error) {
      setTestResult({
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
      setTestResult({ success: true, message: 'Cuenta de Dome desconectada.' });
    } catch (error) {
      setTestResult({
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

  return (
    <SettingsSurface
      icon={BrainIcon}
      title={t('settings.ai.title')}
      description={t('settings.ai.subtitle')}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => value && setActiveTab(value as AISettingsTab)}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {TAB_DEFINITIONS.map(({ value, labelKey, icon }) => (
            <TabsTrigger key={value} value={value} className="flex-none">
              <HugeiconsIcon icon={icon} data-icon="inline-start" />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab === 'chat' ? (
        <>
          <AIProviderSelection
            provider={provider}
            onProviderChange={handleProviderChange}
            configuredProviders={providerKeyStatus}
            onConfigureModels={setModelsConfigProvider}
          />

          <ProviderModelsConfigModal
            open={modelsConfigProvider != null}
            provider={modelsConfigProvider}
            onClose={() => setModelsConfigProvider(null)}
            onSaved={(savedProvider, visibleIds) => {
              if (savedProvider === provider && !customModel) {
                const next = resolveVisibleModelAfterSave(savedProvider, model, visibleIds);
                if (next !== model) {
                  setModel(next); saveChatModelForProvider(savedProvider, next);
                  window.dispatchEvent(new Event('dome:ai-config-changed'));
                }
              }
            }}
          />

          <SettingsGroup title={t('settings.ai.configuration')} bare>
            {isCloudAIProvider(provider) ? (
              <AICloudProviderConfig
                provider={provider}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                model={model}
                onModelChange={setModel}
                customModel={customModel}
                onCustomModelChange={setCustomModel}
              />
            ) : null}

            {provider === 'ollama' ? (
              <AIOllamaProviderConfig
                ollamaBaseURL={ollamaBaseURL}
                onOllamaBaseURLChange={setOllamaBaseURL}
                ollamaModel={ollamaModel}
                onOllamaModelChange={setOllamaModel}
                ollamaApiKey={ollamaApiKey}
                onOllamaApiKeyChange={setOllamaApiKey}
              />
            ) : null}

            {provider === 'dome' ? (
              <div className="flex flex-col gap-5 rounded-xl border bg-card p-4">
                <div>
                  <p className="text-sm font-medium">{t('settings.ai.dome_connect_title')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('settings.ai.dome_connect_desc')}
                  </p>
                </div>

                {!domeConnected ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault(); handleDomePasswordLogin();
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="dome-email">
                          {t('settings.ai.dome_login_email')}
                        </FieldLabel>
                        <Input
                          id="dome-email"
                          type="email"
                          autoComplete="email"
                          value={domeEmail}
                          onChange={(event) => setDomeEmail(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="dome-password">
                          {t('settings.ai.dome_login_password')}
                        </FieldLabel>
                        <Input
                          id="dome-password"
                          type="password"
                          autoComplete="current-password"
                          value={domePassword}
                          onChange={(event) => setDomePassword(event.target.value)}
                        />
                      </Field>
                      <Button
                        type="submit"
                        disabled={domeLoggingIn || !domeEmail.trim() || !domePassword}
                      >
                        {domeLoggingIn ? <Spinner data-icon="inline-start" /> : null}
                        {domeLoggingIn
                          ? t('settings.ai.connecting')
                          : t('settings.ai.dome_login_submit')}
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
                    onClick={() => handleConnectDome()}
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
                    <Button type="button" variant="ghost" onClick={() => handleDisconnectDome()}>
                      {t('settings.ai.disconnect')}
                    </Button>
                  ) : null}
                </div>

                {domeConnected ? (
                  <Field>
                    <FieldLabel>{t('settings.ai.model')}</FieldLabel>
                    <ModelSelector
                      models={currentProviderModels}
                      selectedModelId={model}
                      onChange={setModel}
                      showBadges
                      searchable={currentProviderModels.length > 5}
                      placeholder={t('settings.ai.model')}
                      providerType="cloud"
                      providerId="dome"
                      configuredHint
                    />
                    {providerModelsLoading ? (
                      <p className="text-xs text-muted-foreground">
                        {t('settings.ai.loading_models')}
                      </p>
                    ) : null}
                  </Field>
                ) : null}

                {domeConnected && domeQuota && domeQuota.planId !== 'unsubscribed' ? (
                  <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{t('settings.ai.usage_period')}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {domeQuota.used != null && domeQuota.limit != null
                          ? `${formatTokens(domeQuota.used)} / ${formatTokens(domeQuota.limit)}`
                          : '—'}
                      </p>
                    </div>
                    <Progress
                      value={
                        domeQuota.limit && domeQuota.limit > 0
                          ? Math.min(((domeQuota.used ?? 0) / domeQuota.limit) * 100, 100)
                          : 0
                      }
                    />
                    {domeQuota.periodEnd ? (
                      <p className="text-xs text-muted-foreground">
                        {t('settings.ai.renewal')}:{' '}
                        {new Date(domeQuota.periodEnd).toLocaleDateString()}
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
                        onClick={() => handleCloudSyncNow()}
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
            ) : null}

            {provider === 'copilot' ? (
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
                    onClick={() => handleConnectCopilot()}
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
                      onClick={() => handleDisconnectCopilot()}
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
                      onChange={setModel}
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
            ) : null}
          </SettingsGroup>
        </>
      ) : null}

      {activeTab === 'embeddings' ? <AIEmbeddingsTab /> : null}

      {activeTab === 'transcription' ? (
        <TranscriptionSettingsSections
          ref={transcriptionRef}
          embedded
          summaryModels={currentProviderModels}
          summaryModelsLoading={providerModelsLoading}
        />
      ) : null}

      {activeTab === 'tools' ? <AIWebSearchTab /> : null}

      {activeTab === 'context' ? <AgentContextSettingsTab /> : null}

      {activeTab === 'chat' || activeTab === 'transcription' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => handleSave()}>
              {saved ? t('settings.ai.saved_config') : t('settings.ai.save_all')}
            </Button>
            {activeTab === 'chat' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleTestConnection()}
                disabled={testing}
              >
                {testing ? <Spinner data-icon="inline-start" /> : null}
                {t('settings.ai.test_connection')}
              </Button>
            ) : null}
          </div>
          {testResult && activeTab === 'chat' ? (
            <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
              <HugeiconsIcon
                icon={testResult.success ? CheckmarkCircle02Icon : AlertCircleIcon}
                aria-hidden
              />
              <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : null}
    </SettingsSurface>
  );
}
