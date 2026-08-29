import type { Ref } from 'react';
import AIEmbeddingsTab from './AIEmbeddingsTab';
import AIWebSearchTab from './AIWebSearchTab';
import AgentContextSettingsTab from './AgentContextSettingsTab';
import AIProviderSelection from './AIProviderSelection';
import ProviderModelsConfigModal from './ProviderModelsConfigModal';
import AIChatProviderPanels from './AIChatProviderPanels';
import AIChatSaveBar from './AIChatSaveBar';
import TranscriptionSettingsSections, {
  type TranscriptionSettingsSectionsHandle,
} from '../TranscriptionSettingsSections';
import type { AIProviderType, ModelDefinition } from '@/lib/ai/models';
import type { AISettingsTab } from './useAISectionController';
import type { TestResult } from './aiSectionHelpers';

export interface AISectionBodyProps {
  activeTab: AISettingsTab;
  provider: AIProviderType;
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
  const showSaveBar = activeTab === 'chat' || activeTab === 'transcription';

  return (
    <>
      {activeTab === 'chat' ? (
        <>
          <AIProviderSelection
            provider={provider}
            onProviderChange={onProviderChange}
            configuredProviders={providerKeyStatus}
            onConfigureModels={onModelsConfigProviderChange}
          />

          <ProviderModelsConfigModal
            open={modelsConfigProvider != null}
            provider={modelsConfigProvider}
            onClose={() => onModelsConfigProviderChange(null)}
            onSaved={onModelsConfigSaved}
          />

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
            currentProviderModels={currentProviderModels}
            providerModelsLoading={providerModelsLoading}
            onTestResult={onTestResult}
            groupTitle={configurationTitle}
          />
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

      {activeTab === 'context' ? <AgentContextSettingsTab /> : null}

      {showSaveBar ? (
        <AIChatSaveBar
          showTest={activeTab === 'chat'}
          saved={saved}
          testing={testing}
          testResult={testResult}
          onSave={onSave}
          onTest={onTest}
        />
      ) : null}
    </>
  );
}
