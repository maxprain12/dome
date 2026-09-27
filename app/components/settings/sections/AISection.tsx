import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BrainIcon } from '@hugeicons/core-free-icons';
import { SettingsSurface } from '../blocks';
import AISettingsTabBar from '../ai/AISettingsTabBar';
import AISectionBody from '../ai/AISectionBody';
import { useAISectionController } from '../ai/useAISectionController';

export default function AISection() {
  const { t } = useTranslation();
  const ctrl = useAISectionController();

  return (
    <SettingsSurface section="ai"
      icon={BrainIcon}
      title={t('settings.ai.title')}
      description={t('settings.ai.subtitle')}
    >
      {ctrl.loadError ? <Alert variant="destructive"><AlertDescription>{t('settingsGuide.ai.load_error')}</AlertDescription></Alert> : ctrl.initialLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Spinner />{t('settingsGuide.ai.loading')}</p> :
      <AISettingsTabBar disabled={ctrl.saving || ctrl.testing} activeTab={ctrl.activeTab} onTabChange={ctrl.setActiveTab}>
      <fieldset disabled={ctrl.loading || ctrl.saving || ctrl.testing} className="min-w-0 border-0 p-0">
      <AISectionBody
        activeTab={ctrl.activeTab}
        provider={ctrl.provider}
        activeProvider={ctrl.activeProvider}
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
        localCompatBaseURL={ctrl.localCompatBaseURL}
        onLocalCompatBaseURLChange={ctrl.setLocalCompatBaseURL}
        currentProviderModels={ctrl.currentProviderModels}
        providerModelsLoading={ctrl.providerModelsLoading}
        onTestResult={ctrl.setTestResult}
        configurationTitle={t('settings.ai.configuration')}
        transcriptionRef={ctrl.transcriptionRef}
        saved={ctrl.saved}
        saving={ctrl.saving}
        testing={ctrl.testing}
        testResult={ctrl.testResult}
        onSave={() => {
          ctrl.handleSave().catch(() => {});
        }}
        onTest={() => {
          ctrl.handleTestConnection().catch(() => {});
        }}
      />
      </fieldset>
      </AISettingsTabBar>}
    </SettingsSurface>
  );
}
