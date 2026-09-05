import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranscriptionSettingsSectionsHandle } from '../TranscriptionSettingsSections';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import {
  LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS,
  getDefaultModelId,
  isLocalOpenAICompatProvider,
  type AIProviderType,
} from '@/lib/ai/models';
import { resolveVisibleModelAfterSave, isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import { saveChatModelForProvider } from '@/lib/ai/client';
import type { OpenAIProviderSettingsDetail } from '@/lib/ai/open-provider-settings';
import { showToast } from '@/lib/store/useToastStore';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import { isOllamaCloudMissingApiKey } from '@/lib/ai/providerAuth';
import {
  buildAISaveConfig,
  loadCloudApiKey,
  loadLocalCompatBaseUrl,
  loadProviderSlotApiKey,
  parseLoadedAIConfig,
  type TestResult,
} from './aiSectionHelpers';

export type AISettingsTab = 'chat' | 'embeddings' | 'transcription' | 'tools' | 'context';

export function useAISectionController() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [providerKeyStatus, setProviderKeyStatus] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState('gpt-5.6-sol');
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [localCompatBaseURL, setLocalCompatBaseURL] = useState(
    LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS.lmstudio,
  );
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const transcriptionRef = useRef<TranscriptionSettingsSectionsHandle>(null);
  const [activeTab, setActiveTab] = useState<AISettingsTab>('chat');
  const [modelsConfigProvider, setModelsConfigProvider] = useState<AIProviderType | null>(null);

  const { models: currentProviderModels, loading: providerModelsLoading } = useProviderModels({
    provider,
    apiKey,
    baseUrl: isLocalOpenAICompatProvider(provider) ? localCompatBaseURL : undefined,
  });

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (!config) return;
      const loaded = parseLoadedAIConfig(config);
      setProvider(loaded.provider);
      setApiKey(loaded.apiKey);
      setModel(loaded.model);
      setCustomModel(loaded.customModel);
      setOllamaBaseURL(loaded.ollamaBaseURL);
      setOllamaModel(loaded.ollamaModel);
      setOllamaApiKey(loaded.ollamaApiKey);
      setLocalCompatBaseURL(loaded.localCompatBaseURL);
    };
    loadConfig();
  }, []);

  const refreshProviderKeyStatus = useCallback(async () => {
    try {
      const res = await window.electron.invoke('db:settings:aiProviderKeyStatus');
      if (res?.success && res.data) setProviderKeyStatus(res.data as Record<string, boolean>);
    } catch {
      /* non-fatal: badges quedan vacíos */
    }
  }, []);

  useEffect(() => {
    refreshProviderKeyStatus();
  }, [refreshProviderKeyStatus]);

  // Deep link from the model switcher: jump to a provider (and optionally its models modal).
  useEffect(() => {
    const onOpenProviderSettings = (e: Event) => {
      const detail = (e as CustomEvent<OpenAIProviderSettingsDetail>).detail;
      if (!detail?.provider) return;
      setActiveTab('chat');
      setProvider(detail.provider);
      if (isCloudAIProvider(detail.provider)) {
        loadCloudApiKey(detail.provider)
          .then(setApiKey)
          .catch(() => setApiKey(''));
      } else if (isLocalOpenAICompatProvider(detail.provider)) {
        loadProviderSlotApiKey(detail.provider)
          .then(setApiKey)
          .catch(() => setApiKey(''));
        loadLocalCompatBaseUrl(detail.provider)
          .then(setLocalCompatBaseURL)
          .catch(() => {});
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
      loadCloudApiKey(newProvider)
        .then(setApiKey)
        .catch(() => setApiKey(''));
    } else if (isLocalOpenAICompatProvider(newProvider)) {
      setLocalCompatBaseURL(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[newProvider]);
      loadProviderSlotApiKey(newProvider)
        .then(setApiKey)
        .catch(() => setApiKey(''));
      loadLocalCompatBaseUrl(newProvider)
        .then(setLocalCompatBaseURL)
        .catch(() => setLocalCompatBaseURL(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[newProvider]));
    } else {
      setApiKey('');
    }
  };

  const handleSave = async () => {
    if (provider === 'ollama' && isOllamaCloudMissingApiKey(ollamaBaseURL, ollamaApiKey)) {
      setTestResult({ success: false, message: t('settings.ai.ollama_cloud_api_key_required') });
      return;
    }
    const config = buildAISaveConfig({
      provider,
      model,
      apiKey,
      ollamaBaseURL,
      ollamaModel,
      ollamaApiKey,
      localCompatBaseURL,
    });
    try {
      await saveAIConfig(config);
      refreshProviderKeyStatus();
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

  const handleModelsConfigSaved = (savedProvider: AIProviderType, visibleIds: string[]) => {
    if (savedProvider !== provider || customModel) return;
    const next = resolveVisibleModelAfterSave(savedProvider, model, visibleIds);
    if (next === model) return;
    setModel(next);
    saveChatModelForProvider(savedProvider, next);
    window.dispatchEvent(new Event('dome:ai-config-changed'));
  };

  return {
    t,
    provider,
    apiKey,
    setApiKey,
    providerKeyStatus,
    model,
    setModel,
    customModel,
    setCustomModel,
    ollamaBaseURL,
    setOllamaBaseURL,
    ollamaModel,
    setOllamaModel,
    ollamaApiKey,
    setOllamaApiKey,
    localCompatBaseURL,
    setLocalCompatBaseURL,
    saved,
    testing,
    testResult,
    setTestResult,
    transcriptionRef,
    activeTab,
    setActiveTab,
    modelsConfigProvider,
    setModelsConfigProvider,
    currentProviderModels,
    providerModelsLoading,
    handleProviderChange,
    handleSave,
    handleTestConnection,
    handleModelsConfigSaved,
  };
}
