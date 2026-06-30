import { useMemo, useState } from 'react';
import { RefreshCw, LogOut, Check, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient } from '@/lib/github/client';

type SettingsRepoRow = {
  key: string;
  full_name: string;
  private: number;
  selected: boolean;
  repoId?: string;
  remote?: GitHubCatalogRepoRow;
  otherVaults: string[];
};

/**
 * GitHub panel: repo selection, manual repo refresh, disconnect. Calendar
 * mapping toggles are persisted as settings consumed by the main-process bridge.
 */
export default function GitHubSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const repos = useGitHubStore((s) => s.repos);
  const catalog = useGitHubStore((s) => s.catalog);
  const assignments = useGitHubStore((s) => s.assignments);
  const login = useGitHubStore((s) => s.login);
  const toggleRepoSelected = useGitHubStore((s) => s.toggleRepoSelected);
  const refreshCatalog = useGitHubStore((s) => s.refreshCatalog);
  const disconnect = useGitHubStore((s) => s.disconnect);
  const error = useGitHubStore((s) => s.error);
  const [refreshing, setRefreshing] = useState(false);
  const [repoQuery, setRepoQuery] = useState('');

  const displayRepos = useMemo((): SettingsRepoRow[] => {
    if (catalog.length > 0) {
      return catalog.map((remote) => {
        const tracked = repos.find((r) => r.full_name === remote.full_name);
        const otherVaults = (assignments[remote.full_name] ?? []).filter((p) => p !== projectId);
        return {
          key: tracked?.id ?? remote.full_name,
          full_name: remote.full_name,
          private: remote.private,
          selected: tracked?.selected === 1,
          repoId: tracked?.id,
          remote,
          otherVaults,
        };
      });
    }
    return repos.map((tracked) => ({
      key: tracked.id,
      full_name: tracked.full_name,
      private: tracked.private,
      selected: tracked.selected === 1,
      repoId: tracked.id,
      remote: {
        id: tracked.remote_id,
        full_name: tracked.full_name,
        name: tracked.name,
        owner: tracked.owner,
        private: tracked.private,
        html_url: tracked.html_url,
      },
      otherVaults: (assignments[tracked.full_name] ?? []).filter((p) => p !== projectId),
    }));
  }, [catalog, repos, assignments, projectId]);

  const filteredRepos = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    return q ? displayRepos.filter((r) => r.full_name.toLowerCase().includes(q)) : displayRepos;
  }, [displayRepos, repoQuery]);

  const refresh = async () => {
    setRefreshing(true);
    await githubClient.repos.refresh(projectId);
    await refreshCatalog(projectId);
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
          type="button"
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
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('github.settings_refresh_list')}
        </button>
      </div>

      {displayRepos.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md mb-2" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
          <Search size={14} style={{ color: 'var(--dome-text-muted)' }} />
          <input
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            placeholder={t('github.settings_search_repo')}
            aria-label={t('github.settings_search_repo')}
            className="text-sm bg-transparent outline-none flex-1"
            style={{ color: 'var(--dome-text)' }}
          />
        </div>
      )}

      {error && (
        <p className="text-sm mb-3" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1 rounded-lg" style={{ border: '1px solid var(--dome-border)' }}>
        {displayRepos.length === 0 && (
          <span className="text-sm p-4 text-center" style={{ color: 'var(--dome-text-muted)' }}>
            {t('github.settings_refresh_hint')}
          </span>
        )}
        {filteredRepos.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between px-3 py-2 gap-2"
            style={{ borderBottom: '1px solid var(--dome-border)' }}
          >
            <div className="min-w-0">
              <span className="text-sm">{r.full_name}</span>
              {r.private === 1 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                  {t('github.private_badge')}
                </span>
              )}
              {r.selected && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                  {t('github.settings_repo_assigned_here')}
                </span>
              )}
              {r.otherVaults.length > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                  {t('github.settings_repo_in_other_vault', { count: r.otherVaults.length })}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={t('github.sync_repo_aria', { repo: r.full_name })}
              aria-pressed={r.selected}
              onClick={() =>
                void toggleRepoSelected(
                  {
                    repoId: r.repoId,
                    remote: r.remote,
                    selected: !r.selected,
                  },
                  projectId,
                )
              }
              className="flex items-center justify-center w-5 h-5 rounded shrink-0"
              style={{
                background: r.selected ? 'var(--dome-accent)' : 'transparent',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-on-accent)',
              }}
            >
              {r.selected && <Check size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
