import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow } from '../blocks';
import type { TranscriptionSettingsFormApi } from './useTranscriptionSettingsForm';

type Props = Pick<TranscriptionSettingsFormApi, 'form' | 'update'>;

export default function TranscriptionShortcutGroup({ form, update }: Props) {
  const { t } = useTranslation();
  return (
    <SettingsGroup title={t('settings.transcription.section_shortcuts_global')}>
      <SettingsRow
        title={t('settings.transcription.shortcut_enable_dictation')}
        description={t('settings.transcription.shortcut_dictation_hint')}
        control={
          <Switch
            checked={form.shortcutEnabled}
            onCheckedChange={(v) => update({ shortcutEnabled: v === true })}
            aria-label={t('settings.transcription.shortcut_enable_dictation')}
          />
        }
      >
        <Input
          value={form.globalShortcut}
          onChange={(e) => update({ globalShortcut: e.target.value })}
          disabled={!form.shortcutEnabled}
          placeholder="CommandOrControl+Shift+D"
          aria-label={t('settings.transcription.shortcut_enable_dictation')}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
