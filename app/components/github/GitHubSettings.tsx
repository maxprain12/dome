import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon, Logout01Icon, RefreshIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
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
 * GitHub panel: repo selection, manual repo refresh, disconnect.
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
    try {
      await githubClient.repos.refresh(projectId);
      await refreshCatalog(projectId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-4 sm:p-5">
      <Card size="sm" className="min-h-0 flex-1 overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b">
          <CardTitle>{t('github.settings_account')}</CardTitle>
          <CardDescription>
            {t('github.settings_connected_as', { login: login || '—' })}
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void disconnect()}
            >
              <HugeiconsIcon icon={Logout01Icon} data-icon="inline-start" />
              {t('github.settings_disconnect')}
            </Button>
          </CardAction>
        </CardHeader>

        <CardHeader className="shrink-0">
          <CardTitle>{t('github.settings_repos_title')}</CardTitle>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              )}
              {t('github.settings_refresh_list')}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-(--card-spacing)">
          {displayRepos.length > 0 ? (
            <InputGroup className="h-8 shrink-0">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={repoQuery}
                onChange={(e) => setRepoQuery(e.target.value)}
                placeholder={t('github.settings_search_repo')}
                aria-label={t('github.settings_search_repo')}
              />
            </InputGroup>
          ) : null}

          {error ? (
            <p className="shrink-0 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
            {displayRepos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('github.settings_refresh_hint')}
              </p>
            ) : filteredRepos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('github.settings_search_repo')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredRepos.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      aria-pressed={r.selected}
                      aria-label={t('github.sync_repo_aria', { repo: r.full_name })}
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
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left',
                        'transition-colors hover:bg-brand-mint/40',
                        r.selected && 'bg-brand-mint/50',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm text-foreground">{r.full_name}</span>
                        <span className="flex min-w-0 flex-wrap items-center gap-1">
                          {r.private === 1 ? (
                            <Badge variant="mint">{t('github.private_badge')}</Badge>
                          ) : null}
                          {r.selected ? (
                            <Badge variant="lime">{t('github.settings_repo_assigned_here')}</Badge>
                          ) : null}
                          {r.otherVaults.length > 0 ? (
                            <Badge variant="outline">
                              {t('github.settings_repo_in_other_vault', {
                                count: r.otherVaults.length,
                              })}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-md border',
                          r.selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background',
                        )}
                        aria-hidden
                      >
                        {r.selected ? <HugeiconsIcon icon={CheckIcon} className="size-3" /> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
