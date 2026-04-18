import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Shield, Zap, Lock, HardDrive, ArrowRight } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import ModelSelector from '@/components/settings/ModelSelector';

interface AISetupStepProps {
  onComplete: () => void;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

type OnboardingProviderType = AIProviderType | 'skip';

// Dome brand colors
const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';
const DOME_GREEN_DARK = '#3B4025';

export default function AISetupStep({ onComplete }: AISetupStepProps) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<OnboardingProviderType>(DOME_PROVIDER_ENABLED ? 'dome' : 'openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentProviderModels: ModelDefinition[] = useMemo(() => {
    if (provider === 'skip' || provider === 'ollama' || provider === 'dome') return [];
    return PROVIDERS[provider]?.models || [];
  }, [provider]);

  const handleNext = useCallback(async () => {
    setSaveError(null);

    if (provider === 'skip') {
      onComplete();
      return;
    }

    if (provider === 'dome') {
      try {
        await saveAIConfig({ provider: 'dome' });
        window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
        onComplete();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Error saving configuration');
      }
      return;
    }

    const config: Partial<AISettings> = {
      provider: provider as AIProviderType,
    };

    if (provider === 'openai' || provider === 'anthropic' || provider === 'google') {
      if (!apiKey.trim()) return;
      config.api_key = apiKey;
      config.model = model;
    }

    if (provider === 'ollama') {
      config.ollama_base_url = ollamaBaseURL;
      config.ollama_model = ollamaModel;
    }

    try {
      await saveAIConfig(config);
      window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
      onComplete();
    } catch (error) {
      console.error('[AISetupStep] Error al guardar:', error);
      setSaveError(error instanceof Error ? error.message : t('onboarding.error_saving_config'));
    }
  }, [provider, apiKey, model, ollamaBaseURL, ollamaModel, onComplete, t]);

  useEffect(() => {
    const handleFinalize = () => handleNext();
    window.addEventListener('onboarding:finalize', handleFinalize);
    return () => window.removeEventListener('onboarding:finalize', handleFinalize);
  }, [handleNext]);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const loadedProvider = (config.provider as string) === 'local' ? 'ollama' : config.provider;
        setProvider(loadedProvider as OnboardingProviderType);
        setApiKey(config.api_key || '');
        setModel(config.model || getDefaultModelId(loadedProvider as AIProviderType));
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');

      }
    };
    loadConfig();
  }, []);

  const checkOllamaConnection = useCallback(async () => {
    if (!window.electron) return;
    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      setOllamaAvailable(result.success && result.available === true);
    } catch {
      setOllamaAvailable(false);
    } finally {
      setCheckingOllama(false);
    }
  }, [ollamaBaseURL]);

  const loadOllamaModels = useCallback(async () => {
    if (!window.electron) return;
    setLoadingModels(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.listModels();
      if (result.success && Array.isArray(result.models)) {
        setOllamaModels(result.models);
      }
    } catch {
      setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [ollamaBaseURL]);

  useEffect(() => {
    if (provider === 'ollama' && window.electron) {
      checkOllamaConnection();
      loadOllamaModels();
    }
  }, [provider, checkOllamaConnection, loadOllamaModels]);

  const handleProviderSelect = (newProvider: OnboardingProviderType) => {
    setProvider(newProvider);
    if (newProvider !== 'skip' && newProvider !== 'ollama' && newProvider !== 'dome') {
      setModel(getDefaultModelId(newProvider));
    }
  };

  const canProceed =
    provider === 'skip' ||
    provider === 'dome' ||
    (provider === 'ollama' && ollamaAvailable === true) ||
    ((provider === 'openai' || provider === 'anthropic' || provider === 'google') && apiKey.trim().length > 0);

  return (
    <div className="space-y-4">
      {saveError && (
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--dome-error, #ef4444)15', border: '1px solid var(--dome-error, #ef4444)30' }}>
          <p className="text-sm" style={{ color: 'var(--dome-error, #ef4444)' }}>{saveError}</p>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-2">
        {/* Dome Provider - Hero Card */}
        {DOME_PROVIDER_ENABLED && (
          <button
            type="button"
            onClick={() => handleProviderSelect('dome')}
            className="relative w-full p-4 rounded-xl text-left transition-all cursor-pointer overflow-hidden"
            style={{
              background: provider === 'dome'
                ? `linear-gradient(135deg, ${DOME_GREEN} 0%, ${DOME_GREEN_DARK} 100%)`
                : 'var(--dome-surface)',
              border: provider === 'dome'
                ? `2px solid ${DOME_GREEN}`
                : '2px solid var(--dome-border)',
              boxShadow: provider === 'dome'
                ? `0 4px 16px ${DOME_GREEN}30`
                : 'none',
            }}
          >
            {/* Decorative background pattern */}
            {provider === 'dome' && (
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 80% 50%, ${DOME_GREEN_LIGHT} 0%, transparent 60%)`,
                }}
              />
            )}

            <div className="relative flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.15)' : DOME_GREEN_LIGHT,
                }}
              >
                <Shield
                  className="w-5 h-5"
                  style={{ color: provider === 'dome' ? DOME_GREEN_LIGHT : DOME_GREEN }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="font-semibold text-sm"
                    style={{ color: provider === 'dome' ? 'var(--base-text)' : 'var(--dome-text)' }}
                  >
                    {PROVIDERS.dome.name}
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[9px] font-bold rounded tracking-wide"
                    style={{
                      backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.2)' : DOME_GREEN_LIGHT,
                      color: provider === 'dome' ? '#fff' : DOME_GREEN,
                    }}
                  >
                    {t('onboarding.recommended')}
                  </span>
                </div>
                <p
                  className="text-xs"
                  style={{ color: provider === 'dome' ? 'rgba(255,255,255,0.75)' : 'var(--dome-text-muted)' }}
                >
                  {PROVIDERS.dome.description}. {t('onboarding.no_api_key_needed')}
                </p>
              </div>

              {/* Features & checkmark */}
                <div className="flex items-center gap-2 shrink-0">
                <div className="flex gap-1.5">
                  {[
                    { icon: Lock, label: t('onboarding.private') },
                    { icon: Zap, label: t('onboarding.fast') },
                  ].map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{
                        backgroundColor: provider === 'dome' ? 'rgba(255,255,255,0.12)' : `${DOME_GREEN}10`,
                        color: provider === 'dome' ? 'rgba(255,255,255,0.85)' : DOME_GREEN,
                      }}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      <span className="text-[10px] font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                {provider === 'dome' && (
                  <CheckCircle2 className="w-4 h-4" style={{ color: DOME_GREEN_LIGHT }} />
                )}
              </div>
            </div>
          </button>
        )}

        {/* Cloud Providers */}
        <div className="grid grid-cols-3 gap-2">
          {AI_PROVIDER_OPTIONS.filter(o => o.value !== 'dome' && o.value !== 'minimax' && o.value !== 'ollama').map((option) => {
            const isSelected = provider === option.value;
            const IconComponent = option.icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleProviderSelect(option.value)}
                disabled={option.disabled}
                className="relative p-3 rounded-xl text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isSelected ? `${DOME_GREEN}08` : 'transparent',
                  border: isSelected ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                  boxShadow: isSelected ? `0 2px 8px ${DOME_GREEN}20` : 'none',
                }}
              >
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center justify-between w-full">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center"
                      style={{
                        backgroundColor: isSelected ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)',
                      }}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{ color: isSelected ? DOME_GREEN : 'var(--dome-text-muted)' }}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold leading-none mb-0.5" style={{ color: 'var(--dome-text)' }}>
                      {option.label}
                    </p>
                    <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('onboarding.api_key_required')}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Ollama - Local */}
        {(() => {
          const ollamaOption = AI_PROVIDER_OPTIONS.find(o => o.value === 'ollama');
          if (!ollamaOption) return null;
          const isSelected = provider === 'ollama';
          const IconComponent = ollamaOption.icon;
          return (
            <button
              type="button"
              onClick={() => handleProviderSelect('ollama')}
              className="relative w-full p-3 rounded-xl text-left transition-all cursor-pointer"
              style={{
                backgroundColor: isSelected ? `${DOME_GREEN}08` : 'transparent',
                border: isSelected ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                boxShadow: isSelected ? `0 2px 8px ${DOME_GREEN}20` : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isSelected ? DOME_GREEN_LIGHT : 'var(--dome-bg-hover)',
                  }}
                >
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{ color: isSelected ? DOME_GREEN : 'var(--dome-text-muted)' }}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
                      {ollamaOption.label}
                    </p>
                    <span
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded"
                      style={{ backgroundColor: `${DOME_GREEN}15`, color: DOME_GREEN }}
                    >
                      LOCAL
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('onboarding.local_private')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-md"
                    style={{
                      backgroundColor: `${DOME_GREEN}10`,
                      color: DOME_GREEN,
                    }}
                  >
                    <HardDrive className="w-2.5 h-2.5" />
                    <span className="text-[10px] font-medium">{t('onboarding.offline')}</span>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
                  )}
                </div>
              </div>
            </button>
          );
        })()}

        {/* Skip option */}
        <button
          type="button"
          onClick={() => handleProviderSelect('skip')}
          className="w-full py-2.5 text-center text-xs transition-colors rounded-lg"
          style={{
            color: provider === 'skip' ? DOME_GREEN : 'var(--dome-text-muted)',
            backgroundColor: provider === 'skip' ? `${DOME_GREEN}08` : 'transparent',
            border: provider === 'skip' ? `1px solid ${DOME_GREEN}40` : '1px solid transparent',
          }}
        >
            {t('onboarding.configure_later')} <ArrowRight size={14} className="inline ml-1" />
        </button>
      </div>

      {/* Cloud Provider Config */}
      {provider !== 'skip' && provider !== 'ollama' && provider !== 'dome' && (
        <div
          className="p-4 rounded-xl space-y-4"
          style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          <div>
            <label htmlFor="api-key" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('onboarding.api_key')}
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || t('onboarding.enter_api_key')}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--dome-bg-hover)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
              }}
              onFocus={(e) => { e.target.style.borderColor = DOME_GREEN; e.target.style.boxShadow = `0 0 0 3px ${DOME_GREEN}15`; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--dome-border)'; e.target.style.boxShadow = 'none'; }}
            />
            {PROVIDERS[provider]?.docsUrl && (
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('onboarding.get_key_at')}{' '}
                <a
                  href={PROVIDERS[provider].docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                  style={{ color: DOME_GREEN }}
                >
                  {PROVIDERS[provider].docsUrl.replace('https://', '')}
                </a>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('onboarding.model')}
            </label>
            <ModelSelector
              models={currentProviderModels.slice(0, 6)}
              selectedModelId={model}
              onChange={setModel}
              showBadges={true}
              showDescription={false}
              showContextWindow={false}
              searchable={currentProviderModels.length > 5}
              placeholder={t('onboarding.select_model')}
              providerType="cloud"
            />
          </div>

        </div>
      )}

      {/* Ollama Config */}
      {provider === 'ollama' && (
        <div
          className="p-4 rounded-xl space-y-4"
          style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          {/* Connection Status */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>{t('onboarding.status')}</span>
              {checkingOllama ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('onboarding.verifying')}</span>
                </div>
              ) : ollamaAvailable === true ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
                  <span className="text-xs font-medium" style={{ color: DOME_GREEN }}>{t('onboarding.connected')}</span>
                </div>
              ) : ollamaAvailable === false ? (
                <div className="flex items-center gap-1.5" style={{ color: 'var(--dome-error, #ef4444)' }}>
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{t('onboarding.not_available')}</span>
                </div>
              ) : (
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('onboarding.not_verified')}</span>
              )}
            </div>
            <button
              type="button"
              onClick={checkOllamaConnection}
              disabled={checkingOllama}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
              style={{
                backgroundColor: DOME_GREEN,
                color: 'var(--dome-on-accent, #fff)',
                border: 'none',
                cursor: checkingOllama ? 'not-allowed' : 'pointer',
                opacity: checkingOllama ? 0.6 : 1,
              }}
            >
              <RefreshCw className={`w-3 h-3 ${checkingOllama ? 'animate-spin' : ''}`} />
              {t('onboarding.test_connection')}
            </button>
          </div>

          {ollamaAvailable === false && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--warning)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
              <p className="text-xs">
                {t('onboarding.ollama_install_hint')}{' '}
                <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline font-medium">{t('onboarding.download_ollama')}</a>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="ollama-url" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('onboarding.ollama_url')}
            </label>
            <input
              id="ollama-url"
              type="url"
              value={ollamaBaseURL}
              onChange={(e) => setOllamaBaseURL(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              onFocus={(e) => { e.target.style.borderColor = DOME_GREEN; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--dome-border)'; }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('onboarding.chat_model')}
              </label>
              <button
                type="button"
                onClick={loadOllamaModels}
                disabled={loadingModels}
                className="text-[11px] font-medium flex items-center gap-1 hover:opacity-80"
                style={{ color: DOME_GREEN, cursor: loadingModels ? 'not-allowed' : 'pointer', opacity: loadingModels ? 0.6 : 1 }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
                {t('onboarding.refresh_list')}
              </button>
            </div>
            {loadingModels ? (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('onboarding.loading_models')}</span>
              </div>
            ) : ollamaModels.length > 0 ? (
              <ModelSelector
                models={ollamaModels.map((m) => ({
                  id: m.name,
                  name: m.name,
                  description: `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB`,
                  reasoning: false,
                  input: ['text'],
                  contextWindow: 0,
                  maxTokens: 0,
                }))}
                selectedModelId={ollamaModel}
                onChange={setOllamaModel}
                searchable={ollamaModels.length > 5}
                showBadges={false}
                showDescription={true}
                showContextWindow={false}
                placeholder={t('onboarding.select_model')}
                providerType="ollama"
              />
            ) : (
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.2"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              />
            )}
          </div>

        </div>
      )}

      {/* Hidden button for OnboardingStep to use */}
      <div style={{ display: 'none' }}>
        <button onClick={handleNext} disabled={!canProceed} />
      </div>
    </div>
  );
}
