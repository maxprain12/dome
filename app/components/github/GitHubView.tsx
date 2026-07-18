import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  GithubIcon,
  RefreshIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import TrackingDashboard from './TrackingDashboard';
import GitHubConnect from './GitHubConnect';
import IssueDetailPanel from './IssueDetailPanel';
import MilestoneDetailModal from './MilestoneDetailModal';
import GitHubSettings from './GitHubSettings';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { HubHeader, HubPageHeader, HubSearch } from '@/components/hub';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type GitHubRepo = ReturnType<typeof useGitHubStore.getState>['repos'][number];

function buildSyncDescription(
  t: (key: string, options?: Record<string, unknown>) => string,
  syncError: string | null,
  syncStatus: string,
  isSyncing: boolean,
  lastSync: number | null,
): string {
  if (syncError && syncStatus === 'error') return t('github.sync_error', { error: syncError });
  if (isSyncing) return t('github.syncing');
  if (lastSync) {
    return t('github.dash_subtitle_synced', {
      time: new Date(lastSync).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      }),
    });
  }
  return t('github.dash_subtitle');
}

function GitHubSyncBadge({
  syncStatus,
  isSyncing,
  t,
}: {
  syncStatus: string;
  isSyncing: boolean;
  t: (key: string) => string;
}) {
  if (syncStatus === 'error') {
    return <Badge variant="destructive">{t('github.sync_badge_error')}</Badge>;
  }
  if (isSyncing) {
    return <Badge variant="mint">{t('github.sync_badge_syncing')}</Badge>;
  }
  return null;
}

function getSelectedRepoLabel(
  selectedRepo: GitHubRepo | null,
  selectedRepos: GitHubRepo[],
  t: (key: string) => string,
): string {
  if (selectedRepo?.full_name) return selectedRepo.full_name;
  if (selectedRepos.length === 0) return t('github.select_repos_in_settings');
  return t('github.tab_title');
}

