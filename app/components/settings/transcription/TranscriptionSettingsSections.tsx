import { forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import PermissionCallout from '@/components/shared/PermissionCallout';
import type { ModelDefinition } from '@/lib/ai/models';
import { SettingsGroup } from '../blocks';
import TranscriptionAdvancedSection from './TranscriptionAdvancedSection';
import TranscriptionEngineGroup from './TranscriptionEngineGroup';
import TranscriptionOutputGroups from './TranscriptionOutputGroups';
import TranscriptionShortcutGroup from './TranscriptionShortcutGroup';
import { useTranscriptionSettingsForm } from './useTranscriptionSettingsForm';

export interface TranscriptionSettingsSectionsHandle {
  save: () => Promise<boolean>;
}

interface TranscriptionSettingsSectionsProps {
  summaryModels: ModelDefinition[];
  summaryModelsLoading?: boolean;
  /** When true, hide the internal save button (parent handles save). */
  embedded?: boolean;
}

/** Voice/transcription pipeline settings; exposes an imperative `save()` for the AI panel. */
const TranscriptionSettingsSections = forwardRef<
  TranscriptionSettingsSectionsHandle,
  TranscriptionSettingsSectionsProps
>(function TranscriptionSettingsSections({ summaryModels, summaryModelsLoading = false, embedded = false }, ref) {
  const { t } = useTranslation();
  const formApi = useTranscriptionSettingsForm();
  const { form, keys, saved, setSaved, update, save, persist } = formApi;

  useImperativeHandle(ref, () => ({ save }), [save]);

  const onSave = () => {
    save()
      .then(() => globalThis.setTimeout(() => setSaved(false), 2000))
      .catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title={t('settings.transcription.section_permissions')}>
        <PermissionCallout kinds={['microphone', 'screen']} className="px-4 py-3" />
      </SettingsGroup>

      <TranscriptionEngineGroup form={form} keys={keys} update={update} />
      <TranscriptionShortcutGroup form={form} update={update} />
      <TranscriptionOutputGroups
        form={form}
        update={update}
        summaryModels={summaryModels}
        summaryModelsLoading={summaryModelsLoading}
      />
      <TranscriptionAdvancedSection form={form} keys={keys} update={update} persist={persist} />

      {embedded ? null : (
        <Button type="button" className="self-start" onClick={onSave}>
          {saved ? t('settings.transcription.saved') : t('settings.transcription.save')}
        </Button>
      )}
    </div>
  );
});

export default TranscriptionSettingsSections;
