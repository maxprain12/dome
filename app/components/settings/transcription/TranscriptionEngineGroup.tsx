import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/store/useToastStore';
import { SettingsGroup } from '../blocks';
import {
  GROQ_ORIGIN,
  MODEL_GROQ_LARGE,
  MODEL_GROQ_TURBO,
  type LiveEngine,
  type SttProvider,
  type TranscriptionSettingsFormApi,
} from './useTranscriptionSettingsForm';

const OPENAI_MODELS = [
  ['whisper-1', 'settings.transcription.model_option_whisper1'],
  ['gpt-4o-transcribe', 'settings.transcription.model_option_gpt4o_transcribe'],
  ['gpt-4o-mini-transcribe', 'settings.transcription.model_option_gpt4o_mini_transcribe'],
  ['gpt-4o-transcribe-diarize', 'settings.transcription.model_option_gpt4o_transcribe_diarize'],
] as const;

const GROQ_MODELS = [
  [MODEL_GROQ_TURBO, 'settings.transcription.model_option_groq_turbo'],
  [MODEL_GROQ_LARGE, 'settings.transcription.model_option_groq_large'],
] as const;

type Props = Pick<TranscriptionSettingsFormApi, 'form' | 'keys' | 'update'>;

/** Provider, model, language and how live text is produced. */
export default function TranscriptionEngineGroup({ form, keys, update }: Props) {
  const { t } = useTranslation();
  const isGroq = form.sttProvider === 'groq';
  const modelOptions = isGroq ? GROQ_MODELS : [...OPENAI_MODELS, ...GROQ_MODELS];
  const modelLabel = (value: string) => {
    const match = modelOptions.find(([id]) => id === value);
    return match ? t(match[1]) : value;
  };
  const realtimeAvailable = form.sttProvider === 'openai' && !form.apiBaseUrl.trim();

  const providerLabel: Record<SttProvider, string> = {
    openai: t('settings.transcription.stt_provider_openai'),
    groq: t('settings.transcription.stt_provider_groq'),
    custom: t('settings.transcription.stt_provider_custom'),
  };
  const engineLabel: Record<LiveEngine, string> = {
    realtime: t('settings.transcription.live_engine_realtime'),
    chunks: t('settings.transcription.live_engine_chunks'),
  };

  const applyGroqPreset = () => {
    update({ sttProvider: 'groq', model: MODEL_GROQ_TURBO, apiBaseUrl: GROQ_ORIGIN });
    showToast('success', t('settings.transcription.preset_groq_desc'));
  };

  const applyOpenaiPreset = () => {
    update({ sttProvider: 'openai', model: 'whisper-1', apiBaseUrl: '' });
    showToast('success', t('settings.transcription.preset_openai_desc'));
  };

  return (
    <SettingsGroup
      title={t('settings.transcription.section_quick_start')}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={applyGroqPreset}>
            {t('settings.transcription.preset_groq')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={applyOpenaiPreset}>
            {t('settings.transcription.preset_openai')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        <Field className="max-w-md">
          <FieldLabel>{t('settings.transcription.stt_provider')}</FieldLabel>
          <Select value={form.sttProvider} onValueChange={(next) => update({ sttProvider: next as SttProvider })}>
            <SelectTrigger className="w-full">
              <SelectValue>{providerLabel[form.sttProvider]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="groq">{providerLabel.groq}</SelectItem>
                <SelectItem value="openai">{providerLabel.openai}</SelectItem>
                <SelectItem value="custom">{providerLabel.custom}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>{t('settings.transcription.model')}</FieldLabel>
          <Select value={form.model} onValueChange={(next) => { if (next != null) update({ model: next }); }}>
            <SelectTrigger className="w-full">
              <SelectValue>{modelLabel(form.model)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {modelOptions.map(([id, labelKey]) => (
                  <SelectItem key={id} value={id}>{t(labelKey)}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="tr-language">{t('settings.transcription.language')}</FieldLabel>
          <Input
            id="tr-language"
            value={form.language}
            onChange={(e) => update({ language: e.target.value })}
            placeholder={t('settings.transcription.language_placeholder')}
          />
        </Field>

        <Field>
          <FieldLabel>{t('settings.transcription.live_engine')}</FieldLabel>
          <Select
            value={form.liveEngine}
            onValueChange={(next) => update({ liveEngine: next as LiveEngine })}
            disabled={!realtimeAvailable}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{realtimeAvailable ? engineLabel[form.liveEngine] : engineLabel.chunks}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="realtime">{engineLabel.realtime}</SelectItem>
                <SelectItem value="chunks">{engineLabel.chunks}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {realtimeAvailable
              ? t('settings.transcription.live_engine_help')
              : t('settings.transcription.live_engine_openai_only')}
          </FieldDescription>
        </Field>

        {isGroq && !keys.hasGroqKey ? (
          <p className="text-[11px] text-primary">{t('settings.transcription.groq_key_hint_quick')}</p>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
