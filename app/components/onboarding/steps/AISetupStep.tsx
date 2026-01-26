'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Clock, Cpu, Sparkles, Zap, Globe, Gift, Shield } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
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

// Provider options with icons and descriptions for onboarding
// Synthetic first as it's free and recommended
const ONBOARDING_PROVIDERS = [
  {
    value: 'synthetic' as const,
    label: 'Synthetic',
    description: '19 modelos gratuitos: MiniMax, DeepSeek, Qwen, Llama',
    icon: Gift,
    badge: 'GRATIS',
    badgeColor: 'green' as const,
    recommended: true,
  },
  {
    value: 'skip' as const,
    label: 'Configurar más tarde',
    description: 'Puedes configurar la IA desde los ajustes',
    icon: Clock,
  },
  {
    value: 'ollama' as const,
    label: PROVIDERS.ollama.name,
    description: PROVIDERS.ollama.description + '. Requiere Ollama instalado.',
    icon: Cpu,
  },
  {
    value: 'openai' as const,
    label: PROVIDERS.openai.name,
    description: PROVIDERS.openai.description + '. Requiere API key.',
    icon: Sparkles,
  },
  {
    value: 'anthropic' as const,
    label: PROVIDERS.anthropic.name,
    description: PROVIDERS.anthropic.description + '. Requiere API key.',
    icon: Zap,
  },
  {
    value: 'google' as const,
    label: PROVIDERS.google.name,
    description: PROVIDERS.google.description + '. Requiere API key.',
    icon: Globe,
  },
  {
    value: 'venice' as const,
    label: 'Venice',
    description: 'Modelos con privacidad total, sin logging.',
    icon: Shield,
    badge: 'PRIVADO',
    badgeColor: 'purple' as const,
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
      onComplete();
    } catch (error) {
      console.error('[AISetupStep] Error al guardar:', error);
      setSaveError(error instanceof Error ? error.message : 'Error al guardar la configuración');
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
        const loadedProvider = config.provider === 'local' ? 'ollama' : config.provider;
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
      setOllamaAvailable(result.success && result.available);
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
                Sin registro necesario
              </span>
            </div>
            <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--secondary)' }}>
              Synthetic ofrece acceso gratuito a modelos de última generación.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary)',
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
                Privacidad garantizada
              </span>
            </div>
            <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--secondary)' }}>
              Modelos ejecutados de forma privada sin logging. API key opcional para premium.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
              API Key <span className="opacity-50">(opcional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Para modelos premium..."
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary)',
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
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={providerConfig.apiKeyPlaceholder || 'Enter API key...'}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--primary)',
              border: '1px solid var(--border)',
            }}
          />
          {providerConfig.docsUrl && (
            <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary)' }}>
              Obtén tu API key en{' '}
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
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
            Modelo
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--primary)',
              border: '1px solid var(--border)',
            }}
          >
            {displayModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.recommended ? '(Recomendado)' : ''}
              </option>
            ))}
          </select>
        </div>

        {!providerConfig.supportsEmbeddings && (
          <p className="text-xs opacity-50" style={{ color: 'var(--secondary)' }}>
            Nota: {providerConfig.name} no incluye embeddings. Puedes usar Ollama o Google para búsqueda semántica.
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

      <p className="text-sm" style={{ color: 'var(--secondary)' }}>
        Elige cómo quieres que funcione la inteligencia artificial en Dome.
      </p>

      {/* Provider Selection */}
      <div className="space-y-2">
        {ONBOARDING_PROVIDERS.map((option) => {
          const Icon = option.icon;
          const isSelected = provider === option.value;
          const badge = 'badge' in option ? option.badge : undefined;
          const badgeColor = 'badgeColor' in option ? option.badgeColor : undefined;
          const recommended = 'recommended' in option ? option.recommended : false;
          
          return (
            <button
              key={option.value}
              onClick={() => handleProviderSelect(option.value)}
              className={`w-full p-4 rounded-xl text-left transition-all flex items-start gap-4 relative ${
                isSelected ? 'ring-2 ring-offset-2' : 'hover:bg-black/5 dark:hover:bg-white/5'
              } ${recommended && !isSelected ? 'border-2 border-green-500/50' : ''}`}
              style={{
                backgroundColor: isSelected ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                color: isSelected ? 'white' : 'var(--primary)',
                border: isSelected ? 'none' : recommended ? undefined : '1px solid var(--border)',
                ringColor: 'var(--brand-primary)',
              }}
            >
              {badge && (
                <span 
                  className={`absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    badgeColor === 'green' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-purple-500 text-white'
                  }`}
                >
                  {badge}
                </span>
              )}
              <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/20' : recommended ? 'bg-green-500/10' : 'bg-black/5 dark:bg-white/10'}`}>
                <Icon className={`w-5 h-5 ${recommended && !isSelected ? 'text-green-600' : ''}`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold flex items-center gap-2">
                  {option.label}
                  {recommended && !isSelected && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                      Recomendado
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-0.5 ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                  {option.description}
                </div>
              </div>
              {isSelected && (
                <CheckCircle2 className="w-5 h-5 mt-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Cloud Provider Configuration (OpenAI, Anthropic, Google) */}
      {renderCloudProviderConfig()}

      {/* Ollama Configuration */}
      {provider === 'ollama' && (
        <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                Estado:
              </span>
              {checkingOllama ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--secondary)' }} />
                  <span className="text-xs" style={{ color: 'var(--secondary)' }}>Verificando...</span>
                </div>
              ) : ollamaAvailable === true ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Conectado</span>
                </div>
              ) : ollamaAvailable === false ? (
                <div className="flex items-center gap-1.5 text-red-500">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">No disponible</span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: 'var(--secondary)' }}>Sin verificar</span>
              )}
            </div>
            <button
              onClick={checkOllamaConnection}
              disabled={checkingOllama}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 hover:opacity-80"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
              }}
            >
              <RefreshCw className={`w-3 h-3 ${checkingOllama ? 'animate-spin' : ''}`} />
              Probar conexión
            </button>
          </div>

          {ollamaAvailable === false && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Asegúrate de que Ollama esté instalado y ejecutándose. Descárgalo en ollama.ai
              </p>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
              URL de Ollama
            </label>
            <input
              type="url"
              value={ollamaBaseURL}
              onChange={(e) => setOllamaBaseURL(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Model Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--primary)' }}>
                Modelo de chat
              </label>
              <button
                onClick={loadOllamaModels}
                disabled={loadingModels}
                className="text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 hover:opacity-80"
                style={{ color: 'var(--brand-primary)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
                Actualizar lista
              </button>
            </div>
            {loadingModels ? (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--secondary)' }} />
                <span className="text-sm" style={{ color: 'var(--secondary)' }}>Cargando modelos...</span>
              </div>
            ) : ollamaModels.length > 0 ? (
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary)',
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
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.2"
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary)',
                  border: '1px solid var(--border)',
                }}
              />
            )}
          </div>

          {/* Embedding Model */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
              Modelo de embeddings
            </label>
            {ollamaModels.length > 0 ? (
              <select
                value={ollamaEmbeddingModel}
                onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary)',
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
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--primary)',
                  border: '1px solid var(--border)',
                }}
              />
            )}
            <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary)' }}>
              Usado para búsqueda semántica. Recomendado: mxbai-embed-large o nomic-embed-text
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