function GitHubDetailSidebar({
  openIssueId,
  openMilestoneId,
  onCloseIssue,
  onCloseMilestone,
  onOpenIssueFromMilestone,
}: {
  openIssueId: string | null;
  openMilestoneId: string | null;
  onCloseIssue: () => void;
  onCloseMilestone: () => void;
  onOpenIssueFromMilestone: (issueId: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-l bg-background studio-view-enter md:w-80 lg:w-[28rem]">
      {openMilestoneId ? (
        <MilestoneDetailModal
          milestoneId={openMilestoneId}
          onClose={onCloseMilestone}
          onOpenIssue={onOpenIssueFromMilestone}
        />
      ) : null}
      {openIssueId ? <IssueDetailPanel issueId={openIssueId} onClose={onCloseIssue} /> : null}
    </div>
  );
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
  const syncStatus = useGitHubStore((s) => s.syncStatus);
  const lastSync = useGitHubStore((s) => s.lastSync);
  const syncError = useGitHubStore((s) => s.error);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isSyncing = manualSyncing || syncStatus === 'syncing';

  const handleSyncClick = useCallback(() => {
    if (isSyncing) return;
    setManualSyncing(true);
    void syncNow(projectId).finally(() => setManualSyncing(false));
  }, [isSyncing, projectId, syncNow]);

  const syncDescription = useMemo(
    () => buildSyncDescription(t, syncError, syncStatus, isSyncing, lastSync),
    [isSyncing, lastSync, syncError, syncStatus, t],
  );

  useEffect(() => {
    void init(projectId);
    return () => dispose();
  }, [init, dispose, projectId]);

  const applyGithubIssueFocus = useCallback(
    async (issueId: string, repoId?: string) => {
      setSettingsOpen(false);
      setOpenMilestoneId(null);
      if (repoId && repoId !== selectedRepoId) {
        await selectRepo(repoId);
      }
      setOpenIssueId(issueId);
    },
    [selectRepo, selectedRepoId],
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ issueId?: string; repoId?: string }>).detail;
      if (!detail?.issueId) return;
      useOpenIntentStore.getState().consume('github-issue');
      void applyGithubIssueFocus(detail.issueId, detail.repoId);
    };
    window.addEventListener('dome:focus-github-issue', onFocus);
    return () => window.removeEventListener('dome:focus-github-issue', onFocus);
  }, [applyGithubIssueFocus]);

  useEffect(() => {
    if (checkingAuth || !connected) return;
    const pending = useOpenIntentStore.getState().consume('github-issue');
    if (pending) void applyGithubIssueFocus(pending.issueId, pending.repoId);
  }, [checkingAuth, connected, applyGithubIssueFocus]);

  if (checkingAuth) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Spinner className="mr-2 size-4" />
        {t('github.loading')}
      </div>
    );
  }
  if (!connected) return <GitHubConnect projectId={projectId} />;

  const selectedRepos = repos.filter((r) => r.selected === 1);
  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null;
  const detailOpen = !settingsOpen && (openIssueId != null || openMilestoneId != null);

  return (
    <div className="flex h-full min-h-0 flex-col text-foreground">
      <HubPageHeader>
        <HubHeader
          title={t('github.tab_title')}
          description={syncDescription}
          className="w-full"
          actions={
            <>
              <GitHubSyncBadge syncStatus={syncStatus} isSyncing={isSyncing} t={t} />
              <SectionGuideHelp sectionKey="github" />
              <Button type="button" variant="outline" size="sm" disabled={isSyncing} onClick={handleSyncClick}>
                {isSyncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                )}
                {t('github.sync_now')}
              </Button>
              <Button
                type="button"
                variant={settingsOpen ? 'secondary' : 'outline'}
                size="icon-sm"
                aria-label={t('github.settings_title')}
                aria-pressed={settingsOpen}
                onClick={() => setSettingsOpen((v) => !v)}
              >
                <HugeiconsIcon icon={Settings01Icon} className="size-3.5" />
              </Button>
            </>
          }
        />

        <div className="@container/github-toolbar flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Popover open={repoPickerOpen} onOpenChange={setRepoPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-0 max-w-[14rem] justify-between gap-1.5 @[36rem]/github-toolbar:max-w-xs"
                    aria-label={t('github.tab_title')}
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <HugeiconsIcon icon={GithubIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">
                    {getSelectedRepoLabel(selectedRepo, selectedRepos, t)}
                  </span>
                </span>
                <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
                          onSelect={() => {
                            void selectRepo(r.id);
                            setRepoPickerOpen(false);
                          }}
                        >
                          <HugeiconsIcon icon={GithubIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{r.full_name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('github.open_repo_on_github')}
              disabled={!selectedRepo?.html_url}
              onClick={() => {
                if (selectedRepo?.html_url) window.open(selectedRepo.html_url, '_blank', 'noreferrer');
              }}
            >
              <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5" />
            </Button>
          </div>

          {!settingsOpen ? (
            <HubSearch
              className="min-w-0 flex-1 basis-[12rem]"
              value={query}
              onChange={setQuery}
              placeholder={t('github.dash_search')}
              aria-label={t('github.dash_search')}
              clearLabel={t('common.cancel')}
            />
          ) : null}
        </div>
      </HubPageHeader>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {settingsOpen ? (
            <GitHubSettings projectId={projectId} />
          ) : (
            <TrackingDashboard
              query={query}
              onOpenIssue={(id) => {
                setOpenMilestoneId(null);
                setOpenIssueId(id);
              }}
              onOpenMilestone={(id) => {
                setOpenIssueId(null);
                setOpenMilestoneId(id);
              }}
            />
          )}
        </div>

        {detailOpen ? (
          <GitHubDetailSidebar
            openIssueId={openIssueId}
            openMilestoneId={openMilestoneId}
            onCloseIssue={() => setOpenIssueId(null)}
            onCloseMilestone={() => setOpenMilestoneId(null)}
            onOpenIssueFromMilestone={(id) => {
              setOpenMilestoneId(null);
              setOpenIssueId(id);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
