import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  listCloudProviders,
  type CloudProviderOption,
  type ManyCloudRuntime,
} from '@/lib/manys/api';
import ManyMark from './ManyMark';

type RuntimeChoice = '' | ManyCloudRuntime['source'];

function providerName(provider: CloudProviderOption, unknown: string): string {
  const name = provider.name.trim();
  if (!name || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name)) return unknown;
  return name;
}

export default function ManyCreateForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: { name: string; runtime: ManyCloudRuntime }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [providers, setProviders] = useState<CloudProviderOption[] | null>(null);
  const [runtime, setRuntime] = useState<RuntimeChoice>('');
  const [providerId, setProviderId] = useState('');
  const unknown = t('manys.unknown_provider');
  const saved = providers ?? [];
  const selected = saved.find((provider) => provider.id === providerId) ?? null;
  const canUseSavedKey = saved.length > 0;

  useEffect(() => {
    let active = true;
    listCloudProviders()
      .then((rows) => {
        if (active) setProviders(rows);
      })
      .catch(() => {
        if (active) setProviders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseRuntime = (value: string) => {
    if (value === 'dome_credits') {
      setRuntime('dome_credits');
      return;
    }
    if (value === 'provider_key' && canUseSavedKey) {
      setRuntime('provider_key');
      setProviderId((current) => (
        saved.some((provider) => provider.id === current) ? current : saved[0]?.id || ''
      ));
    }
  };

  const runtimeChoice = (): ManyCloudRuntime | null => {
    if (runtime === 'dome_credits') return { source: 'dome_credits' };
    if (runtime === 'provider_key' && selected) return { source: 'provider_key', provider: selected.id };
    return null;
  };

  const onlySaved = saved.length === 1 ? saved[0] : null;
  const savedHint = !canUseSavedKey
    ? t('manys.runtime.provider_empty')
    : onlySaved
      ? providerName(onlySaved, unknown)
      : t('manys.runtime.choose_provider');

  const choice = runtimeChoice();

  return (
    <form
      className="flex flex-col gap-2 border-t border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!choice || !name.trim()) return;
        const input = { name: name.trim(), runtime: choice };
        onCreate(input).then((savedMany) => {
          if (!savedMany) return;
          setName('');
          setRuntime('');
        }).catch(() => {});
      }}
    >
      <Field>
        <FieldLabel htmlFor="many-name" className="sr-only">{t('manys.name')}</FieldLabel>
        <Input
          id="many-name"
          value={name}
          maxLength={120}
          placeholder={t('manys.name')}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <FieldSet className="gap-2">
        <FieldLegend className="text-xs font-medium">{t('manys.runtime.legend')}</FieldLegend>
        <RadioGroup value={runtime} onValueChange={chooseRuntime} className="gap-1">
          <label htmlFor="many-runtime-provider" className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <RadioGroupItem id="many-runtime-provider" value="provider_key" disabled={!canUseSavedKey || busy} />
            <ManyMark variant="mint" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{t('manys.runtime.provider_key')}</span>
              <span className="block truncate text-xs text-muted-foreground">{savedHint}</span>
            </span>
          </label>
          <label htmlFor="many-runtime-credits" className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/60">
            <RadioGroupItem id="many-runtime-credits" value="dome_credits" disabled={busy} />
            <ManyMark variant="gold" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{t('manys.runtime.dome_credits')}</span>
              <span className="block truncate text-xs text-muted-foreground">{t('manys.runtime.credits_hint')}</span>
            </span>
          </label>
        </RadioGroup>
      </FieldSet>
      {runtime === 'provider_key' && saved.length > 1 && (
        <Field>
          <FieldLabel htmlFor="many-cloud-provider">{t('manys.runtime.choose_provider')}</FieldLabel>
          <Select value={providerId} onValueChange={(value) => { if (value) setProviderId(value); }}>
            <SelectTrigger id="many-cloud-provider" className="w-full">
              <SelectValue>
                {selected ? providerName(selected, unknown) : t('manys.unknown_provider')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {saved.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {providerName(provider, unknown)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Button disabled={busy || !name.trim() || !choice} type="submit" className="self-end">
        {t('manys.create')}
      </Button>
    </form>
  );
}
