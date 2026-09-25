import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/lib/store/useToastStore';
import { SettingsGroup } from '../blocks';
import type { TranscriptionSettingsFormApi } from './useTranscriptionSettingsForm';

type Props = Pick<TranscriptionSettingsFormApi, 'form' | 'keys' | 'update' | 'persist'>;

/** Dedicated STT keys, custom endpoint and vocabulary prompt. */
export default function TranscriptionAdvancedSection({ form, keys, update, persist }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const clearKey = (field: 'dedicatedOpenaiKey' | 'groqApiKey', toastKey: string) => {
    persist({ [field]: '' })
      .then(() => showToast('success', t(toastKey)))
      .catch(() => undefined);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-primary">
        {open ? t('settings.transcription.advanced_hide') : t('settings.transcription.advanced_show')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 flex flex-col gap-4 border-l-2 pl-3">
        {form.sttProvider === 'groq' ? (
          <SettingsGroup title={t('settings.transcription.section_groq_key')}>
            <div className="flex flex-col gap-2 px-4 py-4">
              <Field>
                <FieldLabel htmlFor="tr-groq-key">{t('settings.transcription.groq_key_help')}</FieldLabel>
                <Input
                  id="tr-groq-key"
                  type="password"
                  value={form.groqKey}
                  onChange={(e) => update({ groqKey: e.target.value })}
                  placeholder={t('settings.transcription.groq_key_placeholder')}
                  autoComplete="off"
                />
                {keys.hasGroqKey ? <FieldDescription>{t('settings.transcription.groq_key_saved')}</FieldDescription> : null}
              </Field>
              {keys.hasGroqKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="self-start"
                  onClick={() => clearKey('groqApiKey', 'settings.transcription.clear_groq_key')}
                >
                  {t('settings.transcription.clear_groq_key')}
                </Button>
              ) : null}
            </div>
          </SettingsGroup>
        ) : null}

        <SettingsGroup title={t('settings.transcription.section_key')}>
          <div className="flex flex-col gap-2 px-4 py-4">
            <Field>
              <FieldLabel htmlFor="tr-dedicated-key">{t('settings.transcription.key_help')}</FieldLabel>
              <Input
                id="tr-dedicated-key"
                type="password"
                value={form.dedicatedKey}
                onChange={(e) => update({ dedicatedKey: e.target.value })}
                placeholder={t('settings.transcription.key_placeholder')}
                autoComplete="off"
              />
              {keys.hasDedicatedKey ? <FieldDescription>{t('settings.transcription.key_saved')}</FieldDescription> : null}
            </Field>
            {keys.hasDedicatedKey ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="self-start"
                onClick={() => clearKey('dedicatedOpenaiKey', 'settings.transcription.clear_key')}
              >
                {t('settings.transcription.clear_key')}
              </Button>
            ) : null}
          </div>
        </SettingsGroup>

        <SettingsGroup title={t('settings.transcription.section_api_prompt')}>
          <div className="flex flex-col gap-4 px-4 py-4">
            <Field>
              <FieldLabel htmlFor="tr-api-base-url">{t('settings.transcription.api_base_url')}</FieldLabel>
              <Input
                id="tr-api-base-url"
                value={form.apiBaseUrl}
                onChange={(e) => update({ apiBaseUrl: e.target.value })}
                placeholder={t('settings.transcription.api_base_url_placeholder')}
                autoComplete="off"
              />
              <FieldDescription>{t('settings.transcription.api_base_url_help')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="tr-prompt">{t('settings.transcription.prompt')}</FieldLabel>
              <Textarea
                id="tr-prompt"
                className="min-h-[72px] resize-y"
                value={form.prompt}
                onChange={(e) => update({ prompt: e.target.value })}
                rows={3}
                placeholder={t('settings.transcription.prompt_placeholder')}
              />
              <FieldDescription>{t('settings.transcription.prompt_help')}</FieldDescription>
            </Field>
          </div>
        </SettingsGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
