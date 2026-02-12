
import { useState, useEffect, useRef, useMemo } from 'react';
import type { ComponentType } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Clock, Gift, Shield } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS } from '@/lib/ai/provider-options';
import { getSyntheticModels } from '@/lib/ai/catalogs/synthetic';
import { getVeniceModels } from '@/lib/ai/catalogs/venice';

interface AISetupStepProps {
  onComplete: () => void;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

type OnboardingProviderType = AIProviderType | 'skip';

/** Onboarding-only option: configure AI later from settings. */
const SKIP_OPTION = {
  value: 'skip' as const,
  label: 'Configure later',
  description: 'You can configure AI from settings',
  icon: Clock,
};

/** Sections for provider selection: Gratis, Cloud, Local, Later. */
const SECTIONS: Array<{
  title: string;
  options: Array<{ value: OnboardingProviderType; label: string; description: string; icon: ComponentType<{ className?: string }>; badge?: string; badgeColor?: 'green' | 'purple'; recommended?: boolean }>;
}> = [
  {
    title: 'Gratis',
    options: AI_PROVIDER_OPTIONS.filter((o) => o.value === 'synthetic').map((o) => ({ ...o, value: o.value as OnboardingProviderType })),
  },
  {
    title: 'En la nube',
    options: AI_PROVIDER_OPTIONS.filter((o) => ['openai', 'anthropic', 'google', 'venice'].includes(o.value)).map((o) => ({ ...o, value: o.value as OnboardingProviderType })),
  },
  {
    title: 'Local',
    options: AI_PROVIDER_OPTIONS.filter((o) => o.value === 'ollama').map((o) => ({ ...o, value: o.value as OnboardingProviderType })),
  },
  {
    title: 'Más tarde',
    options: [{ ...SKIP_OPTION, value: 'skip' as const }],
  },
];

export default function AISetupStep({ onComplete }: AISetupStepProps) {
  const [provider, setProvider] = useState<OnboardingProviderType>('skip');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState('mxbai-embed-large');
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Get current provider's models (for cloud providers, including dynamic catalogs)
  const currentProviderModels: ModelDefinition[] = useMemo(() => {
    if (provider === 'skip' || provider === 'ollama') return [];
    if (provider === 'synthetic') return getSyntheticModels();
    if (provider === 'venice') return getVeniceModels();
    return PROVIDERS[provider]?.models || [];
  }, [provider]);

  const handleNext = async () => {
    setSaveError(null);
    if (provider === 'skip') {
      onComplete();
      return;
    }

    const config: Partial<AISettings> = {
      provider: provider as AIProviderType,
    };

    if (provider === 'openai' || provider === 'anthropic' || provider === 'google') {
      if (!apiKey.trim()) return;
      config.api_key = apiKey;
      config.model = model;
      
      // Set default embedding model for providers that support it
      if (PROVIDERS[provider].supportsEmbeddings) {
        config.embedding_model = getDefaultEmbeddingModelId(provider);
      }
    }

    // Synthetic - no API key needed
    if (provider === 'synthetic') {
      config.model = model || 'hf:MiniMaxAI/MiniMax-M2.1';
    }

    // Venice - optional API key
    if (provider === 'venice') {
      config.model = model || 'llama-3.3-70b';
      if (apiKey.trim()) {
        config.api_key = apiKey;
      }
    }

    if (provider === 'ollama') {
      config.ollama_base_url = ollamaBaseURL;
      config.ollama_model = ollamaModel;
      config.ollama_embedding_model = ollamaEmbeddingModel;
    }

    try {
      await saveAIConfig(config);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
      }
      onComplete();
    } catch (error) {
      console.error('[AISetupStep] Error al guardar:', error);
      setSaveError(error instanceof Error ? error.message : 'Error saving configuration');
    }
  };

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  useEffect(() => {
    const handleFinalize = () => {
      handleNextRef.current();
    };
    window.addEventListener('onboarding:finalize', handleFinalize);
    return () => window.removeEventListener('onboarding:finalize', handleFinalize);
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config) {
        // Handle legacy 'local' provider by converting to 'ollama'
        const loadedProvider = (config.provider as string) === 'local' ? 'ollama' : config.provider;
        setProvider(loadedProvider as AIProviderType);
        setApiKey(config.api_key || '');
        setModel(config.model || getDefaultModelId(loadedProvider as AIProviderType));
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');
        setOllamaEmbeddingModel(config.ollama_embedding_model || 'mxbai-embed-large');
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    if (provider === 'ollama' && window.electron) {
      checkOllamaConnection();
      loadOllamaModels();
    }
  }, [provider, ollamaBaseURL]);

