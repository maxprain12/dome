import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ModelDefinition } from '@/lib/ai/models';
import ModelSelector from '../ModelSelector';
import { SettingsGroup, SettingsRow } from '../blocks';
import type { TranscriptionSettingsFormApi } from './useTranscriptionSettingsForm';

const CHUNK_OPTIONS = ['2', '4', '8', '15', '30'];

type Props = Pick<TranscriptionSettingsFormApi, 'form' | 'update'> & {
  summaryModels: ModelDefinition[];
  summaryModelsLoading: boolean;
};

/** Speaker turns, live defaults and the AI summary after a recording. */
export default function TranscriptionOutputGroups({ form, update, summaryModels, summaryModelsLoading }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t('settings.transcription.section_meetings_output')}>
        <SettingsRow
          title={t('settings.transcription.pause_threshold')}
          description={t('settings.transcription.pause_help')}
          htmlFor="tr-pause-threshold"
          control={
            <Input
              id="tr-pause-threshold"
              type="number"
              min={0.4}
              max={8}
              step={0.05}
              value={form.pauseThresholdSec}
              onChange={(e) => update({ pauseThresholdSec: e.target.value })}
              className="w-28"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.transcription.section_calls_ai')}>
        <SettingsRow
          title={t('settings.transcription.call_live_transcript_default')}
          control={
            <Switch
              checked={form.liveTranscriptDefault}
              onCheckedChange={(v) => update({ liveTranscriptDefault: v === true })}
              aria-label={t('settings.transcription.call_live_transcript_default')}
            />
          }
        />
        <SettingsRow
          title={t('settings.transcription.call_chunk_length')}
          description={t('settings.transcription.call_chunk_help')}
          control={
            <Select value={form.chunkSec} onValueChange={(next) => { if (next != null) update({ chunkSec: next }); }}>
              <SelectTrigger className="w-24" aria-label={t('settings.transcription.call_chunk_length')}>
                <SelectValue>{form.chunkSec}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CHUNK_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow title={t('settings.transcription.call_summary_model')}>
          {summaryModels.length > 0 ? (
            <ModelSelector
              models={summaryModels}
              selectedModelId={form.summaryModel}
              onChange={(summaryModel) => update({ summaryModel })}
              showBadges={false}
              showDescription={false}
              showContextWindow={false}
              searchable={summaryModels.length > 5}
              placeholder={t('settings.transcription.call_summary_model_placeholder')}
              disabled={summaryModelsLoading}
              providerType="cloud"
            />
          ) : (
            <Input
              value={form.summaryModel}
              onChange={(e) => update({ summaryModel: e.target.value })}
              placeholder={t('settings.transcription.call_summary_model_placeholder')}
              aria-label={t('settings.transcription.call_summary_model')}
            />
          )}
        </SettingsRow>
        <SettingsRow
          title={t('settings.transcription.call_auto_summary')}
          control={
            <Switch
              checked={form.autoSummary}
              onCheckedChange={(v) => update({ autoSummary: v === true })}
              aria-label={t('settings.transcription.call_auto_summary')}
            />
          }
        />
      </SettingsGroup>
    </>
  );
}
