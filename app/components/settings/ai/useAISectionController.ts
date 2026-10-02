import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  loadLocalCompatBaseUrl,
  loadProviderSlotApiKey,
  parseLoadedAIConfig,
  type TestResult,
} from './aiSectionHelpers';

export type AISettingsTab = 'chat' | 'context';

export function useAISectionController() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [activeProvider, setActiveProvider] = useState<AIProviderType | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectionGeneration = useRef(0);
  const operation = useRef(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState<AISettingsTab>('chat');
  const [modelsConfigProvider, setModelsConfigProvider] = useState<AIProviderType | null>(null);

  const { models: currentProviderModels, loading: providerModelsLoading } = useProviderModels({
    provider,
    apiKey,
    baseUrl: isLocalOpenAICompatProvider(provider) ? localCompatBaseURL : undefined,
  });

  useEffect(() => {
    const request = ++selectionGeneration.current;
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (request !== selectionGeneration.current || !config) return;
      const loaded = parseLoadedAIConfig(config);
      setProvider(loaded.provider);
      setActiveProvider(loaded.provider);
      setApiKey(loaded.apiKey);
      setModel(loaded.model);
      setCustomModel(loaded.customModel);
      setOllamaBaseURL(loaded.ollamaBaseURL);
      setOllamaModel(loaded.ollamaModel);
      setOllamaApiKey(loaded.ollamaApiKey);
      setLocalCompatBaseURL(loaded.localCompatBaseURL);
    };
    loadConfig().catch(() => { if (request === selectionGeneration.current) setLoadError(true); })
      .finally(() => { setInitialLoading(false); if (request === selectionGeneration.current) setLoading(false); });
    return () => { selectionGeneration.current += 1; };
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

  const handleProviderChange = useCallback((newProvider: AIProviderType) => {
    const request = ++selectionGeneration.current;
    setProvider(newProvider);
    setApiKey('');
    setSaved(false);
    setTestResult(null);
    setCustomModel(false);
    setModel(getDefaultModelId(newProvider));
    setLoading(true);
    setLoadError(false);
    const local = isLocalOpenAICompatProvider(newProvider);
    Promise.all([
      isCloudAIProvider(newProvider) || local ? loadProviderSlotApiKey(newProvider) : Promise.resolve(''),
      local ? loadLocalCompatBaseUrl(newProvider) : Promise.resolve(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS.lmstudio),
    ]).then(([key, baseUrl]) => {
      if (request !== selectionGeneration.current) return;
      setApiKey(key);
      setLocalCompatBaseURL(baseUrl);
    }).catch(() => { if (request === selectionGeneration.current) setLoadError(true); })
      .finally(() => { if (request === selectionGeneration.current) setLoading(false); });
  }, []);

  // Model-switcher deep links use the same guarded loading path as the provider list.
  useEffect(() => {
    const onOpenProviderSettings = (e: Event) => {
      const detail = (e as CustomEvent<OpenAIProviderSettingsDetail>).detail;
      if (!detail?.provider || operation.current) return;
      setActiveTab('chat');
      handleProviderChange(detail.provider);
      if (detail.openModelsModal && isVisibleModelsConfigurable(detail.provider)) setModelsConfigProvider(detail.provider);
    };
    window.addEventListener('dome:open-ai-provider-settings', onOpenProviderSettings);
    return () => window.removeEventListener('dome:open-ai-provider-settings', onOpenProviderSettings);
  }, [handleProviderChange]);

  const persist = async (): Promise<boolean> => {
    if (isCloudAIProvider(provider) && !apiKey.trim()) {
      setTestResult({ success: false, message: t('settings.ai.api_key_required') });
      return false;
    }
    if (provider === 'ollama' && isOllamaCloudMissingApiKey(ollamaBaseURL, ollamaApiKey)) {
      setTestResult({ success: false, message: t('settings.ai.ollama_cloud_api_key_required') });
      return false;
    }
    await saveAIConfig(buildAISaveConfig({ provider, model, apiKey, ollamaBaseURL, ollamaModel, ollamaApiKey, localCompatBaseURL }));
    setActiveProvider(provider);
    await refreshProviderKeyStatus();
    window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
    return true;
  };

  const handleSave = async () => {
    if (operation.current || loading || loadError) return;
    operation.current = true;
    setSaving(true); setSaved(false); setTestResult(null);
    try { setSaved(await persist()); }
    catch (error) {
      setTestResult({ success: false, message: t('settingsGuide.ai.save_error') });
      showToast('error', error instanceof Error ? error.message : t('settingsGuide.ai.save_error'));
    } finally { operation.current = false; setSaving(false); }
  };

  const handleTestConnection = async () => {
    if (operation.current || loading || loadError) return;
    operation.current = true;
    setTesting(true); setSaved(false); setTestResult(null);
    try {
      if (!await persist()) return;
      setSaved(true);
      if (!window.electron?.ai?.testConnection) {
        setTestResult({ success: false, message: t('settings.ai.test_unavailable') });
        return;
      }
      const result = await window.electron.ai.testConnection();
      setTestResult(result.success
        ? { success: true, message: t('settings.ai.connected_to', { provider: result.provider ?? '', model: result.model ?? '' }) }
        : { success: false, message: result.error || t('settings.ai.connection_failed') });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : t('settings.ai.connection_failed') });
    } finally { operation.current = false; setTesting(false); }
  };

  // Editing any input clears stale feedback from a different configuration.
  useEffect(() => { setSaved(false); setTestResult(null); }, [provider, apiKey, model, ollamaBaseURL, ollamaModel, ollamaApiKey, localCompatBaseURL, activeTab]);

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
    activeProvider,
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
    saving,
    loading,
    initialLoading,
    loadError,
    testing,
    testResult,
    setTestResult,
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
