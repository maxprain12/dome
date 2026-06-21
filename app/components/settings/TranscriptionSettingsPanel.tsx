import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAIConfig } from '@/lib/settings';
import { PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import { useEffect, useState } from 'react';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeIconBox from '@/components/ui/DomeIconBox';
import TranscriptionSettingsSections from './TranscriptionSettingsSections';
import SettingsPanel from '@/components/settings/SettingsPanel';

/** @deprecated Use AISettingsPanel — transcription is unified under AI settings. */
export default function TranscriptionSettingsPanel() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AIProviderType>('openai');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    void getAIConfig().then((config) => {
      if (config) {
        const raw = String(config.provider || 'openai');
        const p = (raw === 'local' ? 'ollama' : raw) as AIProviderType;
        setProvider(p);
        setApiKey(config.api_key || '');
      }
    });
  }, []);

  const { models, loading } = useProviderModels({ provider, apiKey, applyVisibleFilter: false });

  return (
    <SettingsPanel>
      <DomeSubpageHeader
        title={t('settings.transcription.title')}
        subtitle={
          <div className="space-y-2">
            <p>{t('settings.transcription.subtitle')}</p>
            <p className="text-[11px] leading-relaxed opacity-95">{t('settings.transcription.hub_floating_note')}</p>
          </div>
        }
        trailing={
          <DomeIconBox size="md" className="!w-10 !h-10">
            <Mic className="size-5 text-[var(--accent)]" aria-hidden />
          </DomeIconBox>
        }
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />
      <TranscriptionSettingsSections
        summaryModels={models.length > 0 ? models : PROVIDERS[provider]?.models ?? []}
        summaryModelsLoading={loading}
      />
    </SettingsPanel>
  );
}