  const checkOllamaConnection = async () => {
    if (!window.electron) return;
    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      setOllamaAvailable(result.success && result.available === true);
    } catch (error) {
      setOllamaAvailable(false);
    } finally {
      setCheckingOllama(false);
    }
  };

  const loadOllamaModels = async () => {
    if (!window.electron) return;
    setLoadingModels(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.listModels();
      if (result.success && Array.isArray(result.models)) {
        setOllamaModels(result.models);
      }
    } catch (error) {
      setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleProviderSelect = (newProvider: OnboardingProviderType) => {
    setProvider(newProvider);
    // Set default model when selecting provider
    if (newProvider !== 'skip' && newProvider !== 'ollama') {
      if (newProvider === 'synthetic') {
        setModel('hf:MiniMaxAI/MiniMax-M2.1');
      } else if (newProvider === 'venice') {
        setModel('llama-3.3-70b');
      } else {
        setModel(getDefaultModelId(newProvider));
      }
    }
  };

  const canProceed =
    provider === 'skip' ||
    provider === 'synthetic' || // Synthetic doesn't need API key
    provider === 'venice' || // Venice API key is optional
    (provider === 'ollama' && ollamaAvailable === true) ||
    ((provider === 'openai' || provider === 'anthropic' || provider === 'google') && apiKey.trim().length > 0);

  // Render cloud provider configuration (OpenAI, Anthropic, Google, Synthetic, Venice)
  const renderCloudProviderConfig = () => {
    if (provider === 'skip' || provider === 'ollama') return null;
    
    const providerConfig = PROVIDERS[provider];
    
    // Show only a subset of models in onboarding (first 6)
    const displayModels = currentProviderModels.slice(0, 6);

    // Synthetic - no API key needed
    if (provider === 'synthetic') {
      return (
        <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                No registration required
              </span>
            </div>
            <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--secondary-text)' }}>
              Synthetic offers free access to state-of-the-art models.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            >
              {displayModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.reasoning ? '(Reasoning)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    // Venice - optional API key
    if (provider === 'venice') {
      return (
        <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Privacy Guaranteed
              </span>
            </div>
            <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--secondary-text)' }}>
              Models run privately without logging. Optional API key for premium.
            </p>
          </div>

          <div>
            <label htmlFor="onboarding-venice-api-key" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              API Key <span className="opacity-50">(optional)</span>
            </label>
            <input
              id="onboarding-venice-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="For premium models..."
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div>
            <label htmlFor="onboarding-venice-model" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              Modelo
            </label>
            <select
              id="onboarding-venice-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            >
              {displayModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (!providerConfig) return null;

    return (
      <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div>
          <label htmlFor="onboarding-api-key" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
            API Key
          </label>
          <input
            id="onboarding-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={providerConfig.apiKeyPlaceholder || 'Enter API key...'}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--primary-text)',
              border: '1px solid var(--border)',
            }}
          />
          {providerConfig.docsUrl && (
            <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary-text)' }}>
              Get your API key at{' '}
              <a 
                href={providerConfig.docsUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                {providerConfig.docsUrl.replace('https://', '')}
              </a>
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
            Modelo
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--primary-text)',
              border: '1px solid var(--border)',
            }}
          >
            {displayModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.recommended ? '(Recommended)' : ''}
              </option>
            ))}
          </select>
        </div>

        {!providerConfig.supportsEmbeddings && (
          <p className="text-xs opacity-50" style={{ color: 'var(--secondary-text)' }}>
            Note: {providerConfig.name} doesn't include embeddings. You can use Ollama or Google for semantic search.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20" role="alert">
          <p className="text-sm text-red-500">{saveError}</p>
        </div>
      )}

      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        Choose how you want artificial intelligence to work in Dome.
      </p>

      {/* Provider Selection by section */}
      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider font-semibold opacity-60" style={{ color: 'var(--secondary-text)' }}>
              {section.title}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {section.options.map((option) => {
                const Icon = option.icon;
                const isSelected = provider === option.value;
                const badge = option.badge;
                const badgeColor = option.badgeColor;
                const recommended = option.recommended ?? false;

                return (
                  <button
                    key={option.value}
                    onClick={() => handleProviderSelect(option.value)}
                    className={`w-full p-4 rounded-xl text-left transition-all flex items-start gap-4 relative ${
                      isSelected ? 'ring-2 ring-offset-2' : 'hover:bg-black/5 dark:hover:bg-white/5'
                    } ${recommended && !isSelected ? 'border-2 border-green-500/50' : ''}`}
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: isSelected ? 'white' : 'var(--primary-text)',
                      border: isSelected ? 'none' : recommended ? undefined : '1px solid var(--border)',
                    }}
                  >
                    {badge && (
                      <span
                        className={`absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          badgeColor === 'green' ? 'bg-green-500 text-white' : 'bg-purple-500 text-white'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                    <div
                      className={`p-2 rounded-lg ${isSelected ? 'bg-white/20' : recommended ? 'bg-green-500/10' : 'bg-black/5 dark:bg-white/10'}`}
                    >
                      <Icon className={`w-5 h-5 ${recommended && !isSelected ? 'text-green-600' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold flex items-center gap-2">
                        {option.label}
                        {recommended && !isSelected && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 shrink-0">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className={`text-sm mt-0.5 ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                        {option.description}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 mt-1 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Cloud Provider Configuration (OpenAI, Anthropic, Google) */}
      {renderCloudProviderConfig()}

      {/* Ollama Configuration */}
      {provider === 'ollama' && (
        <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                Status:
              </span>
              {checkingOllama ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--secondary-text)' }} />
                  <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Checking...</span>
                </div>
              ) : ollamaAvailable === true ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
              ) : ollamaAvailable === false ? (
                <div className="flex items-center gap-1.5 text-red-500">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Not available</span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: 'var(--secondary-text)' }}>Not verified</span>
              )}
            </div>
            <button
              onClick={checkOllamaConnection}
              disabled={checkingOllama}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 hover:opacity-80"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'white',
              }}
            >
              <RefreshCw className={`w-3 h-3 ${checkingOllama ? 'animate-spin' : ''}`} />
              Test connection
            </button>
          </div>

          {ollamaAvailable === false && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Make sure Ollama is installed and running. Download it at ollama.ai
              </p>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label htmlFor="onboarding-ollama-url" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              Ollama URL
            </label>
            <input
              id="onboarding-ollama-url"
              type="url"
              value={ollamaBaseURL}
              onChange={(e) => setOllamaBaseURL(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Model Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="onboarding-ollama-model" className="block text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                Chat model
              </label>
              <button
                onClick={loadOllamaModels}
                disabled={loadingModels}
                className="text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 hover:opacity-80"
                style={{ color: 'var(--accent)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
                Refresh list
              </button>
            </div>
            {loadingModels ? (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--secondary-text)' }} />
                <span className="text-sm" style={{ color: 'var(--secondary-text)' }}>Loading models...</span>
              </div>
            ) : ollamaModels.length > 0 ? (
              <select
                id="onboarding-ollama-model"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary-text)',
                  border: '1px solid var(--border)',
                }}
              >
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)}GB)
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="onboarding-ollama-model"
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.2"
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary-text)',
                  border: '1px solid var(--border)',
                }}
              />
            )}
          </div>

          {/* Embedding Model */}
          <div>
            <label htmlFor="onboarding-ollama-embedding" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              Embedding model
            </label>
            {ollamaModels.length > 0 ? (
              <select
                id="onboarding-ollama-embedding"
                value={ollamaEmbeddingModel}
                onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary-text)',
                  border: '1px solid var(--border)',
                }}
              >
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={ollamaEmbeddingModel}
                onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                placeholder="mxbai-embed-large"
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary-text)',
                  border: '1px solid var(--border)',
                }}
              />
            )}
            <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary-text)' }}>
              Used for semantic search. Recommended: mxbai-embed-large or nomic-embed-text
            </p>
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
