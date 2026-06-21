import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import { DomeInput } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';
import { cn } from '@/lib/utils';

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
    <div className="min-w-0 w-full space-y-4">
      <p className="text-sm leading-relaxed text-[var(--dome-text-muted)]">
        {t('settings.ai.web_search.zero_config_banner')}
      </p>

      <DomeCard className="space-y-4">
        <div className="settings-field-grid settings-field-grid--2">
          <DomeSelect
            label={t('settings.ai.web_search.search_provider')}
            value={searchProvider}
            onChange={(e) => setSearchProvider(e.target.value as WebSearchProvider)}
          >
            {SEARCH_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.ai.web_search.providers.${id}`)}
              </option>
            ))}
          </DomeSelect>

          <DomeSelect
            label={t('settings.ai.web_search.fetch_provider')}
            value={fetchProvider}
            onChange={(e) => setFetchProvider(e.target.value as WebFetchProvider)}
          >
            {FETCH_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.ai.web_search.fetch_providers.${id}`)}
              </option>
            ))}
          </DomeSelect>
        </div>

        <div>
          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            className="!px-0 !text-[var(--dome-text-muted)] hover:!text-[var(--dome-text)]"
            onClick={() => setShowOptionalKeys((v) => !v)}
            rightIcon={
              <ChevronDown
                className={cn('size-3.5 transition-transform', showOptionalKeys && 'rotate-180')}
                aria-hidden
              />
            }
          >
            {t('settings.ai.web_search.optional_keys')}
          </DomeButton>

          {showOptionalKeys ? (
            <div className="mt-3 space-y-4 border-t border-[var(--dome-border)] pt-4">
              <div>
                <label htmlFor="web-tavily-key" className="block text-sm font-medium mb-1.5 text-[var(--dome-text)]">
                  {t('settings.ai.web_search.tavily_key')}
                </label>
                <div className="relative w-full">
                  <DomeInput
                    id="web-tavily-key"
                    type={showTavilyKey ? 'text' : 'password'}
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    placeholder="tvly-..."
                    inputClassName="pr-10"
                    className="w-full [&_input]:pr-10"
                  />
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    iconOnly
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowTavilyKey((v) => !v)}
                    aria-label={showTavilyKey ? 'Hide' : 'Show'}
                  >
                    {showTavilyKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </DomeButton>
                </div>
              </div>

              <div>
                <label htmlFor="web-brave-key" className="block text-sm font-medium mb-1.5 text-[var(--dome-text)]">
                  {t('settings.ai.brave_search_key_label')}
                </label>
                <div className="relative w-full">
                  <DomeInput
                    id="web-brave-key"
                    type={showBraveKey ? 'text' : 'password'}
                    value={braveKey}
                    onChange={(e) => setBraveKey(e.target.value)}
                    placeholder="BSA..."
                    inputClassName="pr-10"
                    className="w-full [&_input]:pr-10"
                  />
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    iconOnly
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowBraveKey((v) => !v)}
                    aria-label={showBraveKey ? 'Hide' : 'Show'}
                  >
                    {showBraveKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </DomeButton>
                </div>
              </div>
              <p className="text-[11px] text-[var(--dome-text-muted)]">{t('settings.ai.web_search.keys_hint')}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <DomeButton type="button" variant="primary" size="md" onClick={() => void handleSave()} loading={saving}>
            {saved ? t('settings.ai.saved_config') : t('settings.ai.save_config')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="outline"
            size="md"
            onClick={() => void handleTest()}
            loading={testing}
            leftIcon={<Search className="size-4" aria-hidden />}
          >
            {testing ? t('settings.ai.testing') : t('settings.ai.test_brave')}
          </DomeButton>
        </div>

        {testResult ? (
          <DomeCallout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</DomeCallout>
        ) : null}
      </DomeCard>
    </div>
  );
}
