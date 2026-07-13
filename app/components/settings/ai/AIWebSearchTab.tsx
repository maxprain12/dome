import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon as ChevronDown,
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  Search01Icon as Search,
  CheckmarkCircle02Icon as CheckCircle2,
  AlertCircleIcon as AlertCircle,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { showToast } from '@/lib/store/useToastStore';
type WebSearchProvider = NonNullable<AISettings['web_search_provider']>;
type WebFetchProvider = NonNullable<AISettings['web_fetch_provider']>;

const SEARCH_PROVIDERS: WebSearchProvider[] = ['auto', 'tavily', 'brave', 'searxng', 'ddg'];
const FETCH_PROVIDERS: WebFetchProvider[] = ['auto', 'jina', 'readability', 'tavily'];

export default function AIWebSearchTab() {
  const { t } = useTranslation();
  const [searchProvider, setSearchProvider] = useState<WebSearchProvider>('auto');
  const [fetchProvider, setFetchProvider] = useState<WebFetchProvider>('auto');
  const [tavilyKey, setTavilyKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [showBraveKey, setShowBraveKey] = useState(false);
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

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveAIConfig({
        web_search_provider: searchProvider,
        web_fetch_provider: fetchProvider,
        web_search_tavily_key: tavilyKey,
        web_search_brave_key: braveKey,
      });
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
      await saveAIConfig({
        web_search_provider: searchProvider,
        web_fetch_provider: fetchProvider,
        web_search_tavily_key: tavilyKey,
        web_search_brave_key: braveKey,
      });
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
    <div className="min-w-0 w-full flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('settings.ai.web_search.zero_config_banner')}
      </p>

      <Card className="p-4 flex flex-col gap-4">
        <div className="grid sm:grid-cols-2">
          <Field className="gap-1.5"><FieldLabel className="text-xs">{t('settings.ai.web_search.search_provider')}</FieldLabel><Select value={searchProvider} onValueChange={(next) => setSearchProvider(next as WebSearchProvider)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
            {SEARCH_PROVIDERS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`settings.ai.web_search.providers.${id}`)}
              </SelectItem>
            ))}
          </SelectContent></Select></Field>

          <Field className="gap-1.5"><FieldLabel className="text-xs">{t('settings.ai.web_search.fetch_provider')}</FieldLabel><Select value={fetchProvider} onValueChange={(next) => setFetchProvider(next as WebFetchProvider)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
            {FETCH_PROVIDERS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`settings.ai.web_search.fetch_providers.${id}`)}
              </SelectItem>
            ))}
          </SelectContent></Select></Field>
        </div>

        <div>
          <Button type="button"
  variant="ghost"
  className="!px-0 !text-muted-foreground hover:!text-foreground"
  onClick={() => setShowOptionalKeys((v) => !v)}
  size="sm">
            {t('settings.ai.web_search.optional_keys')}
          {
              <HugeiconsIcon icon={ChevronDown}
                className={cn('size-3.5 transition-transform', showOptionalKeys && 'rotate-180')}
                aria-hidden
              />
            }</Button>

          {showOptionalKeys ? (
            <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
              <div>
                <label htmlFor="web-tavily-key" className="block text-sm font-medium mb-1.5 text-foreground">
                  {t('settings.ai.web_search.tavily_key')}
                </label>
                <div className="relative w-full">
                  <Input className="w-full [&_input]:pr-10 pr-10" id="web-tavily-key" type={showTavilyKey ? 'text' : 'password'} value={tavilyKey} onChange={(e) => setTavilyKey(e.target.value)} placeholder="tvly-..." />
                  <Button type="button"
  variant="ghost"
  className="absolute right-1 top-1/2 -translate-y-1/2"
  onClick={() => setShowTavilyKey((v) => !v)}
  aria-label={showTavilyKey ? 'Hide' : 'Show'}
  size="icon-xs">
                    {showTavilyKey ? <HugeiconsIcon icon={EyeOff} className="size-3.5" /> : <HugeiconsIcon icon={Eye} className="size-3.5" />}
                  </Button>
                </div>
              </div>

              <div>
                <label htmlFor="web-brave-key" className="block text-sm font-medium mb-1.5 text-foreground">
                  {t('settings.ai.brave_search_key_label')}
                </label>
                <div className="relative w-full">
                  <Input className="w-full [&_input]:pr-10 pr-10" id="web-brave-key" type={showBraveKey ? 'text' : 'password'} value={braveKey} onChange={(e) => setBraveKey(e.target.value)} placeholder="BSA..." />
                  <Button type="button"
  variant="ghost"
  className="absolute right-1 top-1/2 -translate-y-1/2"
  onClick={() => setShowBraveKey((v) => !v)}
  aria-label={showBraveKey ? 'Hide' : 'Show'}
  size="icon-xs">
                    {showBraveKey ? <HugeiconsIcon icon={EyeOff} className="size-3.5" /> : <HugeiconsIcon icon={Eye} className="size-3.5" />}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('settings.ai.web_search.keys_hint')}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button"
  onClick={() => void handleSave()}
  loading={saving}>
            {saved ? t('settings.ai.saved_config') : t('settings.ai.save_config')}
          </Button>
          <Button type="button"
  variant="outline"
  onClick={() => void handleTest()}
  loading={testing}>{<HugeiconsIcon icon={Search} className="size-4" aria-hidden />}
            {testing ? t('settings.ai.testing') : t('settings.ai.test_brave')}
          </Button>
        </div>

        {testResult ? (
          <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
            {testResult.success ? <HugeiconsIcon icon={CheckCircle2} aria-hidden /> : <HugeiconsIcon icon={AlertCircle} aria-hidden />}
            <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
          </Alert>
        ) : null}
      </Card>
    </div>
  );
}
