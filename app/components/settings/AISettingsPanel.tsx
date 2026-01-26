'use client';

import { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, Brain, ImageIcon, Gift, Shield, Key, Lock } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings, AnthropicAuthMode } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  formatContextWindow,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import { getSyntheticModels } from '@/lib/ai/catalogs/synthetic';
import { getVeniceModels, type VenicePrivacyMode } from '@/lib/ai/catalogs/venice';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

// Provider options for the selector
const CLOUD_PROVIDERS: Array<{
  value: AIProviderType;
  name: string;
  description: string;
  icon?: string;
  badge?: string;
  badgeColor?: string;
}> = [
  { value: 'synthetic', name: 'Synthetic', description: 'Modelos gratuitos: MiniMax, DeepSeek, Qwen', badge: 'GRATIS', badgeColor: 'green' },
  { value: 'openai', name: PROVIDERS.openai.name, description: PROVIDERS.openai.description },
  { value: 'anthropic', name: PROVIDERS.anthropic.name, description: PROVIDERS.anthropic.description },
  { value: 'google', name: PROVIDERS.google.name, description: PROVIDERS.google.description },
  { value: 'venice', name: 'Venice', description: 'Privacidad y anonimato', badge: 'PRIVADO', badgeColor: 'purple' },
  { value: 'ollama', name: PROVIDERS.ollama.name, description: PROVIDERS.ollama.description },
];

