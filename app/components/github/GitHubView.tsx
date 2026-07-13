import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, ChevronDownIcon, CodeIcon, ExternalLinkIcon, GitBranchIcon, GithubIcon, LayoutGridIcon, Leaf01Icon, RefreshIcon, Search01Icon, Settings01Icon, SquareChartGanttIcon, Task01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { useAppStore } from '@/lib/store/useAppStore';
import MinimalTracker from './MinimalTracker';
import GitHubConnect from './GitHubConnect';
import KanbanBoard from './KanbanBoard';
import GanttChart from './GanttChart';
import IssueDetailPanel from './IssueDetailPanel';
import MilestoneDetailModal from './MilestoneDetailModal';
import GitHubSettings from './GitHubSettings';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import '@/styles/github-view.css';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || undefined;
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
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const init = useGitHubStore((s) => s.init);
  const dispose = useGitHubStore((s) => s.dispose);
  const connected = useGitHubStore((s) => s.connected);
  const checkingAuth = useGitHubStore((s) => s.checkingAuth);
  const repos = useGitHubStore((s) => s.repos);
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const selectRepo = useGitHubStore((s) => s.selectRepo);
  const syncNow = useGitHubStore((s) => s.syncNow);
  const branches = useGitHubStore((s) => s.branches);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);

  const handleSyncClick = useCallback(() => {
    if (manualSyncing) return;
    setManualSyncing(true);
    void syncNow(projectId).finally(() => setManualSyncing(false));
  }, [manualSyncing, projectId, syncNow]);

  const tabs = useMemo(
    () =>
      [
        { key: 'kanban' as const, label: t('github.tab_kanban'), icon: LayoutGridIcon },
        { key: 'gantt' as const, label: t('github.tab_gantt'), icon: SquareChartGanttIcon },
        { key: 'branches' as const, label: t('github.tab_branches'), icon: GitBranchIcon },
      ] as const,
    [t],
  );

  const [tab, setTab] = useState<GitHubTab>('kanban');
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
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

  // Init IPC subscriptions on mount, tear them down on unmount so repeated
  // navigation (and popout windows) don't leak ipcRenderer listeners.
  useEffect(() => {
    void init(projectId);
    return () => dispose();
  }, [init, dispose, projectId]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('github.loading')}
      </div>
    );
  }
  if (!connected) return <GitHubConnect projectId={projectId} />;

  const selectedRepos = repos.filter((r) => r.selected === 1);
  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null;

  return (
    <div className="dome-github-view text-foreground">
      <div className="dome-github-view__header">
        {/* Row 1 — identity: app icon + title + repo selector + open-on-github */}
        <div className="dome-github-view__row-identity">
          <div className="dome-github-view__identity-leading">
            <div className="flex shrink-0 items-center justify-center size-7 rounded-md" style={{ background: 'color-mix(in srgb, var(--primary) 15%, var(--card))' }}>
              <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={2} className="text-primary" />
            </div>
            <h1 className="dome-github-view__title text-foreground">
              <span className="dome-github-view__title-text">{t('github.tab_title')}</span>
              <SectionGuideHelp sectionKey="github" />
            </h1>
            <span className="dome-github-view__divider" aria-hidden />
            <div className="dome-github-view__repo-wrap">
              <Popover open={repoPickerOpen} onOpenChange={setRepoPickerOpen}>
                <PopoverTrigger render={<Button type="button"
  variant="outline"
  className="w-full min-w-0 justify-between gap-1.5"
  aria-label={t('github.tab_title')} />}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <HugeiconsIcon icon={GithubIcon} size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">
                      {selectedRepo?.full_name ?? (selectedRepos.length === 0 ? t('github.select_repos_in_settings') : t('github.tab_title'))}
                    </span>
                  </span>
                  <HugeiconsIcon icon={ChevronDownIcon} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 gap-0 overflow-hidden p-0">
                  <Command>
                    <CommandInput placeholder={t('github.tab_title')} />
                    <CommandList>
                      <CommandEmpty>{t('github.select_repos_in_settings')}</CommandEmpty>
                      <CommandGroup>
                        {selectedRepos.map((r) => (
                          <CommandItem
                            key={r.id}
                            value={r.full_name}
                            onSelect={() => { void selectRepo(r.id); setRepoPickerOpen(false); }}
                          >
                            <HugeiconsIcon icon={GithubIcon} size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">{r.full_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="dome-github-view__identity-trailing">
            <Button className="dome-github-view__action-btn"
  variant="outline"
  aria-label={t('github.open_repo_on_github')}
  disabled={!selectedRepo?.html_url}
  onClick={() => {
                if (selectedRepo?.html_url) window.open(selectedRepo.html_url, '_blank', 'noreferrer');
              }}
  size="icon-sm">
              <HugeiconsIcon icon={ExternalLinkIcon} size={14} />
            </Button>
          </div>
        </div>

        {/* Row 2 — tools: search + mode + tabs + actions */}
        <div className="dome-github-view__row-tools">
          {!settingsOpen && (mode === 'minimal' || tab !== 'branches') && (
            <div className="dome-github-view__search-wrap">
              <HugeiconsIcon icon={Search01Icon}
                size={13}
                className="shrink-0 absolute top-1/2 -translate-y-1/2 text-muted-foreground"
                style={{ left: 10 }}
                aria-hidden
              />
              <Input className="dome-github-view__search-input pl-7 py-1 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('github.search_issue_milestone')} aria-label={t('github.search_issue_milestone')} />
            </div>
          )}

          <div className="dome-github-view__tools-group">
            <Tabs value={mode} onValueChange={(v) => changeMode(v as ViewMode)} className="min-w-0 dome-github-view__segmented"><TabsList aria-label={t('github.mode_minimal_title')} className="h-auto w-full max-w-full flex-wrap">{([
                { value: 'minimal', label: t('github.mode_minimal'), icon: <HugeiconsIcon icon={Leaf01Icon} size={13} /> },
                { value: 'developer', label: t('github.mode_developer'), icon: <HugeiconsIcon icon={CodeIcon} size={13} /> },
              ]).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>

            {/*
             * The dev-mode segmented control is always rendered so the row
             * width stays stable when switching modes. When not in
             * developer mode we render an inert placeholder with the same
             * intrinsic width (visibility: hidden keeps layout space).
             */}
            {mode === 'developer' && !settingsOpen ? (
              <Tabs value={tab} onValueChange={(v) => setTab(v as GitHubTab)} className="min-w-0 dome-github-view__segmented"><TabsList aria-label={t('github.mode_developer_title')} className="h-auto w-full max-w-full flex-wrap">{(tabs.map(({ key, label, icon }) => ({
                  value: key,
                  label,
                  icon: <HugeiconsIcon icon={icon} size={13} />,
                }))).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>
            ) : (
              <div className="dome-github-view__segmented-placeholder" aria-hidden="true">
                <Tabs value={tab} onValueChange={() => undefined} className="min-w-0 dome-github-view__segmented"><TabsList className="h-auto w-full max-w-full flex-wrap">{(tabs.map(({ key, label, icon }) => ({
                    value: key,
                    label,
                    icon: <HugeiconsIcon icon={icon} size={13} />,
                  }))).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>
              </div>
            )}

            <Button className="dome-github-view__action-btn"
  variant={settingsOpen ? 'secondary' : 'outline'}
  aria-label={t('github.settings_title')}
  aria-pressed={settingsOpen}
  onClick={() => setSettingsOpen((v) => !v)}
  size="icon-sm">
              <HugeiconsIcon icon={Settings01Icon} size={14} />
            </Button>
            <Button className="dome-github-view__action-btn"
  variant="outline"
  aria-label={t('github.sync_now')}
  onClick={handleSyncClick}
  size="icon-sm">
              <HugeiconsIcon icon={RefreshIcon}
                size={14}
                className={manualSyncing ? 'animate-spin text-primary' : undefined}
              />
            </Button>
            <Button className="dome-github-view__action-btn"
  variant="outline"
  aria-label={t('github.open_popout')}
  onClick={() => openStandalone('seguimiento-popout', '/standalone/github', t('github.tab_title'))}
  size="icon-sm">
              <HugeiconsIcon icon={ExternalLinkIcon} size={14} />
            </Button>
            <Button className="dome-github-view__action-btn"
  variant="outline"
  aria-label={t('github.open_calendar_popout')}
  onClick={() => openStandalone('calendar-popout', '/standalone/calendar', t('tabs.calendar'))}
  size="icon-sm">
              <HugeiconsIcon icon={Calendar03Icon} size={14} />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {settingsOpen ? (
          <GitHubSettings projectId={projectId} />
        ) : mode === 'minimal' ? (
          <MinimalTracker
            query={query}
            onOpenIssue={setOpenIssueId}
            onOpenMilestone={setOpenMilestoneId}
          />
        ) : (
          <>
            {tab === 'kanban' && (
              <KanbanBoard
                onOpenIssue={setOpenIssueId}
                onOpenMilestone={setOpenMilestoneId}
                query={query}
              />
            )}
            {tab === 'gantt' && <GanttChart query={query} onOpenMilestone={setOpenMilestoneId} />}
            {tab === 'branches' && (
              <div className="p-4 overflow-auto h-full">
                {branches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('github.no_branches')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {branches.map((b) => (
                      <li key={b.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-md"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <HugeiconsIcon icon={GitBranchIcon} size={14} className="text-muted-foreground" />
                        <span className="text-foreground">{b.name}</span>
                        {b.linked_issue_number && (
                          <span className="text-xs text-primary">#{b.linked_issue_number}</span>
                        )}
                        {b.sha && <span className="ml-auto text-xs font-mono text-muted-foreground">{b.sha.slice(0, 7)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {openMilestoneId && !settingsOpen && (
          <MilestoneDetailModal
            milestoneId={openMilestoneId}
            onClose={() => setOpenMilestoneId(null)}
            onOpenIssue={(id) => {
              setOpenMilestoneId(null);
              setOpenIssueId(id);
            }}
          />
        )}

        {openIssueId && !settingsOpen && (
          <IssueDetailPanel issueId={openIssueId} onClose={() => setOpenIssueId(null)} />
        )}
      </div>
    </div>
  );
}
