import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, LayoutGrid, GanttChartSquare, GitBranch, Settings as SettingsIcon, ListTodo, Search, ExternalLink, Calendar, Leaf, Code2, Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import MinimalTracker from './MinimalTracker';
import GitHubConnect from './GitHubConnect';
import KanbanBoard from './KanbanBoard';
import GanttChart from './GanttChart';
import IssueDetailPanel from './IssueDetailPanel';
import GitHubSettings from './GitHubSettings';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import DomeIconBox from '@/components/ui/DomeIconBox';
import { DomeSelect } from '@/components/ui/DomeSelect';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeButton from '@/components/ui/DomeButton';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import '@/styles/github-view.css';

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
    <div className="dome-github-view" style={{ color: 'var(--dome-text)' }}>
      <div className="dome-github-view__header">
        {/* Row 1 — identity: app icon + title + repo selector + open-on-github */}
        <div className="dome-github-view__row-identity">
          <div className="dome-github-view__identity-leading">
            <DomeIconBox size="sm">
              <ListTodo size={16} strokeWidth={2} className="text-[var(--accent)]" />
            </DomeIconBox>
            <h1 className="dome-github-view__title" style={{ color: 'var(--dome-text)' }}>
              <span className="dome-github-view__title-text">{t('github.tab_title')}</span>
              <SectionGuideHelp sectionKey="github" />
            </h1>
            <span className="dome-github-view__divider" aria-hidden />
            <div className="dome-github-view__repo-wrap">
              <Github
                size={13}
                className="shrink-0 absolute top-1/2 -translate-y-1/2 text-[var(--tertiary-text)]"
                style={{ left: 10 }}
                aria-hidden
              />
              <DomeSelect
                value={selectedRepoId ?? ''}
                onChange={(e) => void selectRepo(e.target.value)}
                aria-label={t('github.tab_title')}
                className="min-w-0"
                selectClassName="dome-github-view__repo-select pl-7 py-1 text-sm"
              >
                {selectedRepos.length === 0 && <option value="">{t('github.select_repos_in_settings')}</option>}
                {selectedRepos.map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </DomeSelect>
            </div>
          </div>

          <div className="dome-github-view__identity-trailing">
            <DomeButton
              className="dome-github-view__action-btn"
              iconOnly
              variant="outline"
              size="sm"
              aria-label={t('github.open_repo_on_github')}
              disabled={!selectedRepo?.html_url}
              onClick={() => {
                if (selectedRepo?.html_url) window.open(selectedRepo.html_url, '_blank', 'noreferrer');
              }}
            >
              <ExternalLink size={14} />
            </DomeButton>
          </div>
        </div>

        {/* Row 2 — tools: search + mode + tabs + actions */}
        <div className="dome-github-view__row-tools">
          {!settingsOpen && (mode === 'minimal' || tab !== 'branches') && (
            <div className="dome-github-view__search-wrap">
              <Search
                size={13}
                className="shrink-0 absolute top-1/2 -translate-y-1/2 text-[var(--tertiary-text)]"
                style={{ left: 10 }}
                aria-hidden
              />
              <DomeInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('github.search_issue_milestone')}
                inputClassName="dome-github-view__search-input pl-7 py-1 text-sm"
                aria-label={t('github.search_issue_milestone')}
              />
            </div>
          )}

          <div className="dome-github-view__tools-group">
            <DomeSegmentedControl
              className="dome-github-view__segmented"
              size="sm"
              aria-label={t('github.mode_minimal_title')}
              value={mode}
              onChange={(v) => changeMode(v as ViewMode)}
              options={[
                { value: 'minimal', label: t('github.mode_minimal'), icon: <Leaf size={13} /> },
                { value: 'developer', label: t('github.mode_developer'), icon: <Code2 size={13} /> },
              ]}
            />

            {/*
             * The dev-mode segmented control is always rendered so the row
             * width stays stable when switching modes. When not in
             * developer mode we render an inert placeholder with the same
             * intrinsic width (visibility: hidden keeps layout space).
             */}
            {mode === 'developer' && !settingsOpen ? (
              <DomeSegmentedControl
                className="dome-github-view__segmented"
                size="sm"
                aria-label={t('github.mode_developer_title')}
                value={tab}
                onChange={(v) => setTab(v as GitHubTab)}
                options={tabs.map(({ key, label, icon: Icon }) => ({
                  value: key,
                  label,
                  icon: <Icon size={13} />,
                }))}
              />
            ) : (
              <div className="dome-github-view__segmented-placeholder" aria-hidden="true">
                <DomeSegmentedControl
                  className="dome-github-view__segmented"
                  size="sm"
                  value={tab}
                  onChange={() => undefined}
                  options={tabs.map(({ key, label, icon: Icon }) => ({
                    value: key,
                    label,
                    icon: <Icon size={13} />,
                  }))}
                />
              </div>
            )}

            <DomeButton
              className="dome-github-view__action-btn"
              iconOnly
              variant={settingsOpen ? 'secondary' : 'outline'}
              size="sm"
              aria-label={t('github.settings_title')}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <SettingsIcon size={14} />
            </DomeButton>
            <DomeButton
              className="dome-github-view__action-btn"
              iconOnly
              variant="outline"
              size="sm"
              aria-label={t('github.sync_now')}
              onClick={() => void syncNow()}
            >
              <RefreshCw
                size={14}
                className={syncStatus === 'syncing' ? 'animate-spin text-[var(--accent)]' : undefined}
              />
            </DomeButton>
            <DomeButton
              className="dome-github-view__action-btn"
              iconOnly
              variant="outline"
              size="sm"
              aria-label={t('github.open_popout')}
              onClick={() => openStandalone('seguimiento-popout', '/standalone/github', t('github.tab_title'))}
            >
              <ExternalLink size={14} />
            </DomeButton>
            <DomeButton
              className="dome-github-view__action-btn"
              iconOnly
              variant="outline"
              size="sm"
              aria-label={t('github.open_calendar_popout')}
              onClick={() => openStandalone('calendar-popout', '/standalone/calendar', t('tabs.calendar'))}
            >
              <Calendar size={14} />
            </DomeButton>
          </div>
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
