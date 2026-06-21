
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from '@mantine/core';
import { Check, ChevronDown, Cloud, Search, MessageSquare, Mic, Layers, type LucideIcon } from 'lucide-react';
import AIEmbeddingsTab from './ai/AIEmbeddingsTab';
import AIWebSearchTab from './ai/AIWebSearchTab';
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
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import { accentMix } from '@/lib/ui/accent';
import AIProviderSelection, { isCloudAIProvider } from './ai/AIProviderSelection';
import ProviderModelsConfigModal from './ai/ProviderModelsConfigModal';
import AICloudProviderConfig from './ai/AICloudProviderConfig';
import AIOllamaProviderConfig from './ai/AIOllamaProviderConfig';
import ModelSelector from './ModelSelector';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from './TranscriptionSettingsSections';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { cn } from '@/lib/utils';
import '@/styles/ai-settings.css';

type AISettingsTab = 'chat' | 'embeddings' | 'transcription' | 'tools';

const TAB_ICON_CLASS = 'size-3.5';
const TAB_DEFINITIONS: Array<{ value: AISettingsTab; labelKey: string; icon: LucideIcon }> = [
  { value: 'chat', labelKey: 'settings.ai.tab_chat', icon: MessageSquare },
  { value: 'embeddings', labelKey: 'settings.ai.tab_embeddings', icon: Layers },
  { value: 'transcription', labelKey: 'settings.ai.tab_transcription', icon: Mic },
  { value: 'tools', labelKey: 'settings.ai.tab_tools', icon: Search },
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
        if (config.model && !providerModels.find(m => m.id === config.model)) setCustomModel(true);
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
    if (!window.electron?.cloudSync || !domeConnected) {
      setCloudSyncMsg(null);
      return;
    }
    try {
      const s = await window.electron.cloudSync.getStatus();
      if (s.success && s.connected && s.localRevision != null && s.currentRevision != null) {
        setCloudSyncMsg(
          t('settings.ai.cloud_sync_status', { local: String(s.localRevision), remote: String(s.currentRevision) }),
        );
      } else if (s.error) {
        setCloudSyncMsg(s.error);
      } else {
        setCloudSyncMsg(null);
      }
    } catch {
      setCloudSyncMsg(null);
    }
  }, [domeConnected, t]);

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
    const config: Partial<AISettings> = {
      provider,
    };
    switch (provider) {
      case 'openai': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'anthropic': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'google': config.api_key = apiKey; config.model = model; config.base_url = ''; break;
      case 'dome': config.model = 'dome/auto'; config.base_url = ''; break;
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

  const handleCloudSyncPull = async () => {
    if (!window.electron?.cloudSync) return;
    setCloudSyncBusy(true);
    try {
      const r = await window.electron.cloudSync.pull();
      if (!r.success) {
        setCloudSyncMsg(r.error || t('settings.ai.cloud_sync_error'));
        return;
      }
      await refreshCloudSyncStatus();
    } catch (e) {
      setCloudSyncMsg(e instanceof Error ? e.message : t('settings.ai.cloud_sync_error'));
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleCloudSyncPush = async () => {
    if (!window.electron?.cloudSync) return;
    setCloudSyncBusy(true);
    try {
      const r = await window.electron.cloudSync.push();
      if (!r.success) {
        setCloudSyncMsg(r.error || t('settings.ai.cloud_sync_error'));
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
      <div className="ai-settings">
      <div className="ai-settings__header">
        <h1 className="ai-settings__title">{t('settings.ai.title')}</h1>
        <p className="ai-settings__subtitle">{t('settings.ai.subtitle')}</p>
      </div>

      <div className="ai-settings__tabs">
        <div className="ai-settings__tabs-segmented">
          <DomeSegmentedControl
            className="w-full !flex"
            size="sm"
            aria-label={t('settings.ai.title')}
            value={activeTab}
            onChange={(v) => setActiveTab(v as AISettingsTab)}
            options={TAB_DEFINITIONS.map(({ value, labelKey, icon: Icon }) => ({
              value,
              label: t(labelKey),
              icon: <Icon className={TAB_ICON_CLASS} />,
            }))}
          />
        </div>
        <div className="ai-settings__tabs-dropdown">
          {(() => {
            const activeDef = TAB_DEFINITIONS.find((d) => d.value === activeTab) ?? TAB_DEFINITIONS[0];
            const ActiveIcon = activeDef.icon;
            return (
              <Menu
                withinPortal
                position="bottom-start"
                width="target"
                shadow="md"
                offset={4}
                classNames={{
                  dropdown: 'ai-settings__tabs-dropdown-menu',
                  item: 'ai-settings__tabs-dropdown-item',
                }}
              >
                <Menu.Target>
                  <DomeButton
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="listbox"
                    aria-label={t('settings.ai.title')}
                    className="ai-settings__tabs-dropdown-trigger"
                    rightIcon={<ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />}
                    leftIcon={<ActiveIcon className={cn(TAB_ICON_CLASS, 'shrink-0 text-[var(--dome-accent)]')} aria-hidden />}
                  >
                    <span className="ai-settings__tabs-dropdown-text">{t(activeDef.labelKey)}</span>
                  </DomeButton>
                </Menu.Target>
                <Menu.Dropdown role="listbox" aria-label={t('settings.ai.title')}>
                  {TAB_DEFINITIONS.map(({ value, labelKey, icon: Icon }) => {
                    const isActive = activeTab === value;
                    return (
                      <Menu.Item
                        key={value}
                        role="option"
                        aria-selected={isActive}
                        leftSection={<Icon className={TAB_ICON_CLASS} aria-hidden />}
                        rightSection={
                          isActive ? (
                            <Check className="size-3.5 shrink-0 text-[var(--dome-accent)]" aria-hidden />
                          ) : null
                        }
                        className={cn(isActive && 'is-active')}
                        onClick={() => setActiveTab(value)}
                      >
                        {t(labelKey)}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            );
          })()}
        </div>
      </div>

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

      <div>
        <p className="ai-settings__section-label mb-2">{t('settings.ai.configuration')}</p>

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

        {provider === 'dome' && (
          <DomeCard className="space-y-3">
            <div className="rounded-lg p-3" style={{ backgroundColor: accentMix(8), border: `1px solid ${accentMix(25)}` }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                {t('settings.ai.dome_connect_title')}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.ai.dome_connect_desc')}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <DomeButton type="button" variant="primary" size="md" onClick={() => void handleConnectDome()} disabled={domeConnecting}>
                {domeConnecting ? t('settings.ai.connecting') : domeConnected ? t('settings.ai.reconnect') : t('settings.ai.connect_dome')}
              </DomeButton>
              {domeConnected ? (
                <DomeButton type="button" variant="outline" size="md" onClick={() => void handleDisconnectDome()}>
                  {t('settings.ai.disconnect')}
                </DomeButton>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full" style={{ backgroundColor: domeConnected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }} />
              <span className="text-xs" style={{ color: domeConnected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
                {domeConnected ? t('settings.ai.status_connected') : t('settings.ai.status_disconnected')}
              </span>
            </div>

            {domeConnected && domeQuota && domeQuota.planId !== 'unsubscribed' && (
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>{t('settings.ai.usage_period')}</span>
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {domeQuota.used != null && domeQuota.limit != null
                      ? `${formatTokens(domeQuota.used)} / ${formatTokens(domeQuota.limit)}`
                      : '—'}
                  </span>
                </div>
                <DomeProgressBar
                  value={domeQuota.limit && domeQuota.limit > 0 ? Math.min((domeQuota.used ?? 0) / domeQuota.limit * 100, 100) : 0}
                  max={100}
                  size="sm"
                />
                {domeQuota.periodEnd && (
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('settings.ai.renewal')}: {new Date(domeQuota.periodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {domeConnected && (
              <div
                className="rounded-lg p-3 space-y-3"
                style={{ border: '1px solid var(--dome-border)', backgroundColor: 'var(--dome-bg-hover)' }}
              >
                <div className="flex items-start gap-2">
                  <DomeIconBox size="sm" background="var(--dome-accent-bg)">
                    <Cloud className="size-4" style={{ color: 'var(--dome-accent)' }} />
                  </DomeIconBox>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
                      {t('settings.ai.cloud_sync_title')}
                    </p>
                    <p className="text-[10px] leading-relaxed mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('settings.ai.cloud_sync_desc')}
                    </p>
                    {cloudSyncMsg ? (
                      <p className="text-[10px] mt-2 font-mono break-all" style={{ color: 'var(--dome-text-muted)' }}>
                        {cloudSyncMsg}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DomeButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cloudSyncBusy}
                    onClick={() => void handleCloudSyncPull()}
                  >
                    {cloudSyncBusy ? t('settings.ai.cloud_sync_busy') : t('settings.ai.cloud_sync_pull')}
                  </DomeButton>
                  <DomeButton
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={cloudSyncBusy}
                    onClick={() => void handleCloudSyncPush()}
                  >
                    {cloudSyncBusy ? t('settings.ai.cloud_sync_busy') : t('settings.ai.cloud_sync_push')}
                  </DomeButton>
                </div>
              </div>
            )}
          </DomeCard>
        )}

        {provider === 'copilot' && (
          <DomeCard className="space-y-3">
            <div className="rounded-lg p-3" style={{ backgroundColor: accentMix(8), border: `1px solid ${accentMix(25)}` }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                {t('settings.ai.copilot_connect_title')}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.ai.copilot_connect_desc')}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <DomeButton type="button" variant="primary" size="md" onClick={() => void handleConnectCopilot()} disabled={copilotConnecting}>
                {copilotConnecting ? t('settings.ai.connecting') : copilotConnected ? t('settings.ai.reconnect') : t('settings.ai.copilot_connect')}
              </DomeButton>
              {copilotConnected ? (
                <DomeButton type="button" variant="outline" size="md" onClick={() => void handleDisconnectCopilot()}>
                  {t('settings.ai.disconnect')}
                </DomeButton>
              ) : null}
            </div>

            {copilotConnecting && copilotUserCode ? (
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.ai.copilot_enter_code')}
                </p>
                <p className="text-lg font-mono font-bold tracking-widest" style={{ color: 'var(--dome-text)' }}>
                  {copilotUserCode}
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full" style={{ backgroundColor: copilotConnected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }} />
              <span className="text-xs" style={{ color: copilotConnected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
                {copilotConnected ? t('settings.ai.status_connected') : t('settings.ai.status_disconnected')}
              </span>
            </div>

            {copilotConnected && copilotVisibleModels.length > 0 ? (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]">
                  {t('settings.ai.model')}
                </span>
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
              </div>
            ) : null}
          </DomeCard>
        )}
      </div>
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

      {(activeTab === 'chat' || activeTab === 'transcription') ? (
        <>
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <DomeButton type="button" variant="primary" size="md" onClick={() => void handleSave()}>
              {saved ? t('settings.ai.saved_config') : t('settings.ai.save_all')}
            </DomeButton>
            {activeTab === 'chat' ? (
              <DomeButton
                type="button"
                variant="outline"
                size="md"
                onClick={() => void handleTestConnection()}
                loading={testing}
              >
                {t('settings.ai.test_connection')}
              </DomeButton>
            ) : null}
          </div>
          {testResult && activeTab === 'chat' ? (
            <DomeCallout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</DomeCallout>
          ) : null}
        </>
      ) : null}
      </div>
    </SettingsPanel>
  );
}
