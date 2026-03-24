
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, Brain, ImageIcon, Shield, Gift, Search, Zap, RefreshCw, Lock, HardDrive } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  formatContextWindow,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import ModelSelector from './ModelSelector';

// Dome brand palette
const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';
const DOME_GREEN_DARK = '#4A502E';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

/* ─── Shared primitives ─────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
      {children}
    </label>
  );
}

function SettingsInput({
  id, type = 'text', value, onChange, placeholder, className = '', autoComplete,
}: {
  id?: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string; autoComplete?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={`w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors ${className}`}
      style={{
        backgroundColor: 'var(--dome-bg-hover)',
        color: 'var(--dome-text)',
        border: '1px solid var(--dome-border)',
      }}
      onFocus={(e) => { e.target.style.borderColor = DOME_GREEN; e.target.style.boxShadow = `0 0 0 3px ${DOME_GREEN}15`; }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--dome-border)'; e.target.style.boxShadow = 'none'; }}
    />
  );
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
  const [showOllamaApiKey, setShowOllamaApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingWebSearch, setTestingWebSearch] = useState(false);
  const [webSearchResult, setWebSearchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [domeConnected, setDomeConnected] = useState(false);
  const [domeConnecting, setDomeConnecting] = useState(false);
  const [domeQuota, setDomeQuota] = useState<{
    planId?: string; limit?: number; used?: number; remaining?: number;
    periodEnd?: number; subscriptionStatus?: string;
  } | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const currentProviderModels: ModelDefinition[] = useMemo(() => PROVIDERS[provider]?.models || [], [provider]);

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

  useEffect(() => { void refreshDomeSession(); }, [refreshDomeSession]);
  useEffect(() => {
    const onFocus = () => void refreshDomeSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDomeSession]);

  useEffect(() => {
    if (provider === 'ollama') { checkOllamaConnection(); loadOllamaModels(); }
  }, [provider, ollamaBaseURL]);

  const checkOllamaConnection = async () => {
    if (!window.electron) return;
    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      setOllamaAvailable(result.success && result.available === true);
    } catch { setOllamaAvailable(false); }
    finally { setCheckingOllama(false); }
  };

  const loadOllamaModels = async () => {
    if (!window.electron) return;
    setLoadingModels(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.listModels();
      setOllamaModels(result.success && Array.isArray(result.models) ? result.models : []);
    } catch { setOllamaModels([]); }
    finally { setLoadingModels(false); }
  };

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
      case 'ollama': config.ollama_base_url = ollamaBaseURL; config.ollama_model = ollamaModel; config.ollama_api_key = ollamaApiKey; break;
    }
    try {
      await saveAIConfig(config);
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

  const handleTestWebSearch = async () => {
    setTestingWebSearch(true);
    setWebSearchResult(null);
    try {
      if (!window.electron?.ai?.testWebSearch) {
        setWebSearchResult({ success: false, message: 'No disponible en esta versión.' });
        return;
      }
      const result = await window.electron.ai.testWebSearch();
      setWebSearchResult(result.success
        ? { success: true, message: result.warning ? `${result.warning} (${result.count ?? 0} resultado(s)).` : `Búsqueda web lista (${result.count ?? 0} resultado(s)).` }
        : { success: false, message: result.error || 'No se pudo validar la búsqueda web.' });
    } catch (error) {
      setWebSearchResult({ success: false, message: error instanceof Error ? error.message : 'Error desconocido.' });
    } finally { setTestingWebSearch(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>
          {t('settings.ai.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.ai.subtitle')}
        </p>
      </div>

      {/* ── PROVIDER SELECTION ── */}
      <div>
        <SectionLabel>{t('settings.ai.provider')}</SectionLabel>

        <div className="space-y-2">
          {/* Dome featured card */}
          {DOME_PROVIDER_ENABLED && (
            <button
              type="button"
              onClick={() => handleProviderChange('dome')}
              className="relative w-full p-4 rounded-xl text-left transition-all cursor-pointer overflow-hidden"
              style={{
                background: provider === 'dome'
                  ? `linear-gradient(135deg, ${DOME_GREEN} 0%, ${DOME_GREEN_DARK} 100%)`
                  : 'var(--dome-surface)',
                border: provider === 'dome' ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                boxShadow: provider === 'dome' ? `0 4px 16px ${DOME_GREEN}25` : 'none',
              }}
            >
              {provider === 'dome' && (
                <div className="absolute inset-0 pointer-events-none opacity-10"
                  style={{ backgroundImage: `radial-gradient(circle at 80% 50%, ${DOME_GREEN_LIGHT}, transparent 60%)` }}
                />
              )}
              <div className="relative flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.15)' : DOME_GREEN_LIGHT }}>
                  <Shield className="w-4 h-4" style={{ color: provider === 'dome' ? DOME_GREEN_LIGHT : DOME_GREEN }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: provider === 'dome' ? '#fff' : 'var(--dome-text)' }}>
                      {PROVIDERS.dome.name}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded tracking-wide"
                      style={{ backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.2)' : DOME_GREEN_LIGHT, color: provider === 'dome' ? '#fff' : DOME_GREEN }}>
                      {t('settings.ai.recommended')}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: provider === 'dome' ? 'rgba(255,255,255,0.7)' : 'var(--dome-text-muted)' }}>
                    {`${PROVIDERS.dome.description}. ${t('settings.ai.no_own_key')}.`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[{ icon: Lock, label: t('settings.ai.private') }, { icon: Zap, label: t('settings.ai.fast') }].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{ backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.12)' : `${DOME_GREEN}10`, color: provider === 'dome' ? 'rgba(255,255,255,0.85)' : DOME_GREEN }}>
                      <Icon className="w-2.5 h-2.5" />
                      <span className="text-[10px] font-medium">{label}</span>
                    </div>
                  ))}
                  {provider === 'dome' && <CheckCircle2 className="w-4 h-4" style={{ color: DOME_GREEN_LIGHT }} />}
                </div>
              </div>
            </button>
          )}

          {/* Cloud providers grid */}
          <div className="grid grid-cols-3 gap-2">
            {AI_PROVIDER_OPTIONS.filter(o => o.value !== 'dome' && o.value !== 'ollama').map((option) => {
              const isSelected = provider === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => !option.disabled && handleProviderChange(option.value)}
                  disabled={option.disabled}
                  className="relative p-3 rounded-xl text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isSelected ? `${DOME_GREEN}08` : 'transparent',
                    border: isSelected ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                    boxShadow: isSelected ? `0 2px 8px ${DOME_GREEN}15` : 'none',
                  }}
                >
                  {option.badge && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded"
                      style={{ backgroundColor: DOME_GREEN, color: '#fff' }}>
                      {option.badge}
                    </span>
                  )}
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center justify-between w-full">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: isSelected ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)' }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? DOME_GREEN : 'var(--dome-text-muted)' }} />
                      </div>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none mb-0.5" style={{ color: 'var(--dome-text)' }}>{option.label}</p>
                      <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.ai.api_key_required')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Ollama local */}
          {(() => {
            const ollamaOption = AI_PROVIDER_OPTIONS.find(o => o.value === 'ollama');
            if (!ollamaOption) return null;
            const isSelected = provider === 'ollama';
            const Icon = ollamaOption.icon;
            return (
              <button
                type="button"
                onClick={() => handleProviderChange('ollama')}
                className="relative w-full p-3 rounded-xl text-left transition-all cursor-pointer"
                style={{
                  backgroundColor: isSelected ? `${DOME_GREEN}08` : 'transparent',
                  border: isSelected ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                  boxShadow: isSelected ? `0 2px 8px ${DOME_GREEN}15` : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isSelected ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? DOME_GREEN : 'var(--dome-text-muted)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>{ollamaOption.label}</p>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded" style={{ backgroundColor: `${DOME_GREEN}15`, color: DOME_GREEN }}>{t('settings.ai.local_badge')}</span>
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.ai.private_local')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ backgroundColor: `${DOME_GREEN}10`, color: DOME_GREEN }}>
                      <HardDrive className="w-2.5 h-2.5" />
                      <span className="text-[10px] font-medium">Offline</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />}
                  </div>
                </div>
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── CONFIGURATION ── */}
      <div>
        <SectionLabel>{t('settings.ai.configuration')}</SectionLabel>

        {/* Cloud API key + model */}
        {(provider === 'openai' || provider === 'anthropic' || provider === 'google' || provider === 'minimax') && (
          <SettingsCard className="space-y-4">
            {/* API Key */}
            <div>
              <FieldLabel htmlFor="ai-api-key">API Key</FieldLabel>
              <div className="relative">
                <input
                  id="ai-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || 'Introduce tu API key...'}
                  className="w-full px-3 py-2 pr-10 rounded-lg text-sm outline-none transition-colors"
                  style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                  onFocus={(e) => { e.target.style.borderColor = DOME_GREEN; e.target.style.boxShadow = `0 0 0 3px ${DOME_GREEN}15`; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--dome-border)'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {PROVIDERS[provider]?.docsUrl && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.ai.free_key_at')}{' '}
                  <a href={PROVIDERS[provider].docsUrl} target="_blank" rel="noopener noreferrer"
                    className="underline hover:opacity-80" style={{ color: DOME_GREEN }}>
                    {PROVIDERS[provider].docsUrl.replace('https://', '')}
                  </a>
                </p>
              )}
            </div>

            {/* Model */}
            {currentProviderModels.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel>{t('settings.ai.model')}</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setCustomModel(v => !v)}
                    className="text-[11px] font-medium hover:opacity-80"
                    style={{ color: DOME_GREEN }}
                  >
                    {customModel ? t('settings.ai.use_presets') : t('settings.ai.custom_model')}
                  </button>
                </div>
                {customModel ? (
                  <SettingsInput
                    value={model}
                    onChange={setModel}
                    placeholder={getDefaultModelId(provider)}
                    autoComplete="off"
                  />
                ) : (
                  <ModelSelector
                    models={currentProviderModels}
                    selectedModelId={model}
                    onChange={setModel}
                    showBadges={true}
                    showDescription={true}
                    showContextWindow={true}
                    searchable={currentProviderModels.length > 5}
                    placeholder={t('settings.ai.model')}
                    providerType="cloud"
                  />
                )}
              </div>
            )}
          </SettingsCard>
        )}

        {/* Ollama config */}
        {provider === 'ollama' && (
          <SettingsCard className="space-y-4">
            {/* Status row */}
            <div className="flex items-center justify-between p-3 rounded-lg"
              style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>Estado</span>
                {checkingOllama ? (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> {t('settings.ai.status_checking')}
                  </span>
                ) : ollamaAvailable === true ? (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: DOME_GREEN }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.ai.status_connected')}
                  </span>
                ) : ollamaAvailable === false ? (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--dome-error, #ef4444)' }}>
                    <XCircle className="w-3.5 h-3.5" /> {t('settings.ai.status_disconnected')}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.ai.status_unverified')}</span>
                )}
              </div>
              <button
                type="button"
                onClick={checkOllamaConnection}
                disabled={checkingOllama}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                style={{ backgroundColor: DOME_GREEN, color: '#fff', border: 'none' }}
              >
                <RefreshCw className={`w-3 h-3 ${checkingOllama ? 'animate-spin' : ''}`} />
                {t('settings.ai.test_btn')}
              </button>
            </div>

            {ollamaAvailable === false && (
              <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b25', color: '#a37b00' }}>
                {t('settings.ai.ollama_install')}{' '}
                <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline font-medium">ollama.ai</a>
              </div>
            )}

            {/* Base URL */}
            <div>
              <FieldLabel htmlFor="ai-ollama-url">{t('settings.ai.base_url')}</FieldLabel>
              <SettingsInput
                id="ai-ollama-url"
                type="url"
                value={ollamaBaseURL}
                onChange={setOllamaBaseURL}
                placeholder="http://localhost:11434"
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                Para Ollama Cloud usa <code className="font-mono">https://api.ollama.com</code>
              </p>
            </div>

            {/* API Key (optional) */}
            <div>
              <FieldLabel htmlFor="ai-ollama-api-key">
                API Key <span className="normal-case font-normal opacity-60">(opcional — Ollama Cloud)</span>
              </FieldLabel>
              <div className="relative">
                <input
                  id="ai-ollama-api-key"
                  type={showOllamaApiKey ? 'text' : 'password'}
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                  placeholder="ollama_..."
                  autoComplete="off"
                  className="w-full px-3 py-2 pr-10 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                  onFocus={(e) => { e.target.style.borderColor = DOME_GREEN; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--dome-border)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowOllamaApiKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                >
                  {showOllamaApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Chat model */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel>{t('settings.ai.chat_model')}</FieldLabel>
                <button
                  type="button"
                  onClick={loadOllamaModels}
                  disabled={loadingModels}
                  className="flex items-center gap-1 text-[11px] font-medium hover:opacity-80 disabled:opacity-50"
                  style={{ color: DOME_GREEN }}
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${loadingModels ? 'animate-spin' : ''}`} />
                  {t('settings.ai.refresh')}
                </button>
              </div>
              {loadingModels ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.ai.loading_models')}</span>
                </div>
              ) : ollamaModels.length > 0 ? (
                <ModelSelector
                  models={ollamaModels.map(m => ({ id: m.name, name: m.name, description: `${Math.round(m.size / 1024 / 1024 / 1024)}GB`, reasoning: false, input: ['text'], contextWindow: 0, maxTokens: 0 }))}
                  selectedModelId={ollamaModel}
                  onChange={setOllamaModel}
                  searchable={true}
                  showBadges={false}
                  showDescription={true}
                  showContextWindow={false}
                  placeholder={t('settings.ai.chat_model')}
                  disabled={loadingModels}
                  providerType="ollama"
                />
              ) : (
                <SettingsInput value={ollamaModel} onChange={setOllamaModel} placeholder="llama3.2" />
              )}
            </div>

            {/* OCR notice */}
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--dome-text)' }}>OCR en PDFs escaneados:</span>{' '}
              el modelo debe soportar visión. Compatibles: <code className="font-mono">llava</code>, <code className="font-mono">minicpm-v</code>, <code className="font-mono">glm4v</code>.
            </div>
          </SettingsCard>
        )}

        {/* Dome provider config */}
        {provider === 'dome' && (
          <SettingsCard className="space-y-4">
            <div className="rounded-lg p-4" style={{ backgroundColor: `${DOME_GREEN}08`, border: `1px solid ${DOME_GREEN}25` }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
                {t('settings.ai.dome_connect_title')}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.ai.dome_connect_desc')}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleConnectDome}
                disabled={domeConnecting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: DOME_GREEN }}
              >
                {domeConnecting ? t('settings.ai.connecting') : domeConnected ? t('settings.ai.reconnect') : t('settings.ai.connect_dome')}
              </button>
              {domeConnected && (
                <button
                  type="button"
                  onClick={handleDisconnectDome}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)', backgroundColor: 'transparent' }}
                >
                  {t('settings.ai.disconnect')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: domeConnected ? DOME_GREEN : 'var(--dome-text-muted)' }} />
              <span className="text-xs" style={{ color: domeConnected ? DOME_GREEN : 'var(--dome-text-muted)' }}>
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
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dome-border)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: domeQuota.limit && domeQuota.limit > 0 ? `${Math.min((domeQuota.used ?? 0) / domeQuota.limit * 100, 100)}%` : '0%',
                      backgroundColor: DOME_GREEN,
                    }}
                  />
                </div>
                {domeQuota.periodEnd && (
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('settings.ai.renewal')}: {new Date(domeQuota.periodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </SettingsCard>
        )}
      </div>

      {/* ── WEB SEARCH ── */}
      <div>
        <SectionLabel>{t('settings.ai.brave_search_title')}</SectionLabel>
        <SettingsCard className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: DOME_GREEN_LIGHT }}>
              <Search className="w-4 h-4" style={{ color: DOME_GREEN }} />
            </div>
            <div>
              <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>Playwright Web Search</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.ai.brave_search_desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestWebSearch}
              disabled={testingWebSearch}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{ backgroundColor: DOME_GREEN, color: '#fff' }}
            >
              {testingWebSearch ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('settings.ai.testing')}</> : t('settings.ai.test_brave')}
            </button>
            <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.ai.brave_desc')}
            </span>
          </div>

          {webSearchResult && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: webSearchResult.success ? `${DOME_GREEN}10` : 'rgba(239,68,68,0.08)',
                color: webSearchResult.success ? DOME_GREEN : 'var(--dome-error, #ef4444)',
                border: `1px solid ${webSearchResult.success ? `${DOME_GREEN}25` : 'rgba(239,68,68,0.2)'}`,
              }}>
              {webSearchResult.message}
            </div>
          )}
        </SettingsCard>
      </div>

      {/* ── ACTIONS ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all"
          style={{ backgroundColor: DOME_GREEN }}
        >
          {saved ? t('settings.ai.saved_config') : t('settings.ai.save_config')}
        </button>
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        >
          {testing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('settings.ai.testing')}</> : t('settings.ai.test_connection')}
        </button>
      </div>

      {testResult && (
        <div className="flex items-center gap-2 p-3 rounded-lg"
          style={{
            backgroundColor: testResult.success ? `${DOME_GREEN}10` : 'rgba(239,68,68,0.08)',
            border: `1px solid ${testResult.success ? `${DOME_GREEN}25` : 'rgba(239,68,68,0.2)'}`,
          }}>
          {testResult.success
            ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: DOME_GREEN }} />
            : <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-error, #ef4444)' }} />}
          <span className="text-sm" style={{ color: testResult.success ? DOME_GREEN : 'var(--dome-error, #ef4444)' }}>
            {testResult.message}
          </span>
        </div>
      )}
    </div>
  );
}
