
import { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, Brain, ImageIcon, Shield } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  PROVIDERS,
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  formatContextWindow,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS } from '@/lib/ai/provider-options';
import ModelSelector from './ModelSelector';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export default function AISettingsPanel() {
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-5.2');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState('mxbai-embed-large');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Ollama-specific state
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Get current provider's models
  const currentProviderModels: ModelDefinition[] = useMemo(() => {
    return PROVIDERS[provider]?.models || [];
  }, [provider]);

  const currentProviderEmbeddingModels = PROVIDERS[provider]?.embeddingModels || [];

  // Load existing configuration
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config) {
        // Handle legacy 'local' provider by converting to 'ollama'
        const loadedProvider = (config.provider as string) === 'local' ? 'ollama' : config.provider;
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
        
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');
        setOllamaEmbeddingModel(config.ollama_embedding_model || 'mxbai-embed-large');
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

  const checkOllamaConnection = async () => {
    if (!window.electron) return;

    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      setOllamaAvailable(result.success && result.available === true);
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
        config.embedding_model = embeddingModel;
        break;

      case 'google':
        config.api_key = apiKey;
        config.model = model;
        config.embedding_model = embeddingModel;
        break;

      case 'ollama':
        config.ollama_base_url = ollamaBaseURL;
        config.ollama_model = ollamaModel;
        config.ollama_embedding_model = ollamaEmbeddingModel;
        break;
    }

    try {
      await saveAIConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      // Notify other components that AI config has changed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
      }
    } catch (error) {
      console.error('[AISettings] Error saving config:', error);
    }
  };

  const handleTestConnection = async () => {
    // Save first to ensure latest config is persisted
    await handleSave();

    setTesting(true);
    setTestResult(null);

    try {
      if (window.electron?.ai?.testConnection) {
        const result = await window.electron.ai.testConnection();
        if (result.success) {
          setTestResult({ success: true, message: `Connected to ${result.provider} (${result.model})` });
        } else {
          setTestResult({ success: false, message: result.error || 'Connection failed' });
        }
      } else {
        setTestResult({ success: false, message: 'Test connection not available (Electron API missing)' });
      }
    } catch (error) {
      console.error('[AISettings] Test connection error:', error);
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setTesting(false);
    }
  };

  // Render model badge
  const renderModelBadges = (modelDef: { reasoning: boolean; input: string[] }, isFree?: boolean, isPrivate?: boolean) => (
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
        <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
          AI Configuration
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--secondary-text)' }}>
          Configure your AI provider for semantic search, transcriptions, and assistant
        </p>
      </div>

      {/* Provider Selection - same order and labels as onboarding */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary-text)' }}>
          Provider
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {AI_PROVIDER_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = provider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleProviderChange(option.value)}
                className={`px-4 py-3 rounded-lg text-left transition-all relative cursor-pointer ${
                  isSelected ? 'bg-blue-500/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                style={{
                  color: isSelected ? 'var(--accent)' : 'var(--primary-text)',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                {option.badge && (
                  <span
                    className={`absolute -top-2 -right-2 px-1.5 py-0.5 text-[9px] font-bold rounded ${
                      option.badgeColor === 'green' ? 'bg-green-500 text-white' : 'bg-purple-500 text-white'
                    }`}
                  >
                    {option.badge}
                  </span>
                )}
                <div className="font-medium flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {option.label}
                  {option.recommended && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-60 mt-0.5">{option.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* API Configuration */}
      <section className="space-y-6 max-w-lg">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary-text)' }}>
          Configuration
        </h3>

        {/* API Key for OpenAI, Anthropic, and Google */}
        {(provider === 'openai' || provider === 'anthropic' || provider === 'google') && (
          <div className="group">
            <label htmlFor="ai-api-key-cloud" className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary-text)' }}>
              API Key
            </label>
            <div className="relative">
              <input
                id="ai-api-key-cloud"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || 'Enter API key...'}
                className="input pr-12"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-50 hover:opacity-100 cursor-pointer"
                style={{ color: 'var(--secondary-text)' }}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {PROVIDERS[provider]?.docsUrl && (
              <p className="text-xs mt-1.5 opacity-50" style={{ color: 'var(--secondary-text)' }}>
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

        {/* Model Selection for cloud providers (OpenAI, Anthropic, Google) */}
        {(provider === 'openai' || provider === 'anthropic' || provider === 'google') && currentProviderModels.length > 0 && (
          <>
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="ai-model" className="text-sm font-medium opacity-80" style={{ color: 'var(--primary-text)' }}>
                  Model
                </label>
                <button
                  type="button"
                  onClick={() => setCustomModel(!customModel)}
                  className="text-xs font-medium"
                  style={{ color: 'var(--accent)' }}
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
                  className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 transition-colors"
                  style={{
                    color: 'var(--primary-text)',
                    borderColor: 'var(--border)',
                  }}
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
                  placeholder="Selecciona un modelo..."
                  providerType="cloud"
                />
              )}
            </div>

            {/* Embedding Model for providers that support it */}
            {PROVIDERS[provider]?.supportsEmbeddings && currentProviderEmbeddingModels.length > 0 && (
              <div className="group">
                <label className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary-text)' }}>
                  Embedding Model
                </label>
                <ModelSelector
                  models={currentProviderEmbeddingModels.map((em) => ({
                    id: em.id,
                    name: em.name,
                    description: em.dimensions ? `${em.dimensions} dimensiones` : undefined,
                    recommended: em.recommended,
                    reasoning: false,
                    input: ['text'],
                    contextWindow: em.dimensions || 0,
                    maxTokens: 0,
                  }))}
                  selectedModelId={embeddingModel}
                  onChange={setEmbeddingModel}
                  showBadges={true}
                  showDescription={false}
                  showContextWindow={false}
                  searchable={false}
                  providerType="embedding"
                  placeholder="Selecciona modelo de embeddings..."
                />
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
                <span className="text-sm opacity-80" style={{ color: 'var(--primary-text)' }}>
                  Status
                </span>
                {checkingOllama ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--secondary-text)' }} />
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
                  <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Unknown</span>
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
              <label htmlFor="ai-ollama-base-url" className="block text-sm font-medium mb-2 opacity-80" style={{ color: 'var(--primary-text)' }}>
                Base URL
              </label>
              <input
                id="ai-ollama-base-url"
                type="url"
                value={ollamaBaseURL}
                onChange={(e) => setOllamaBaseURL(e.target.value)}
                placeholder="http://localhost:11434"
                className="input"
              />
            </div>

            {/* Ollama Model Selector */}
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium opacity-80" style={{ color: 'var(--primary-text)' }}>
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
                <ModelSelector
                  models={ollamaModels.map((m) => ({
                    id: m.name,
                    name: m.name,
                    description: `${Math.round(m.size / 1024 / 1024 / 1024)}GB`,
                    reasoning: false,
                    input: ['text'],
                    contextWindow: 0,
                    maxTokens: 0,
                  }))}
                  selectedModelId={ollamaModel}
                  onChange={(modelId) => {
                    console.log('[AISettings] Model selected:', modelId);
                    setOllamaModel(modelId);
                  }}
                  searchable={true}
                  showBadges={false}
                  showDescription={true}
                  showContextWindow={false}
                  placeholder="Selecciona modelo Ollama..."
                  disabled={loadingModels}
                  providerType="ollama"
                />
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.2"
                  aria-label="Ollama model name"
                  className="input"
                />
              )}
            </div>

            {/* Ollama Embedding Model Selector */}
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium opacity-80" style={{ color: 'var(--primary-text)' }}>
                  Embedding Model
                </label>
              </div>

{ollamaModels.length > 0 ? (
                <ModelSelector
                  models={ollamaModels.map((m) => ({
                    id: m.name,
                    name: m.name,
                    description: undefined,
                    reasoning: false,
                    input: ['text'],
                    contextWindow: 0,
                    maxTokens: 0,
                  }))}
                  selectedModelId={ollamaEmbeddingModel}
                  onChange={setOllamaEmbeddingModel}
                  searchable={true}
                  showBadges={false}
                  showDescription={false}
                  showContextWindow={false}
                  placeholder="Selecciona modelo de embeddings..."
                  disabled={loadingModels}
                  providerType="embedding"
                />
              ) : (
                <input
                  type="text"
                  value={ollamaEmbeddingModel}
                  onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                  placeholder="mxbai-embed-large"
                  aria-label="Ollama embedding model name"
                  className="input"
                />
              )}
            </div>

          </div>
        )}

        {/* Save & Test Buttons */}
        <div className="pt-6 space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 px-6 py-3 text-sm font-medium text-white rounded-full active:opacity-90 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
              }}
            >
              Save Configuration
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-5 py-3 text-sm font-medium rounded-full active:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--primary-text)',
              }}
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing...
                </span>
              ) : (
                'Test Connection'
              )}
            </button>
          </div>

          {/* Save feedback */}
          {saved && (
            <div className="text-center text-sm text-green-600 animate-in fade-in">
              Configuration saved successfully
            </div>
          )}

          {/* Test result indicator */}
          {testResult && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg animate-in fade-in"
              style={{
                backgroundColor: testResult.success ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              }}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span
                className="text-sm"
                style={{
                  color: testResult.success ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                }}
              >
                {testResult.message}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
