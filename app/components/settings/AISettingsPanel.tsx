import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  CloudIcon as Cloud,
  Search01Icon as Search,
  Comment01Icon as MessageSquare,
  Mic01Icon as Mic,
  Layers01Icon as Layers,
  BrainIcon as Brain,
  CheckmarkCircle02Icon as CheckCircle2,
  AlertCircleIcon as AlertCircle,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import AIEmbeddingsTab from './ai/AIEmbeddingsTab';
import AIWebSearchTab from './ai/AIWebSearchTab';
import AgentContextSettingsTab from './ai/AgentContextSettingsTab';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  type AIProviderType,
} from '@/lib/ai/models';
import { resolveVisibleModelAfterSave, isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import { saveChatModelForProvider } from '@/lib/ai/client';
import type { OpenAIProviderSettingsDetail } from '@/lib/ai/open-provider-settings';
import { showToast } from '@/lib/store/useToastStore';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import AIProviderSelection from './ai/AIProviderSelection';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import { isOllamaCloudMissingApiKey } from '@/lib/ai/providerAuth';
import ProviderModelsConfigModal from './ai/ProviderModelsConfigModal';
import AICloudProviderConfig from './ai/AICloudProviderConfig';
import AIOllamaProviderConfig from './ai/AIOllamaProviderConfig';
import ModelSelector from './ModelSelector';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from './TranscriptionSettingsSections';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/shared/PageHeader';
type AISettingsTab = 'chat' | 'embeddings' | 'transcription' | 'tools' | 'context';

const TAB_DEFINITIONS: Array<{ value: AISettingsTab; labelKey: string; icon: IconSvgElement }> = [
  { value: 'chat', labelKey: 'settings.ai.tab_chat', icon: MessageSquare },
  { value: 'embeddings', labelKey: 'settings.ai.tab_embeddings', icon: Layers },
  { value: 'transcription', labelKey: 'settings.ai.tab_transcription', icon: Mic },
  { value: 'tools', labelKey: 'settings.ai.tab_tools', icon: Search },
  { value: 'context', labelKey: 'settings.ai.tab_context', icon: Brain },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

/* ─── Main component ─────────────────────────────────── */

export default function AISettingsPanel() {
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
    planId?: string; limit?: number; used?: number; remaining?: number;
    periodEnd?: number; subscriptionStatus?: string;
  } | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotConnecting, setCopilotConnecting] = useState(false);
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);
  const transcriptionRef = useRef<TranscriptionSettingsSectionsHandle>(null);
  const [activeTab, setActiveTab] = useState<AISettingsTab>('chat');
  const [modelsConfigProvider, setModelsConfigProvider] = useState<AIProviderType | null>(null);

  const {
    models: currentProviderModels,
    loading: providerModelsLoading,
  } = useProviderModels({ provider, apiKey });

  const { models: copilotVisibleModels } = useProviderModels({
    provider: 'copilot',
    applyVisibleFilter: true,
  });

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config) {
        const loadedProviderBase = (config.provider as string) === 'local' ? 'ollama' : config.provider;
        const loadedProvider = loadedProviderBase === 'dome' && !DOME_PROVIDER_ENABLED ? 'openai' : loadedProviderBase;
        setProvider(loadedProvider as AIProviderType);
        setApiKey(config.api_key || '');
        const defaultModel = getDefaultModelId(loadedProvider as AIProviderType);
        setModel(config.model || defaultModel);
        const providerModels = PROVIDERS[loadedProvider as AIProviderType]?.models || [];
        // Dome: los modelos del plan llegan del provider (no están en el
        // catálogo estático) — no son "modelos custom".
        if (loadedProvider !== 'dome' && config.model && !providerModels.find(m => m.id === config.model)) setCustomModel(true);
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
          setDomeQuota({ planId: quotaRes.planId, limit: quotaRes.limit, used: quotaRes.used, remaining: quotaRes.remaining, periodEnd: quotaRes.periodEnd, subscriptionStatus: quotaRes.subscriptionStatus });
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
        setTestResult({ success: false, message: started.error || 'No se pudo iniciar el login de GitHub Copilot.' });
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
        setTestResult({ success: false, message: result.error || t('settings.ai.copilot_connect_failed') });
      }
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Error desconocido' });
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
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'No se pudo desconectar.' });
    }
  };

  useEffect(() => { void refreshDomeSession(); }, [refreshDomeSession]);
  useEffect(() => { void refreshCopilotStatus(); }, [refreshCopilotStatus]);
  useEffect(() => { void refreshCloudSyncStatus(); }, [refreshCloudSyncStatus]);
  useEffect(() => {
    const onFocus = () => void refreshDomeSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDomeSession]);

  const refreshProviderKeyStatus = useCallback(async () => {
    try {
      const res = await window.electron.invoke('db:settings:aiProviderKeyStatus');
      if (res?.success && res.data) setProviderKeyStatus(res.data as Record<string, boolean>);
    } catch { /* non-fatal: badges quedan vacíos */ }
  }, []);

  useEffect(() => {
    void refreshProviderKeyStatus();
  }, [refreshProviderKeyStatus]);

  useEffect(() => {
    const onOpenProviderSettings = (e: Event) => {
      const detail = (e as CustomEvent<OpenAIProviderSettingsDetail>).detail;
      if (!detail?.provider) return;
      setActiveTab('chat');
      setProvider(detail.provider);
      if (isCloudAIProvider(detail.provider)) {
        void (async () => {
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
    if (isCloudAIProvider(newProvider)) {
      void (async () => {
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
    const config: Partial<AISettings> = {
      provider,
    };
    switch (provider) {
      case 'openai': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'anthropic': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'google': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'dome': config.model = model || 'dome/auto'; config.base_url = ''; break;
      case 'minimax': config.api_key = apiKey; config.model = model; break;
      case 'openrouter': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'deepseek': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'moonshot': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'qwen': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'opencode': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'opencode-go': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'copilot': config.model = model; config.base_url = ''; break;
      case 'ollama': config.ollama_base_url = ollamaBaseURL; config.ollama_model = ollamaModel; config.ollama_api_key = ollamaApiKey; break;
    }
    try {
      await saveAIConfig(config);
      void refreshProviderKeyStatus();
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
        setTestResult(result.success
          ? {
              success: true,
              message: t('settings.ai.connected_to', {
                provider: result.provider ?? '',
                model: result.model ?? '',
              }),
            }
          : { success: false, message: result.error || t('settings.ai.connection_failed') });
      } else {
        setTestResult({ success: false, message: 'Test no disponible en esta versión' });
      }
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Error desconocido' });
    } finally { setTesting(false); }
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
          message: (result.errorCode && messages[result.errorCode]) || result.error || t('settings.ai.dome_login_failed'),
        });
        return;
      }
      setDomePassword('');
      await refreshDomeSession();
      setTestResult({ success: true, message: t('settings.ai.dome_login_ok') });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : t('settings.ai.dome_login_failed') });
    } finally {
      setDomeLoggingIn(false);
    }
  };

  const handleConnectDome = async () => {
    if (!window.electron?.domeAuth) { setTestResult({ success: false, message: 'Dome OAuth no disponible en esta versión.' }); return; }
    setDomeConnecting(true);
    setTestResult(null);
    try {
      const result = await window.electron.domeAuth.openDashboard();
      setTestResult(result.success
        ? { success: true, message: 'Dashboard abierto. Inicia sesión y haz clic en "Conectar Dome Desktop".' }
        : { success: false, message: result.error || 'No se pudo abrir el dashboard.' });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Error desconocido' });
    } finally { setDomeConnecting(false); }
  };

  const handleDisconnectDome = async () => {
    if (!window.electron?.domeAuth) return;
    try {
      await window.electron.domeAuth.disconnect();
      setDomeConnected(false);
      setTestResult({ success: true, message: 'Cuenta de Dome desconectada.' });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'No se pudo desconectar.' });
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
    <SettingsPanel>
      <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.ai.title')} description={t('settings.ai.subtitle')} />

      <ToggleGroup value={[activeTab]} onValueChange={(values) => values[0] && setActiveTab(values[0] as AISettingsTab)} aria-label={t('settings.ai.title')} className="w-full justify-start overflow-x-auto">
          {TAB_DEFINITIONS.map(({ value, labelKey, icon }) => (
            <ToggleGroupItem key={value} value={value} variant="outline" className="flex-none">
              <HugeiconsIcon icon={icon} data-icon="inline-start" />
              {t(labelKey)}
            </ToggleGroupItem>
          ))}
      </ToggleGroup>

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
              setModel(next);
              void saveChatModelForProvider(savedProvider, next);
              window.dispatchEvent(new Event('dome:ai-config-changed'));
            }
          }
        }}
      />

      <section className="flex flex-col gap-3" aria-labelledby="ai-configuration-title">
        <h2 id="ai-configuration-title" className="text-sm font-medium">{t('settings.ai.configuration')}</h2>

        {isCloudAIProvider(provider) && (
          <AICloudProviderConfig
            provider={provider}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            model={model}
            onModelChange={setModel}
            customModel={customModel}
            onCustomModelChange={setCustomModel}
          />
        )}

        {provider === 'ollama' && (
          <AIOllamaProviderConfig
            ollamaBaseURL={ollamaBaseURL}
            onOllamaBaseURLChange={setOllamaBaseURL}
            ollamaModel={ollamaModel}
            onOllamaModelChange={setOllamaModel}
            ollamaApiKey={ollamaApiKey}
            onOllamaApiKeyChange={setOllamaApiKey}
          />
        )}

        {provider === 'dome' ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.dome_connect_title')}</CardTitle>
              <CardDescription>{t('settings.ai.dome_connect_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {!domeConnected ? (
                <form onSubmit={(event) => { event.preventDefault(); void handleDomePasswordLogin(); }}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="dome-email">{t('settings.ai.dome_login_email')}</FieldLabel>
                      <Input id="dome-email" type="email" autoComplete="email" value={domeEmail} onChange={(event) => setDomeEmail(event.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="dome-password">{t('settings.ai.dome_login_password')}</FieldLabel>
                      <Input id="dome-password" type="password" autoComplete="current-password" value={domePassword} onChange={(event) => setDomePassword(event.target.value)} />
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
                  {domeConnected ? t('settings.ai.status_connected') : t('settings.ai.status_disconnected')}
                </Badge>
                <Button type="button" variant="outline" onClick={() => void handleConnectDome()} disabled={domeConnecting}>
                  {domeConnecting ? <Spinner data-icon="inline-start" /> : null}
                  {domeConnecting ? t('settings.ai.connecting') : domeConnected ? t('settings.ai.reconnect') : t('settings.ai.dome_login_via_dashboard')}
                </Button>
                {domeConnected ? <Button type="button" variant="ghost" onClick={() => void handleDisconnectDome()}>{t('settings.ai.disconnect')}</Button> : null}
              </div>

              {domeConnected ? (
                <Field>
                  <FieldLabel>{t('settings.ai.model')}</FieldLabel>
                  <ModelSelector models={currentProviderModels} selectedModelId={model} onChange={setModel} showBadges searchable={currentProviderModels.length > 5} placeholder={t('settings.ai.model')} providerType="cloud" providerId="dome" configuredHint />
                  {providerModelsLoading ? <p className="text-xs text-muted-foreground">{t('settings.ai.loading_models')}</p> : null}
                </Field>
              ) : null}

              {domeConnected && domeQuota && domeQuota.planId !== 'unsubscribed' ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{t('settings.ai.usage_period')}</CardTitle>
                    <CardDescription>{domeQuota.used != null && domeQuota.limit != null ? `${formatTokens(domeQuota.used)} / ${formatTokens(domeQuota.limit)}` : '—'}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Progress value={domeQuota.limit && domeQuota.limit > 0 ? Math.min((domeQuota.used ?? 0) / domeQuota.limit * 100, 100) : 0} />
                    {domeQuota.periodEnd ? <p className="text-xs text-muted-foreground">{t('settings.ai.renewal')}: {new Date(domeQuota.periodEnd).toLocaleDateString()}</p> : null}
                  </CardContent>
                </Card>
              ) : null}

              {domeConnected ? (
                <Alert>
                  <HugeiconsIcon icon={Cloud} />
                  <AlertDescription className="flex flex-col gap-3">
                    <span>{t('settings.ai.cloud_sync_desc')}</span>
                    {cloudSyncMsg ? <code className="break-all text-xs">{cloudSyncMsg}</code> : null}
                    <Button type="button" size="sm" className="self-start" disabled={cloudSyncBusy} onClick={() => void handleCloudSyncNow()}>
                      {cloudSyncBusy ? <Spinner data-icon="inline-start" /> : null}
                      {cloudSyncBusy ? t('settings.ai.cloud_sync_busy') : t('settings.domain_sync.sync_now')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {provider === 'copilot' ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.copilot_connect_title')}</CardTitle>
              <CardDescription>{t('settings.ai.copilot_connect_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={copilotConnected ? 'secondary' : 'outline'}>{copilotConnected ? t('settings.ai.status_connected') : t('settings.ai.status_disconnected')}</Badge>
                <Button type="button" onClick={() => void handleConnectCopilot()} disabled={copilotConnecting}>
                  {copilotConnecting ? <Spinner data-icon="inline-start" /> : null}
                  {copilotConnecting ? t('settings.ai.connecting') : copilotConnected ? t('settings.ai.reconnect') : t('settings.ai.copilot_connect')}
                </Button>
                {copilotConnected ? <Button type="button" variant="ghost" onClick={() => void handleDisconnectCopilot()}>{t('settings.ai.disconnect')}</Button> : null}
              </div>
              {copilotConnecting && copilotUserCode ? <Alert><AlertDescription><span>{t('settings.ai.copilot_enter_code')}</span><code className="ml-2 font-mono text-base font-semibold tracking-widest">{copilotUserCode}</code></AlertDescription></Alert> : null}
              {copilotConnected && copilotVisibleModels.length > 0 ? (
                <Field>
                  <FieldLabel>{t('settings.ai.model')}</FieldLabel>
                  <ModelSelector models={copilotVisibleModels} selectedModelId={model} onChange={setModel} showBadges searchable={copilotVisibleModels.length > 5} placeholder={t('settings.ai.model')} providerType="cloud" providerId="copilot" configuredHint />
                </Field>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
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

      {(activeTab === 'chat' || activeTab === 'transcription') ? (
        <>
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Button type="button"
  onClick={() => void handleSave()}>
              {saved ? t('settings.ai.saved_config') : t('settings.ai.save_all')}
            </Button>
            {activeTab === 'chat' ? (
              <Button type="button"
  variant="outline"
  onClick={() => void handleTestConnection()}
  disabled={testing}>
                {testing ? <Spinner data-icon="inline-start" /> : null}
                {t('settings.ai.test_connection')}
              </Button>
            ) : null}
          </div>
          {testResult && activeTab === 'chat' ? (
            <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
              {testResult.success ? <HugeiconsIcon icon={CheckCircle2} aria-hidden /> : <HugeiconsIcon icon={AlertCircle} aria-hidden />}
              <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : null}
      </div>
    </SettingsPanel>
  );
}
