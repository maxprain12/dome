import { useTranslation } from 'react-i18next';
import { BrainIcon } from '@hugeicons/core-free-icons';
import { SettingsSurface } from '../blocks';
import AISettingsTabBar from '../ai/AISettingsTabBar';
import AISectionBody from '../ai/AISectionBody';
import { useAISectionController } from '../ai/useAISectionController';

export default function AISection() {
  const { t } = useTranslation();
  const ctrl = useAISectionController();

  return (
    <SettingsSurface
      icon={BrainIcon}
      title={t('settings.ai.title')}
      description={t('settings.ai.subtitle')}
    >
      <AISettingsTabBar activeTab={ctrl.activeTab} onTabChange={ctrl.setActiveTab} />
      <AISectionBody
        activeTab={ctrl.activeTab}
        provider={ctrl.provider}
        onProviderChange={ctrl.handleProviderChange}
        providerKeyStatus={ctrl.providerKeyStatus}
        modelsConfigProvider={ctrl.modelsConfigProvider}
        onModelsConfigProviderChange={ctrl.setModelsConfigProvider}
        onModelsConfigSaved={ctrl.handleModelsConfigSaved}
        apiKey={ctrl.apiKey}
        onApiKeyChange={ctrl.setApiKey}
        model={ctrl.model}
        onModelChange={ctrl.setModel}
        customModel={ctrl.customModel}
        onCustomModelChange={ctrl.setCustomModel}
        ollamaBaseURL={ctrl.ollamaBaseURL}
        onOllamaBaseURLChange={ctrl.setOllamaBaseURL}
        ollamaModel={ctrl.ollamaModel}
        onOllamaModelChange={ctrl.setOllamaModel}
        ollamaApiKey={ctrl.ollamaApiKey}
        onOllamaApiKeyChange={ctrl.setOllamaApiKey}
        currentProviderModels={ctrl.currentProviderModels}
        providerModelsLoading={ctrl.providerModelsLoading}
        onTestResult={ctrl.setTestResult}
        configurationTitle={t('settings.ai.configuration')}
        transcriptionRef={ctrl.transcriptionRef}
        saved={ctrl.saved}
        testing={ctrl.testing}
        testResult={ctrl.testResult}
        onSave={() => {
          ctrl.handleSave().catch(() => {});
        }}
        onTest={() => {
          ctrl.handleTestConnection().catch(() => {});
        }}
      />
    </SettingsSurface>
  );
}
