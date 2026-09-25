import { SettingsGroup } from '../blocks';
import AICloudProviderConfig from './AICloudProviderConfig';
import AIOllamaProviderConfig from './AIOllamaProviderConfig';
import AILocalOpenAICompatConfig from './AILocalOpenAICompatConfig';
import AIDomeProviderPanel from './AIDomeProviderPanel';
import AICopilotProviderPanel from './AICopilotProviderPanel';
import AIClaudeOAuthProviderPanel from './AIClaudeOAuthProviderPanel';
import AIOpenAICodexProviderPanel from './AIOpenAICodexProviderPanel';
import { isLocalOpenAICompatProvider, type AIProviderType, type ModelDefinition } from '@/lib/ai/models';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import type { TestResult } from './aiSectionHelpers';

export interface AIChatProviderPanelsProps {
  provider: AIProviderType;
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
  groupTitle: string;
  /** Local endpoints (Ollama, LM Studio, vLLM) report whether they answered. */
  onLocalAvailabilityChange?: (available: boolean | null) => void;
  /** Onboarding: compact model pickers, no API key field for local servers. */
  compact?: boolean;
}

/** Renders the provider-specific config panel for Settings → AI → Chat. */
export default function AIChatProviderPanels({
  provider,
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
  groupTitle,
  onLocalAvailabilityChange,
  compact = false,
}: AIChatProviderPanelsProps) {
  return (
    <SettingsGroup title={groupTitle} bare>
      {isCloudAIProvider(provider) ? (
        <AICloudProviderConfig
          provider={provider}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          model={model}
          onModelChange={onModelChange}
          customModel={customModel}
          onCustomModelChange={onCustomModelChange}
          compact={compact}
        />
      ) : null}

      {provider === 'ollama' ? (
        <AIOllamaProviderConfig
          ollamaBaseURL={ollamaBaseURL}
          onOllamaBaseURLChange={onOllamaBaseURLChange}
          ollamaModel={ollamaModel}
          onOllamaModelChange={onOllamaModelChange}
          ollamaApiKey={ollamaApiKey}
          onOllamaApiKeyChange={onOllamaApiKeyChange}
          showApiKeyField={!compact}
          showOcrHint={!compact}
          onAvailabilityChange={onLocalAvailabilityChange}
        />
      ) : null}

      {isLocalOpenAICompatProvider(provider) ? (
        <AILocalOpenAICompatConfig
          provider={provider}
          baseURL={localCompatBaseURL}
          onBaseURLChange={onLocalCompatBaseURLChange}
          model={model}
          onModelChange={onModelChange}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          showApiKeyField={!compact}
          onAvailabilityChange={onLocalAvailabilityChange}
        />
      ) : null}

      {provider === 'dome' ? (
        <AIDomeProviderPanel
          model={model}
          onModelChange={onModelChange}
          models={currentProviderModels}
          modelsLoading={providerModelsLoading}
          onTestResult={onTestResult}
        />
      ) : null}

      {provider === 'copilot' ? (
        <AICopilotProviderPanel
          model={model}
          onModelChange={onModelChange}
          onTestResult={onTestResult}
        />
      ) : null}

      {provider === 'claude-oauth' ? (
        <AIClaudeOAuthProviderPanel
          model={model}
          onModelChange={onModelChange}
          models={currentProviderModels}
          onTestResult={onTestResult}
        />
      ) : null}

      {provider === 'openai-codex' ? (
        <AIOpenAICodexProviderPanel
          model={model}
          onModelChange={onModelChange}
          models={currentProviderModels}
          onTestResult={onTestResult}
        />
      ) : null}
    </SettingsGroup>
  );
}
