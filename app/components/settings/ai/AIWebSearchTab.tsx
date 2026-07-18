import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
  EyeOffIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { SettingsGroup } from '../blocks';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import { showToast } from '@/lib/store/useToastStore';
import type { AISettings } from '@/types';

type WebSearchProvider = NonNullable<AISettings['web_search_provider']>;
type WebFetchProvider = NonNullable<AISettings['web_fetch_provider']>;

const SEARCH_PROVIDERS: WebSearchProvider[] = ['auto', 'tavily', 'brave', 'searxng', 'ddg'];
const FETCH_PROVIDERS: WebFetchProvider[] = ['auto', 'jina', 'readability', 'tavily'];

function SecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide' : 'Show'}
          >
            <HugeiconsIcon icon={show ? EyeOffIcon : EyeIcon} />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

/** Web tools: search + fetch provider choice with optional API keys. */
export default function AIWebSearchTab() {
  const { t } = useTranslation();
  const [searchProvider, setSearchProvider] = useState<WebSearchProvider>('auto');
  const [fetchProvider, setFetchProvider] = useState<WebFetchProvider>('auto');
  const [tavilyKey, setTavilyKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [showOptionalKeys, setShowOptionalKeys] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    const config = await getAIConfig();
    setSearchProvider((config.web_search_provider as WebSearchProvider) || 'auto');
    setFetchProvider((config.web_fetch_provider as WebFetchProvider) || 'auto');
    setTavilyKey(config.web_search_tavily_key || '');
    setBraveKey(config.web_search_brave_key || '');
    setShowOptionalKeys(Boolean(config.web_search_tavily_key || config.web_search_brave_key));
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const persist = () =>
    saveAIConfig({
      web_search_provider: searchProvider,
      web_fetch_provider: fetchProvider,
      web_search_tavily_key: tavilyKey,
      web_search_brave_key: braveKey,
    });

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await persist();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error('[AIWebSearchTab] save', error);
      showToast('error', error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await persist();
      if (!window.electron?.ai?.testWebSearch) {
        setTestResult({ success: false, message: t('settings.ai.web_search.test_unavailable') });
        return;
      }
      const result = await window.electron.ai.testWebSearch();
      setTestResult(
        result.success
          ? {
              success: true,
              message: t('settings.ai.web_search.test_ok', {
                count: result.count ?? 0,
                provider: result.provider || 'http',
              }),
            }
          : { success: false, message: result.error || t('settings.ai.web_search.test_failed') },
      );
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : t('settings.ai.web_search.test_failed'),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('settings.ai.web_search.zero_config_banner')}
      </p>

      <SettingsGroup
        actions={
          <>
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {saved ? t('settings.ai.saved_config') : t('settings.ai.save_config')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={testing}
            >
              {testing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
              )}
              {testing ? t('settings.ai.testing') : t('settings.ai.test_brave')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t('settings.ai.web_search.search_provider')}</FieldLabel>
              <Select
                value={searchProvider}
                onValueChange={(next) => setSearchProvider(next as WebSearchProvider)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SEARCH_PROVIDERS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`settings.ai.web_search.providers.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>{t('settings.ai.web_search.fetch_provider')}</FieldLabel>
              <Select
                value={fetchProvider}
                onValueChange={(next) => setFetchProvider(next as WebFetchProvider)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FETCH_PROVIDERS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`settings.ai.web_search.fetch_providers.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Collapsible open={showOptionalKeys} onOpenChange={setShowOptionalKeys}>
            <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none">
              {t('settings.ai.web_search.optional_keys')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 border-t pt-4">
              <FieldGroup>
                <SecretField
                  id="web-tavily-key"
                  label={t('settings.ai.web_search.tavily_key')}
                  value={tavilyKey}
                  onChange={setTavilyKey}
                  placeholder="tvly-..."
                />
                <SecretField
                  id="web-brave-key"
                  label={t('settings.ai.brave_search_key_label')}
                  value={braveKey}
                  onChange={setBraveKey}
                  placeholder="BSA..."
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('settings.ai.web_search.keys_hint')}
                </p>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>

          {testResult ? (
            <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
              <HugeiconsIcon
                icon={testResult.success ? CheckmarkCircle02Icon : AlertCircleIcon}
                aria-hidden
              />
              <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SettingsGroup>
    </div>
  );
}
