import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrainIcon } from '@hugeicons/core-free-icons';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import AgentContextSettingsTab from '../ai/AgentContextSettingsTab';
import { memoryPolicy } from '@/lib/personality/memory-policy';
import { showToast } from '@/lib/store/useToastStore';

export default function MemorySection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void memoryPolicy().then((policy) => setEnabled(policy.globalEnabled))
      .catch((error) => showToast('error', error.message)).finally(() => setLoading(false));
  }, []);
  const save = async (value: boolean) => {
    setLoading(true);
    try { setEnabled((await memoryPolicy(undefined, value)).globalEnabled); }
    catch (error) { showToast('error', error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };
  return (
    <SettingsSurface section="memory" icon={BrainIcon} title={t('settings.tabs.memory')} description={t('settings.memory.subtitle')}>
      <SettingsGroup title={t('settings.memory.policy')}>
        <SettingsRow title={t('settings.memory.enabled')} description={t('settings.memory.policy_hint')}
          control={<Switch checked={enabled} disabled={loading} onCheckedChange={(value) => { save(value); }} aria-label={t('settings.memory.enabled')} />} />
      </SettingsGroup>
      <AgentContextSettingsTab mode="memory" />
    </SettingsSurface>
  );
}
