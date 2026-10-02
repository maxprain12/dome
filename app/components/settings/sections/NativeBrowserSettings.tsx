import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { SettingsGroup } from '../blocks';

type Options = { browser: { profile?: string; keepAlive?: boolean; allowedDomains?: string[]; acceptDownloads?: boolean; [key: string]: unknown }; [key: string]: unknown };
export default function NativeBrowserSettings() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Options | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    window.electron.invoke('native-browser:get-options', {}).then(result => {
      if (active && result.success) setOptions(result.data as Options);
    }).catch(error => { if (active) setMessage(String(error.message)); });
    return () => { active = false; };
  }, []);
  const update = (value: Partial<Options['browser']>) => setOptions(current => current ? { ...current, browser: { ...current.browser, ...value } } : current);
  const save = async () => {
    if (!options) return;
    setSaving(true);
    try {
      const result = await window.electron.invoke('native-browser:set-options', options);
      setMessage(result.success ? t('native_browser.saved') : result.error || t('common.error'));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <SettingsGroup title={t('native_browser.title')}>
    <p className="text-sm text-muted-foreground">{t('native_browser.local_description')}</p>
    {options && <FieldGroup>
      <Field><FieldLabel htmlFor="browser-profile">{t('native_browser.profile')}</FieldLabel>
        <Input id="browser-profile" value={options.browser.profile || ''} onChange={event => update({ profile: event.target.value || undefined })} maxLength={80} />
        <FieldDescription>{t('native_browser.profile_help')}</FieldDescription></Field>
      <Field><FieldLabel htmlFor="browser-domains">{t('native_browser.domains')}</FieldLabel>
        <Input id="browser-domains" value={(options.browser.allowedDomains || []).join(', ')} onChange={event => update({ allowedDomains: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} />
        <FieldDescription>{t('native_browser.domains_help')}</FieldDescription></Field>
      <Field orientation="horizontal"><FieldLabel htmlFor="browser-retain">{t('native_browser.retain')}</FieldLabel>
        <Switch id="browser-retain" checked={Boolean(options.browser.keepAlive)} onCheckedChange={value => update({ keepAlive: value })} /></Field>
      <Field orientation="horizontal"><FieldLabel htmlFor="browser-downloads">{t('native_browser.downloads')}</FieldLabel>
        <Switch id="browser-downloads" checked={Boolean(options.browser.acceptDownloads)} onCheckedChange={value => update({ acceptDownloads: value })} /></Field>
      <Button className="self-start" disabled={saving} onClick={() => { void save(); }}>{t('common.save')}</Button>
    </FieldGroup>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </SettingsGroup>;
}
