import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, LayoutGrid, GanttChartSquare, GitBranch, Settings as SettingsIcon, Github, Search, ExternalLink, Calendar, Leaf, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import MinimalTracker from './MinimalTracker';
import GitHubConnect from './GitHubConnect';
import KanbanBoard from './KanbanBoard';
import GanttChart from './GanttChart';
import IssueDetailPanel from './IssueDetailPanel';
import GitHubSettings from './GitHubSettings';

type ViewMode = 'minimal' | 'developer';
const MODE_KEY = 'dome:github:mode';

type GitHubTab = 'kanban' | 'gantt' | 'branches';

/**
 * Open a Dome popout window at a standalone route.
 * Force an opaque, non-vibrancy window: the default config uses
 * `transparent: true` + `vibrancy: 'sidebar'` (for the main chrome), which
 * stalls the macOS compositor when a full content view is painted into it.
 */
function openStandalone(id: string, route: string, title: string) {
  let backgroundColor: string | undefined;
  if (typeof document !== 'undefined') {
    backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--dome-bg').trim() || undefined;
  }
  void window.electron.invoke('window:create', {
    id,
    route,
    options: {
      width: 1100,
      height: 760,
      title,
      transparent: false,
      vibrancy: null,
      ...(backgroundColor ? { backgroundColor } : {}),
    },
  });
}

export default function GitHubView() {
  const { t } = useTranslation();
  const init = useGitHubStore((s) => s.init);
  const connected = useGitHubStore((s) => s.connected);
  const checkingAuth = useGitHubStore((s) => s.checkingAuth);
  const repos = useGitHubStore((s) => s.repos);
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const selectRepo = useGitHubStore((s) => s.selectRepo);
  const syncStatus = useGitHubStore((s) => s.syncStatus);
  const syncNow = useGitHubStore((s) => s.syncNow);
  const branches = useGitHubStore((s) => s.branches);

  const tabs = useMemo(
    () =>
      [
        { key: 'kanban' as const, label: t('github.tab_kanban'), icon: LayoutGrid },
        { key: 'gantt' as const, label: t('github.tab_gantt'), icon: GanttChartSquare },
        { key: 'branches' as const, label: t('github.tab_branches'), icon: GitBranch },
      ] as const,
    [t],
  );

  const [tab, setTab] = useState<GitHubTab>('kanban');
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ViewMode>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem(MODE_KEY) === 'developer' ? 'developer' : 'minimal'),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const changeMode = (next: ViewMode) => {
    setMode(next);
    setSettingsOpen(false);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void init();
  }, [init]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--dome-text-muted)' }}>
        {t('github.loading')}
      </div>
    );
  }
  if (!connected) return <GitHubConnect />;

  const selectedRepos = repos.filter((r) => r.selected === 1);
  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null;

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--dome-text)' }}>
      <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: 'var(--dome-border)' }}>
        <Github size={18} style={{ color: 'var(--dome-accent)' }} />
        <select
          value={selectedRepoId ?? ''}
          onChange={(e) => void selectRepo(e.target.value)}
          className="text-sm rounded px-2 py-1 max-w-xs"
          style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
        >
          {selectedRepos.length === 0 && <option value="">{t('github.select_repos_in_settings')}</option>}
          {selectedRepos.map((r) => (
            <option key={r.id} value={r.id}>{r.full_name}</option>
          ))}
        </select>

        {selectedRepo?.html_url && (
          <a
            href={selectedRepo.html_url}
            target="_blank"
            rel="noreferrer"
            title={t('github.open_repo_on_github')}
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <ExternalLink size={15} />
          </a>
        )}

        {!settingsOpen && (mode === 'minimal' || tab !== 'branches') && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
            <Search size={14} style={{ color: 'var(--dome-text-muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('github.search_issue_milestone')}
              className="text-sm bg-transparent outline-none w-44"
              style={{ color: 'var(--dome-text)' }}
            />
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <div className="flex items-center rounded-md mr-1 overflow-hidden" style={{ border: '1px solid var(--dome-border)' }}>
            <button
              onClick={() => changeMode('minimal')}
              title={t('github.mode_minimal_title')}
              className="flex items-center gap-1 text-xs px-2 py-1.5"
              style={{
                background: mode === 'minimal' ? 'var(--dome-bg-hover)' : 'transparent',
                color: mode === 'minimal' ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              }}
            >
              <Leaf size={14} /> {t('github.mode_minimal')}
            </button>
            <button
              onClick={() => changeMode('developer')}
              title={t('github.mode_developer_title')}
              className="flex items-center gap-1 text-xs px-2 py-1.5"
              style={{
                background: mode === 'developer' ? 'var(--dome-bg-hover)' : 'transparent',
                color: mode === 'developer' ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              }}
            >
              <Code2 size={14} /> {t('github.mode_developer')}
            </button>
          </div>

          {mode === 'developer' && !settingsOpen && tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md"
              style={{
                background: tab === key ? 'var(--dome-bg-hover)' : 'transparent',
                color: tab === key ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title={t('github.settings_title')}
            className="flex items-center text-sm px-2 py-1.5 rounded-md"
            style={{
              background: settingsOpen ? 'var(--dome-bg-hover)' : 'transparent',
              border: '1px solid var(--dome-border)',
              color: settingsOpen ? 'var(--dome-text)' : 'var(--dome-text-muted)',
            }}
          >
            <SettingsIcon size={15} />
          </button>
          <button
            onClick={() => void syncNow()}
            title={t('github.sync_now')}
            className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md ml-1"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openStandalone('seguimiento-popout', '/standalone/github', t('github.tab_title'))}
            title={t('github.open_popout')}
            className="flex items-center text-sm px-2 py-1.5 rounded-md"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            <ExternalLink size={15} />
          </button>
          <button
            onClick={() => openStandalone('calendar-popout', '/standalone/calendar', t('tabs.calendar'))}
            title={t('github.open_calendar_popout')}
            className="flex items-center gap-1 text-sm px-2 py-1.5 rounded-md"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            <Calendar size={15} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {settingsOpen ? (
          <GitHubSettings />
        ) : mode === 'minimal' ? (
          <MinimalTracker query={query} onOpenIssue={setOpenIssueId} />
        ) : (
          <>
            {tab === 'kanban' && <KanbanBoard onOpenIssue={setOpenIssueId} query={query} />}
            {tab === 'gantt' && <GanttChart query={query} />}
            {tab === 'branches' && (
              <div className="p-4 overflow-auto h-full">
                {branches.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_branches')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {branches.map((b) => (
                      <li key={b.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-md"
                        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
                        <GitBranch size={14} style={{ color: 'var(--dome-text-muted)' }} />
                        <span style={{ color: 'var(--dome-text)' }}>{b.name}</span>
                        {b.linked_issue_number && (
                          <span className="text-xs" style={{ color: 'var(--dome-accent)' }}>#{b.linked_issue_number}</span>
                        )}
                        {b.sha && <span className="ml-auto text-xs font-mono" style={{ color: 'var(--dome-text-muted)' }}>{b.sha.slice(0, 7)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {openIssueId && !settingsOpen && (
          <IssueDetailPanel issueId={openIssueId} onClose={() => setOpenIssueId(null)} />
        )}
      </div>
    </div>
  );
}
