import type { Ref } from 'react';
import AIEmbeddingsTab from './AIEmbeddingsTab';
import AIWebSearchTab from './AIWebSearchTab';
import AgentContextSettingsTab from './AgentContextSettingsTab';
import AIProviderList from './AIProviderList';
import AIProviderDetail from './AIProviderDetail';
import ProviderModelsConfigModal from './ProviderModelsConfigModal';
import AIChatProviderPanels from './AIChatProviderPanels';
import AIChatSaveBar from './AIChatSaveBar';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from '../transcription/TranscriptionSettingsSections';
import { useTranslation } from 'react-i18next';
import { PROVIDERS, type AIProviderType, type ModelDefinition } from '@/lib/ai/models';
import type { AISettingsTab } from './useAISectionController';
import type { TestResult } from './aiSectionHelpers';

export interface AISectionBodyProps {
  activeTab: AISettingsTab;
  provider: AIProviderType;
  activeProvider: AIProviderType | null;
  onProviderChange: (provider: AIProviderType) => void;
  providerKeyStatus: Record<string, boolean>;
  modelsConfigProvider: AIProviderType | null;
  onModelsConfigProviderChange: (provider: AIProviderType | null) => void;
  onModelsConfigSaved: (provider: AIProviderType, visibleIds: string[]) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  customModel: boolean;
  onCustomModelChange: (value: boolean) => void;
  ollamaBaseURL: string;
  onOllamaBaseURLChange: (value: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (value: string) => void;
  ollamaApiKey: string;
  onOllamaApiKeyChange: (value: string) => void;
  localCompatBaseURL: string;
  onLocalCompatBaseURLChange: (value: string) => void;
  currentProviderModels: ModelDefinition[];
  providerModelsLoading: boolean;
  onTestResult: (result: TestResult | null) => void;
  configurationTitle: string;
  transcriptionRef: Ref<TranscriptionSettingsSectionsHandle>;
  saved: boolean;
  testing: boolean;
  testResult: TestResult | null;
  onSave: () => void;
  onTest: () => void;
}

/** Tab body for Settings → AI (chat / embeddings / transcription / tools / context). */
export default function AISectionBody({
  activeTab,
  provider,
  activeProvider,
  onProviderChange,
  providerKeyStatus,
  modelsConfigProvider,
  onModelsConfigProviderChange,
  onModelsConfigSaved,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  customModel,
  onCustomModelChange,
  ollamaBaseURL,
  onOllamaBaseURLChange,
  ollamaModel,
  onOllamaModelChange,
  ollamaApiKey,
  onOllamaApiKeyChange,
  localCompatBaseURL,
  onLocalCompatBaseURLChange,
  currentProviderModels,
  providerModelsLoading,
  onTestResult,
  configurationTitle,
  transcriptionRef,
  saved,
  testing,
  testResult,
  onSave,
  onTest,
}: AISectionBodyProps) {
  const { t } = useTranslation();
  const saveLabel =
    activeProvider && provider !== activeProvider
      ? t('settings.ai.save_and_use', { provider: PROVIDERS[provider]?.name ?? provider })
      : undefined;

  if (activeTab === 'chat') {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start">
        <AIProviderList
          selected={provider}
          active={activeProvider}
          configured={providerKeyStatus}
          onSelect={onProviderChange}
          className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-14rem)]"
        />
        <AIProviderDetail
          provider={provider}
          active={activeProvider}
          configured={Boolean(providerKeyStatus[provider])}
          onConfigureModels={onModelsConfigProviderChange}
          footer={
            <AIChatSaveBar
              showTest
              saved={saved}
              testing={testing}
              testResult={testResult}
              onSave={onSave}
              onTest={onTest}
              saveLabel={saveLabel}
            />
          }
        >
          <AIChatProviderPanels
            provider={provider}
            apiKey={apiKey}
            onApiKeyChange={onApiKeyChange}
            model={model}
            onModelChange={onModelChange}
            customModel={customModel}
            onCustomModelChange={onCustomModelChange}
            ollamaBaseURL={ollamaBaseURL}
            onOllamaBaseURLChange={onOllamaBaseURLChange}
            ollamaModel={ollamaModel}
            onOllamaModelChange={onOllamaModelChange}
            ollamaApiKey={ollamaApiKey}
            onOllamaApiKeyChange={onOllamaApiKeyChange}
            localCompatBaseURL={localCompatBaseURL}
            onLocalCompatBaseURLChange={onLocalCompatBaseURLChange}
            currentProviderModels={currentProviderModels}
            providerModelsLoading={providerModelsLoading}
            onTestResult={onTestResult}
            groupTitle={configurationTitle}
          />
        </AIProviderDetail>
        <ProviderModelsConfigModal
          open={modelsConfigProvider != null}
          provider={modelsConfigProvider}
          onClose={() => onModelsConfigProviderChange(null)}
          onSaved={onModelsConfigSaved}
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {activeTab === 'embeddings' ? <AIEmbeddingsTab /> : null}

      {activeTab === 'transcription' ? (
        <>
          <TranscriptionSettingsSections
            ref={transcriptionRef}
            embedded
            summaryModels={currentProviderModels}
            summaryModelsLoading={providerModelsLoading}
          />
          <AIChatSaveBar
            showTest={false}
            saved={saved}
            testing={testing}
            testResult={testResult}
            onSave={onSave}
            onTest={onTest}
          />
        </>
      ) : null}

      {activeTab === 'tools' ? <AIWebSearchTab /> : null}

      {activeTab === 'context' ? <AgentContextSettingsTab /> : null}
    </div>
  );
}