export default function AISettingsPanel() {
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState('mxbai-embed-large');
  const [ollamaTemperature, setOllamaTemperature] = useState(0.7);
  const [ollamaTopP, setOllamaTopP] = useState(0.9);
  const [ollamaNumPredict, setOllamaNumPredict] = useState(500);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Anthropic auth mode (api_key vs oauth/token)
  const [authMode, setAuthMode] = useState<AnthropicAuthMode>('api_key');
  const [oauthToken, setOauthToken] = useState('');

  // Venice privacy mode
  const [venicePrivacyMode, setVenicePrivacyMode] = useState<VenicePrivacyMode>('private');

  // Ollama-specific state
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Claude Max Proxy state (for Claude Pro/Max subscriptions)
  const [claudeMaxProxyAvailable, setClaudeMaxProxyAvailable] = useState<boolean | null>(null);
  const [checkingProxy, setCheckingProxy] = useState(false);

  // Get current provider's models - dynamically load from catalogs for Synthetic/Venice
  const currentProviderModels: ModelDefinition[] = useMemo(() => {
    if (provider === 'synthetic') {
      return getSyntheticModels();
    }
    if (provider === 'venice') {
      return getVeniceModels();
    }
    return PROVIDERS[provider]?.models || [];
  }, [provider]);

  const currentProviderEmbeddingModels = PROVIDERS[provider]?.embeddingModels || [];

  // Load existing configuration
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config) {
        // Handle legacy 'local' provider by converting to 'ollama'
        const loadedProvider = config.provider === 'local' ? 'ollama' : config.provider;
        setProvider(loadedProvider as AIProviderType);
        setApiKey(config.api_key || '');
        
        // Set model with defaults based on provider
        const defaultModel = getDefaultModelId(loadedProvider as AIProviderType);
        const defaultEmbeddingModel = getDefaultEmbeddingModelId(loadedProvider as AIProviderType);
        
        setModel(config.model || defaultModel);
        setEmbeddingModel(config.embedding_model || defaultEmbeddingModel);
        
        // Check if model is in presets, if not enable custom
        const providerModels = PROVIDERS[loadedProvider as AIProviderType]?.models || [];
        if (config.model && !providerModels.find(m => m.id === config.model)) {
          setCustomModel(true);
        }
        
        // Anthropic auth mode
        setAuthMode(config.auth_mode || 'api_key');
        setOauthToken(config.oauth_token || '');
        
        // Venice privacy mode
        setVenicePrivacyMode(config.venice_privacy_mode || 'private');
        
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');
        setOllamaEmbeddingModel(config.ollama_embedding_model || 'mxbai-embed-large');
        setOllamaTemperature(config.ollama_temperature ?? 0.7);
        setOllamaTopP(config.ollama_top_p ?? 0.9);
        setOllamaNumPredict(config.ollama_num_predict ?? 500);
      }
    };
    loadConfig();
  }, []);

  // Check Ollama availability when provider changes or URL changes
  useEffect(() => {
    if (provider === 'ollama') {
      checkOllamaConnection();
      loadOllamaModels();
    }
  }, [provider, ollamaBaseURL]);

  // Check Claude Max Proxy availability when Anthropic subscription mode is selected
  useEffect(() => {
    if (provider === 'anthropic' && (authMode === 'oauth' || authMode === 'token')) {
      checkClaudeMaxProxy();
    }
  }, [provider, authMode]);

  const checkClaudeMaxProxy = async () => {
    if (!window.electron?.ai?.checkClaudeMaxProxy) {
      setClaudeMaxProxyAvailable(false);
      return;
    }

    setCheckingProxy(true);
    try {
      const result = await window.electron.ai.checkClaudeMaxProxy();
      setClaudeMaxProxyAvailable(result.success && result.available);
    } catch (error) {
      console.error('Error checking Claude Max Proxy:', error);
      setClaudeMaxProxyAvailable(false);
    } finally {
      setCheckingProxy(false);
    }
  };

  const checkOllamaConnection = async () => {
    if (!window.electron) return;

    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      setOllamaAvailable(result.success && result.available);
    } catch (error) {
      console.error('Error checking Ollama:', error);
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
      } else {
        setOllamaModels([]);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
      setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleProviderChange = (newProvider: AIProviderType) => {
    setProvider(newProvider);
    setCustomModel(false);
    
    // Set default models for the new provider
    const defaultModel = getDefaultModelId(newProvider);
    const defaultEmbeddingModel = getDefaultEmbeddingModelId(newProvider);
    
    setModel(defaultModel);
    setEmbeddingModel(defaultEmbeddingModel);
  };

  const handleSave = async () => {
    // Only save settings relevant to the selected provider
    const config: Partial<AISettings> = {
      provider,
    };

    // Provider-specific settings
    switch (provider) {
      case 'openai':
        config.api_key = apiKey;
        config.model = model;
        config.embedding_model = embeddingModel;
        break;

      case 'anthropic':
        config.api_key = apiKey;
        config.model = model;
        config.auth_mode = authMode;
        if (authMode === 'oauth' || authMode === 'token') {
          config.oauth_token = oauthToken;
        }
        // Note: Anthropic doesn't support embeddings
        break;

      case 'google':
        config.api_key = apiKey;
        config.model = model;
        config.embedding_model = embeddingModel;
        break;

      case 'synthetic':
        // Synthetic doesn't need API key
        config.model = model;
        break;

      case 'venice':
        if (apiKey) {
          config.api_key = apiKey; // Optional for Venice
        }
        config.model = model;
        config.venice_privacy_mode = venicePrivacyMode;
        break;

      case 'ollama':
        config.ollama_base_url = ollamaBaseURL;
        config.ollama_model = ollamaModel;
        config.ollama_embedding_model = ollamaEmbeddingModel;
        config.ollama_temperature = ollamaTemperature;
        config.ollama_top_p = ollamaTopP;
        config.ollama_num_predict = ollamaNumPredict;
        break;
    }

    try {
      await saveAIConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('[AISettings] Error saving config:', error);
    }
  };

  // Render model badge
  const renderModelBadges = (modelDef: { reasoning: boolean; input: Array<'text' | 'image'> }, isFree?: boolean, isPrivate?: boolean) => (
    <span className="flex items-center gap-1.5 ml-2 flex-wrap">
      {isFree && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
          <Gift className="w-2.5 h-2.5" />
          Gratis
        </span>
      )}
      {isPrivate && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
          <Shield className="w-2.5 h-2.5" />
          Privado
        </span>
      )}
      {modelDef.reasoning && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
          <Brain className="w-2.5 h-2.5" />
          Reasoning
        </span>
      )}
      {modelDef.input.includes('image') && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <ImageIcon className="w-2.5 h-2.5" />
          Vision
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--primary)' }}>
          AI Configuration
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--secondary)' }}>
          Configure your AI provider for semantic search, transcriptions, and assistant
        </p>
      </div>

      {/* Provider Selection */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary)' }}>
          Provider
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CLOUD_PROVIDERS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleProviderChange(option.value)}
              className={`px-4 py-3 rounded-lg text-left transition-all relative ${
                provider === option.value ? 'bg-blue-500/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              style={{
                color: provider === option.value ? 'var(--brand-primary)' : 'var(--primary)',
                border: provider === option.value ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
              }}
            >
              {option.badge && (
                <span 
                  className={`absolute -top-2 -right-2 px-1.5 py-0.5 text-[9px] font-bold rounded ${
                    option.badgeColor === 'green' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-purple-500 text-white'
                  }`}
                >
                  {option.badge}
                </span>
              )}
              <div className="font-medium flex items-center gap-1.5">
                {option.value === 'synthetic' && <Gift className="w-4 h-4" />}
                {option.value === 'venice' && <Shield className="w-4 h-4" />}
                {option.name}
              </div>
              <div className="text-xs opacity-60 mt-0.5">{option.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* API Configuration */}
      <section className="space-y-6 max-w-lg">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary)' }}>
          Configuration
        </h3>

        {/* Synthetic - No API key needed */}
        {provider === 'synthetic' && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-700 dark:text-green-400">Modelos Gratuitos</span>
            </div>
            <p className="text-sm opacity-80" style={{ color: 'var(--secondary)' }}>
              Synthetic ofrece acceso gratuito a modelos de MiniMax, DeepSeek, Qwen, Llama y más.
              No requiere API key ni registro.
            </p>
          </div>
        )}

        {/* Venice - Optional API key */}
        {provider === 'venice' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-700 dark:text-purple-400">Privacidad Garantizada</span>
              </div>
              <p className="text-sm opacity-80" style={{ color: 'var(--secondary)' }}>
                Venice ejecuta modelos de forma privada sin logging. API key opcional para modelos premium.
              </p>
            </div>

            {/* Privacy Mode Toggle */}
            <div className="group">
              <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                Modo de Privacidad
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVenicePrivacyMode('private')}
                  className={`p-3 rounded-lg text-left transition-all ${
                    venicePrivacyMode === 'private' ? 'bg-purple-500/10' : 'hover:bg-black/5'
                  }`}
                  style={{
                    border: venicePrivacyMode === 'private' ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span className="font-medium text-sm">Private</span>
                  </div>
                  <p className="text-xs opacity-60 mt-1">Sin logging, efímero</p>
                </button>
                <button
                  type="button"
                  onClick={() => setVenicePrivacyMode('anonymized')}
                  className={`p-3 rounded-lg text-left transition-all ${
                    venicePrivacyMode === 'anonymized' ? 'bg-purple-500/10' : 'hover:bg-black/5'
                  }`}
                  style={{
                    border: venicePrivacyMode === 'anonymized' ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span className="font-medium text-sm">Anonymized</span>
                  </div>
                  <p className="text-xs opacity-60 mt-1">Modelos propietarios</p>
                </button>
              </div>
            </div>

            {/* Optional API Key */}
            <div className="group">
              <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                API Key <span className="opacity-50">(opcional)</span>
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Para modelos premium..."
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-50 hover:opacity-100"
                  style={{ color: 'var(--secondary)' }}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API Key for OpenAI and Google */}
        {(provider === 'openai' || provider === 'google') && (
          <div className="group">
            <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || 'Enter API key...'}
                className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                style={{
                  color: 'var(--primary)',
                  borderColor: 'var(--border)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-50 hover:opacity-100"
                style={{ color: 'var(--secondary)' }}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {PROVIDERS[provider]?.docsUrl && (
              <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary)' }}>
                Obtén tu API key en{' '}
                <a 
                  href={PROVIDERS[provider].docsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {PROVIDERS[provider].docsUrl}
                </a>
              </p>
            )}
          </div>
        )}

        {/* Anthropic - API Key or OAuth Token */}
        {provider === 'anthropic' && (
          <div className="space-y-4">
            {/* Auth Mode Toggle */}
            <div className="group">
              <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                Método de Autenticación
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('api_key')}
                  className={`p-3 rounded-lg text-left transition-all ${
                    authMode === 'api_key' ? 'bg-blue-500/10' : 'hover:bg-black/5'
                  }`}
                  style={{
                    border: authMode === 'api_key' ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    <span className="font-medium text-sm">API Key</span>
                  </div>
                  <p className="text-xs opacity-60 mt-1">Pago por uso</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('oauth')}
                  className={`p-3 rounded-lg text-left transition-all ${
                    authMode === 'oauth' || authMode === 'token' ? 'bg-blue-500/10' : 'hover:bg-black/5'
                  }`}
                  style={{
                    border: authMode === 'oauth' || authMode === 'token' ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span className="font-medium text-sm">Suscripción</span>
                  </div>
                  <p className="text-xs opacity-60 mt-1">Claude Pro/Max</p>
                </button>
              </div>
            </div>

            {/* API Key Input */}
            {authMode === 'api_key' && (
              <div className="group">
                <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    style={{
                      color: 'var(--primary)',
                      borderColor: 'var(--border)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-50 hover:opacity-100"
                    style={{ color: 'var(--secondary)' }}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary)' }}>
                  Obtén tu API key en{' '}
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
                    console.anthropic.com
                  </a>
                </p>
              </div>
            )}

            {/* Claude Code CLI Status and Instructions */}
            {(authMode === 'oauth' || authMode === 'token') && (
              <div className="space-y-4">
                {/* CLI Status */}
                <div className="p-4 rounded-lg border" style={{ 
                  borderColor: claudeMaxProxyAvailable ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)',
                  backgroundColor: claudeMaxProxyAvailable ? 'rgba(34, 197, 94, 0.05)' : 'rgba(245, 158, 11, 0.05)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {checkingProxy ? (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--secondary)' }} />
                      ) : claudeMaxProxyAvailable ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-medium text-sm" style={{ color: 'var(--primary)' }}>
                        Claude Code CLI
                      </span>
                    </div>
                    <button
                      onClick={checkClaudeMaxProxy}
                      disabled={checkingProxy}
                      className="text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50"
                    >
                      Verificar
                    </button>
                  </div>
                  
                  {claudeMaxProxyAvailable ? (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Claude Code CLI disponible. Tu suscripcion Claude Pro/Max esta lista para usar.
                    </p>
                  ) : (
                    <div className="text-xs" style={{ color: 'var(--secondary)' }}>
                      <p className="mb-2 text-amber-600 dark:text-amber-400 font-medium">
                        Claude Code CLI no encontrado. Para usar tu suscripcion Claude Pro/Max:
                      </p>
                      <ol className="list-decimal list-inside space-y-1 ml-1">
                        <li>Instala Claude Code: <code className="bg-black/10 dark:bg-white/10 px-1 rounded">npm install -g @anthropic-ai/claude-code</code></li>
                        <li>Autentica: <code className="bg-black/10 dark:bg-white/10 px-1 rounded">claude login</code></li>
                        <li>Verifica: <code className="bg-black/10 dark:bg-white/10 px-1 rounded">claude --version</code></li>
                      </ol>
                      <p className="mt-2 opacity-70">
                        Claude Code CLI usa tu sesion de Claude Pro/Max directamente.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model Selection for cloud providers (OpenAI, Anthropic, Google, Synthetic, Venice) */}
        {(provider === 'openai' || provider === 'anthropic' || provider === 'google' || provider === 'synthetic' || provider === 'venice') && currentProviderModels.length > 0 && (
          <>
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="ai-model" className="text-sm font-medium opacity-80" style={{ color: 'var(--primary)' }}>
                  Model
                </label>
                <button
                  type="button"
                  onClick={() => setCustomModel(!customModel)}
                  className="text-xs font-medium"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  {customModel ? 'Use presets' : 'Custom model'}
                </button>
              </div>
              {customModel ? (
                <input
                  id="ai-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={getDefaultModelId(provider)}
                  autoComplete="off"
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                />
              ) : (
                <div className="space-y-1">
                  {currentProviderModels.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                        model === m.id 
                          ? 'bg-blue-500/10 border-blue-500' 
                          : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                      style={{
                        border: model === m.id ? '1px solid var(--brand-primary)' : '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="model"
                          value={m.id}
                          checked={model === m.id}
                          onChange={(e) => setModel(e.target.value)}
                          className="sr-only"
                        />
                        <div>
                          <div className="flex items-center">
                            <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                              {m.name}
                            </span>
                            {m.recommended && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
                                Recomendado
                              </span>
                            )}
                            {renderModelBadges(m, provider === 'synthetic', provider === 'venice')}
                          </div>
                          {m.description && (
                            <span className="text-xs opacity-60" style={{ color: 'var(--secondary)' }}>
                              {m.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs opacity-50" style={{ color: 'var(--secondary)' }}>
                        {formatContextWindow(m.contextWindow)} ctx
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Embedding Model for providers that support it */}
            {PROVIDERS[provider]?.supportsEmbeddings && currentProviderEmbeddingModels.length > 0 && (
              <div className="group">
                <label htmlFor="ai-embedding-model" className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                  Embedding Model
                </label>
                <select
                  id="ai-embedding-model"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {currentProviderEmbeddingModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.recommended ? '(Recomendado)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Note for providers that don't support embeddings */}
            {(provider === 'anthropic' || provider === 'synthetic' || provider === 'venice') && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs" style={{ color: 'var(--secondary)' }}>
                  <strong className="text-amber-600 dark:text-amber-400">Nota:</strong>{' '}
                  {provider === 'anthropic' ? 'Anthropic' : provider === 'synthetic' ? 'Synthetic' : 'Venice'} no soporta embeddings para búsqueda semántica.
                </p>
                <p className="text-xs mt-1 opacity-80" style={{ color: 'var(--secondary)' }}>
                  Para habilitar búsqueda semántica, instala <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Ollama</a> con un modelo de embeddings:
                </p>
                <code className="block mt-2 text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-mono">
                  ollama pull mxbai-embed-large
                </code>
              </div>
            )}
          </>
        )}

        {/* Ollama Configuration */}
        {provider === 'ollama' && (
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80" style={{ color: 'var(--primary)' }}>
                  Status
                </span>
                {checkingOllama ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--secondary)' }} />
                ) : ollamaAvailable === true ? (
                  <div className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Connected</span>
                  </div>
                ) : ollamaAvailable === false ? (
                  <div className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Offline</span>
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--secondary)' }}>Unknown</span>
                )}
              </div>
              <button
                onClick={checkOllamaConnection}
                disabled={checkingOllama}
                className="text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50"
              >
                Check Connection
              </button>
            </div>

            {/* Ollama Base URL */}
            <div className="group">
              <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary)' }}>
                Base URL
              </label>
              <input
                type="url"
                value={ollamaBaseURL}
                onChange={(e) => setOllamaBaseURL(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                style={{
                  color: 'var(--primary)',
                  borderColor: 'var(--border)',
                }}
              />
            </div>

            {/* Ollama Model Selector */}
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium opacity-80" style={{ color: 'var(--primary)' }}>
                  Chat Model
                </label>
                <button
                  onClick={loadOllamaModels}
                  disabled={loadingModels}
                  className="text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {ollamaModels.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={(e) => {
                    const selectedValue = e.target.value;
                    console.log('[AISettings] Model selected:', selectedValue);
                    setOllamaModel(selectedValue);
                  }}
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {ollamaModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({Math.round(m.size / 1024 / 1024 / 1024)}GB)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.2"
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                />
              )}
            </div>

            {/* Ollama Embedding Model Selector */}
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium opacity-80" style={{ color: 'var(--primary)' }}>
                  Embedding Model
                </label>
              </div>

              {ollamaModels.length > 0 ? (
                <select
                  value={ollamaEmbeddingModel}
                  onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
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
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  style={{
                    color: 'var(--primary)',
                    borderColor: 'var(--border)',
                  }}
                />
              )}
            </div>

            {/* Advanced Ollama Settings */}
            <div className="pt-6">
              <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 opacity-60" style={{ color: 'var(--secondary)' }}>
                Fine Tuning
              </h4>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm opacity-80" style={{ color: 'var(--primary)' }}>
                      Temperature
                    </label>
                    <span className="text-xs font-mono opacity-60" style={{ color: 'var(--primary)' }}>{ollamaTemperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={ollamaTemperature}
                    onChange={(e) => setOllamaTemperature(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm opacity-80" style={{ color: 'var(--primary)' }}>
                      Top P
                    </label>
                    <span className="text-xs font-mono opacity-60" style={{ color: 'var(--primary)' }}>{ollamaTopP}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ollamaTopP}
                    onChange={(e) => setOllamaTopP(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-6">
          <button
            onClick={handleSave}
            className="w-full px-6 py-3 text-sm font-medium text-white rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-[0.99] transition-all"
            style={{
              backgroundColor: 'var(--brand-primary)',
            }}
          >
            Save Configuration
          </button>
          {saved && (
            <div className="mt-2 text-center text-sm text-green-600 animate-in fade-in">
              Configuration saved successfully
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
