import { useMemo, useState } from 'react';
import { RefreshCw, LogOut, Check, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient } from '@/lib/github/client';

/**
 * GitHub panel: repo selection, manual repo refresh, disconnect. Calendar
 * mapping toggles are persisted as settings consumed by the main-process bridge.
 */
export default function GitHubSettings() {
  const { t } = useTranslation();
  const repos = useGitHubStore((s) => s.repos);
  const login = useGitHubStore((s) => s.login);
  const toggleRepoSelected = useGitHubStore((s) => s.toggleRepoSelected);
  const disconnect = useGitHubStore((s) => s.disconnect);
  const [refreshing, setRefreshing] = useState(false);
  const [repoQuery, setRepoQuery] = useState('');

  const filteredRepos = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  }, [repos, repoQuery]);

  const refresh = async () => {
    setRefreshing(true);
    await githubClient.repos.refresh();
    await useGitHubStore.getState().refreshRepos();
    setRefreshing(false);
  };

  return (
    <div className="p-5 overflow-y-auto h-full" style={{ color: 'var(--dome-text)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">{t('github.settings_account')}</h3>
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('github.settings_connected_as', { login: login || '—' })}
          </p>
        </div>
        <button
          onClick={() => void disconnect()}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ border: '1px solid var(--dome-border)', color: 'var(--error)' }}
        >
          <LogOut size={14} /> {t('github.settings_disconnect')}
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">{t('github.settings_repos_title')}</h3>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('github.settings_refresh_list')}
        </button>
      </div>

      {repos.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md mb-2" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
          <Search size={14} style={{ color: 'var(--dome-text-muted)' }} />
          <input
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            placeholder={t('github.settings_search_repo')}
            className="text-sm bg-transparent outline-none flex-1"
            style={{ color: 'var(--dome-text)' }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-lg" style={{ border: '1px solid var(--dome-border)' }}>
        {repos.length === 0 && (
          <span className="text-sm p-4 text-center" style={{ color: 'var(--dome-text-muted)' }}>
            {t('github.settings_refresh_hint')}
          </span>
        )}
        {filteredRepos.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: '1px solid var(--dome-border)' }}
          >
            <span className="text-sm">
              {r.full_name}
              {r.private === 1 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                  {t('github.private_badge')}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={t('github.sync_repo_aria', { repo: r.full_name })}
              aria-pressed={r.selected === 1}
              onClick={() => void toggleRepoSelected(r.id, r.selected !== 1)}
              className="flex items-center justify-center w-5 h-5 rounded"
              style={{
                background: r.selected === 1 ? 'var(--dome-accent)' : 'transparent',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-on-accent)',
              }}
            >
              {r.selected === 1 && <Check size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
