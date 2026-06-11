
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Search, MessageSquare, Mic, Layers } from 'lucide-react';
import AIEmbeddingsTab from './ai/AIEmbeddingsTab';
import AIWebSearchTab from './ai/AIWebSearchTab';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  type AIProviderType,
} from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import { accentMix } from '@/lib/ui/accent';
import AIProviderSelection, { isCloudAIProvider } from './ai/AIProviderSelection';
import AICloudProviderConfig from './ai/AICloudProviderConfig';
import AIOllamaProviderConfig from './ai/AIOllamaProviderConfig';
import ModelSelector from './ModelSelector';
import { getCopilotModels } from '@/lib/ai/catalogs/copilot';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from './TranscriptionSettingsSections';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';

type AISettingsTab = 'chat' | 'embeddings' | 'transcription' | 'tools';

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
  const copilotModels = useMemo(() => getCopilotModels(), []);

  const {
    models: currentProviderModels,
    loading: providerModelsLoading,
  } = useProviderModels({ provider, apiKey });

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

  const handleProviderChange = (newProvider: AIProviderType) => {
    setProvider(newProvider);
    setCustomModel(false);
    setModel(getDefaultModelId(newProvider));
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 p-0 bg-transparent"
        title={t('settings.ai.title')}
        subtitle={t('settings.ai.subtitle')}
      />

      <DomeSegmentedControl
        className="w-full !flex"
        size="sm"
        aria-label={t('settings.ai.title')}
        value={activeTab}
        onChange={(v) => setActiveTab(v as AISettingsTab)}
        options={[
          { value: 'chat', label: t('settings.ai.tab_chat'), icon: <MessageSquare className="size-3.5" /> },
          { value: 'embeddings', label: t('settings.ai.tab_embeddings'), icon: <Layers className="size-3.5" /> },
          { value: 'transcription', label: t('settings.ai.tab_transcription'), icon: <Mic className="size-3.5" /> },
          { value: 'tools', label: t('settings.ai.tab_tools'), icon: <Search className="size-3.5" /> },
        ]}
      />

      {activeTab === 'chat' ? (
      <>
      <AIProviderSelection provider={provider} onProviderChange={handleProviderChange} />

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.ai.configuration')}</DomeSectionLabel>

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
          <DomeCard className="space-y-4">
            <div className="rounded-lg p-4" style={{ backgroundColor: accentMix(8), border: `1px solid ${accentMix(25)}` }}>
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
                className="rounded-lg p-4 space-y-3"
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
          <DomeCard className="space-y-4">
            <div className="rounded-lg p-4" style={{ backgroundColor: accentMix(8), border: `1px solid ${accentMix(25)}` }}>
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

            {copilotConnected && copilotModels.length > 0 ? (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]">
                  {t('settings.ai.model')}
                </span>
                <ModelSelector
                  models={copilotModels}
                  selectedModelId={model}
                  onChange={setModel}
                  showBadges
                  searchable={copilotModels.length > 5}
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
  );
}
