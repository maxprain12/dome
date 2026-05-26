import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Search } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeIconBox from '@/components/ui/DomeIconBox';
import { DomeInput } from '@/components/ui/DomeInput';

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
    <div className="space-y-6">
      <DomeCallout tone="info">{t('settings.ai.web_search.zero_config_banner')}</DomeCallout>

      <div className="flex items-start gap-3">
        <DomeIconBox size="md" background="var(--dome-accent-bg)">
          <Search className="size-4" style={{ color: 'var(--dome-accent)' }} />
        </DomeIconBox>
        <div>
          <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>
            {t('settings.ai.brave_search_title')}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.brave_search_desc')}
          </p>
        </div>
      </div>

      <DomeCard className="space-y-4">
        <div>
          <label
            htmlFor="web-search-provider"
            className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]"
          >
            {t('settings.ai.web_search.search_provider')}
          </label>
          <select
            id="web-search-provider"
            value={searchProvider}
            onChange={(e) => setSearchProvider(e.target.value as WebSearchProvider)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--dome-surface)] text-[var(--dome-text)] border-[var(--dome-border)]"
          >
            {SEARCH_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.ai.web_search.providers.${id}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="web-fetch-provider"
            className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]"
          >
            {t('settings.ai.web_search.fetch_provider')}
          </label>
          <select
            id="web-fetch-provider"
            value={fetchProvider}
            onChange={(e) => setFetchProvider(e.target.value as WebFetchProvider)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--dome-surface)] text-[var(--dome-text)] border-[var(--dome-border)]"
          >
            {FETCH_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.ai.web_search.fetch_providers.${id}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="web-tavily-key"
            className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]"
          >
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
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.free_key_at')}{' '}
            <a href="https://tavily.com" target="_blank" rel="noreferrer" className="underline">
              tavily.com
            </a>
          </p>
        </div>

        <div>
          <label
            htmlFor="web-brave-key"
            className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]"
          >
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
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.free_key_at')}{' '}
            <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="underline">
              brave.com/search/api
            </a>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          <DomeButton type="button" variant="primary" size="sm" onClick={() => void handleSave()} loading={saving}>
            {saved ? t('settings.ai.saved_config') : t('settings.ai.save_config')}
          </DomeButton>
          <DomeButton type="button" variant="outline" size="sm" onClick={() => void handleTest()} loading={testing}>
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
