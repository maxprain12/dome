import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertDiamondIcon,
  ArchiveIcon,
  ChevronDownIcon,
  Delete02Icon,
  File02Icon,
  Folder01Icon,
  InboxIcon,
  Mail01Icon,
  NoteEditIcon,
  RefreshIcon,
  SentIcon,
  StarIcon,
} from '@hugeicons/core-free-icons';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubSearch } from '@/components/hub/HubSearch';
import { HubSurface } from '@/components/hub/HubBlocks';
import ListState from '@/components/shared/ListState';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { emailFolderLabel, type EmailFolderRow } from '@/lib/email/folder-label';
import {
  collectNetworkEmails,
  filterEnvelopesByQuery,
  type MailEnvelope,
  type MailFilter,
} from '@/lib/email/mailQueues';
import { invokeWithTimeout } from '@/lib/utils/ipcTimeout';
import type { EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import { MailDashboard } from '@/components/email/MailDashboard';
import { MailDetailPanel } from '@/components/email/MailDetailPanel';
import { MailComposePanel } from '@/components/email/MailComposePanel';

/** Match IPC/store max so the dashboard is not stuck at Himalaya's old page of 30. */
const LIST_PAGE_SIZE = 500;

function parseFolders(raw: unknown): EmailFolderRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x): EmailFolderRow | null => {
      if (typeof x === 'string') return { name: x };
      if (x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string') {
        const row = x as { name: string; desc?: string };
        return { name: row.name, desc: row.desc };
      }
      return null;
    })
    .filter((x): x is EmailFolderRow => Boolean(x?.name));
}

function folderIcon(name: string) {
  const upper = name.toUpperCase();
  if (upper === 'INBOX') return InboxIcon;
  if (upper === 'SENT' || upper === 'ENVIADOS') return SentIcon;
  if (upper === 'DRAFTS' || upper === 'BORRADORES') return File02Icon;
  if (upper === 'TRASH' || upper === 'PAPELERA') return Delete02Icon;
  if (upper === 'SPAM' || upper === 'JUNK') return AlertDiamondIcon;
  if (upper === 'ARCHIVE' || upper === 'ARCHIVO') return ArchiveIcon;
  if (upper === 'STARRED' || upper === 'FLAGGED' || upper === 'DESTACADOS') return StarIcon;
  return Folder01Icon;
}

function findSentFolder(folders: EmailFolderRow[]): string | null {
  for (const f of folders) {
    const base = f.name.replace(/^\[[^\]]+\]\//, '').toLowerCase();
    if (base.includes('sent') || base === 'outbox' || base === 'enviados') return f.name;
  }
  return null;
}

export default function EmailView() {
  const { t } = useTranslation();
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [inbox, setInbox] = useState<MailEnvelope[]>([]);
  const [sent, setSent] = useState<MailEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MailEnvelope | null>(null);
  const [message, setMessage] = useState<unknown>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<EmailFolderRow[]>([]);
  const [composing, setComposing] = useState<null | { mode: 'new' | 'reply'; replyTo?: MailEnvelope }>(
    null,
  );
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [filter, setFilter] = useState<MailFilter>('all');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [networkEmails, setNetworkEmails] = useState<Set<string>>(() => new Set());
  const [selfEmails, setSelfEmails] = useState<Set<string>>(() => new Set());

  const loadPeople = useCallback(async () => {
    try {
      const res = await window.electron.people.list(projectId);
      if (res.success && res.data?.people) {
        setNetworkEmails(collectNetworkEmails(res.data.people));
      }
    } catch {
      setNetworkEmails(new Set());
    }
  }, [projectId]);

  const refreshInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.listEnvelopes({
        folder,
        projectId,
        pageSize: LIST_PAGE_SIZE,
      });
      if (res.success) setInbox((res.envelopes as MailEnvelope[]) || []);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setLoading(false);
    }
  }, [folder, projectId]);

  const refreshSent = useCallback(
    async (folderList: EmailFolderRow[]) => {
      const sentName = findSentFolder(folderList);
      if (!sentName) {
        setSent([]);
        return;
      }
      try {
        const res = await window.electron.email.listEnvelopes({
          folder: sentName,
          projectId,
          pageSize: LIST_PAGE_SIZE,
        });
        if (res.success) setSent((res.envelopes as MailEnvelope[]) || []);
      } catch {
        setSent([]);
      }
    },
    [projectId],
  );

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await window.electron.email.syncNow?.({ projectId });
      if (res && res.success === false) {
        setSyncError(res.error || t('email.sync_failed'));
      }
      // Always land on INBOX after sync (not "Todos" / All Mail).
      const inboxName =
        folders.find((x) => x.name.toUpperCase() === 'INBOX')?.name || 'INBOX';
      setFolder(inboxName);
      setQuery('');
      setFilter('all');
      setSelected(null);
      setMessage(null);
      setComposing(null);
      const inboxRes = await window.electron.email.listEnvelopes({
        folder: inboxName,
        projectId,
        pageSize: LIST_PAGE_SIZE,
      });
      if (inboxRes.success) setInbox((inboxRes.envelopes as MailEnvelope[]) || []);
      else setError({ error: inboxRes.error, errorCode: inboxRes.errorCode, helpUrl: inboxRes.helpUrl });
      await refreshSent(folders);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t('email.sync_failed'));
    } finally {
      setSyncing(false);
    }
  }, [folders, projectId, refreshSent, syncing, t]);

  useEffect(() => {
    const unsubStatus = window.electron.email.onSyncStatus?.((data) => {
      setSyncing(Boolean(data?.syncing) || data?.status === 'syncing');
      if (typeof data?.lastSync === 'number') setLastSyncAt(data.lastSync);
      if (data?.error) setSyncError(String(data.error));
      else if (data?.status === 'idle' || data?.status === 'ok') setSyncError(null);
    });
    const unsubData = window.electron.email.onDataUpdated?.(() => {
      void refreshInbox();
      void refreshSent(folders);
    });
    void window.electron.email.syncStatus?.({ projectId }).then((res) => {
      if (!res?.success) return;
      const status = (res as { data?: { syncing?: boolean; lastSync?: number | null; error?: string | null } })
        .data;
      if (!status) return;
      setSyncing(Boolean(status.syncing));
      if (typeof status.lastSync === 'number') setLastSyncAt(status.lastSync);
      if (status.error) setSyncError(String(status.error));
    });
    return () => {
      unsubStatus?.();
      unsubData?.();
    };
  }, [folders, projectId, refreshInbox, refreshSent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invokeWithTimeout(
          () => window.electron.email.listAccounts({ projectId }),
          30_000,
        );
        if (cancelled) return;
        const accounts = (res.accounts as Array<{ email?: string }> | undefined) || [];
        const ok = res.success && accounts.length > 0;
        setHasAccount(ok);
        if (!ok) return;
        setSelfEmails(
          new Set(
            accounts
              .map((a) => (a.email || '').trim().toLowerCase())
              .filter(Boolean),
          ),
        );
        const f = await invokeWithTimeout(
          () => window.electron.email.listFolders({ projectId }),
          30_000,
        );
        if (cancelled) return;
        const parsed = f.success ? parseFolders(f.folders) : [];
        const folderList = parsed.length > 0 ? parsed : [{ name: 'INBOX' }];
        setFolders(folderList);
        const inboxName =
          folderList.find((x) => x.name.toUpperCase() === 'INBOX')?.name || 'INBOX';
        setFolder(inboxName);
        void loadPeople();
        // Load inbox immediately — do not only rely on the folder/hasAccount effect
        // (that path can be skipped if AppShell remounts mid-flight).
        const inboxRes = await window.electron.email.listEnvelopes({
          folder: inboxName,
          projectId,
          pageSize: LIST_PAGE_SIZE,
        });
        if (cancelled) return;
        if (inboxRes.success) setInbox((inboxRes.envelopes as MailEnvelope[]) || []);
        else {
          setError({
            error: inboxRes.error,
            errorCode: inboxRes.errorCode,
            helpUrl: inboxRes.helpUrl,
          });
        }
        void refreshSent(folderList);
      } catch (err) {
        if (cancelled) return;
        setHasAccount(false);
        setError({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPeople, projectId, refreshSent]);

  const folderOptions = useMemo(() => {
    const names = folders.map((f) => f.name);
    if (names.includes(folder)) return folders;
    return [{ name: folder }, ...folders];
  }, [folders, folder]);

  const currentFolder = folderOptions.find((f) => f.name === folder) ?? folderOptions[0];
  const CurrentFolderIcon = currentFolder ? folderIcon(currentFolder.name) : Folder01Icon;

  const changeFolder = (next: string) => {
    setFolder(next);
    setQuery('');
    setSelected(null);
    setMessage(null);
    setComposing(null);
    setFolderMenuOpen(false);
    setFilter('all');
  };

  useEffect(() => {
    if (hasAccount !== true) return;
    void refreshInbox();
  }, [folder, hasAccount, refreshInbox]);

  useEffect(() => {
    if (hasAccount !== true) return;
    void refreshSent(folders);
  }, [folders, hasAccount, refreshSent]);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      await refreshInbox();
      return;
    }
    // Strip local operators for the remote IMAP query (from:/subject: stay local).
    const remoteQ = q
      .replace(/(?:^|\s)from:\S+/gi, ' ')
      .replace(/(?:^|\s)subject:("[^"]+"|\S+)/gi, ' ')
      .trim();
    if (!remoteQ) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.search({
        query: remoteQ,
        folder,
        projectId,
        pageSize: LIST_PAGE_SIZE,
      });
      if (res.success) {
        const remote = (res.envelopes as MailEnvelope[]) || [];
        // Merge into local cache so from:/subject: filters still apply on the full set.
        setInbox((prev) => {
          const byId = new Map(prev.map((e) => [e.id, e]));
          for (const env of remote) byId.set(env.id, env);
          return Array.from(byId.values());
        });
      } else {
        setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
      }
    } finally {
      setLoading(false);
    }
  }, [folder, projectId, refreshInbox]);

  // Local filter is instant; remote search deepens results after a short pause.
  useEffect(() => {
    if (hasAccount !== true) return;
    const q = query.trim();
    if (q.length < 2) return;
    const id = window.setTimeout(() => {
      void runSearch(q);
    }, 400);
    return () => window.clearTimeout(id);
  }, [hasAccount, query, runSearch]);

  const openMessage = useCallback(
    async (env: MailEnvelope, folderName?: string) => {
      const f = folderName ?? folder;
      setComposing(null);
      setSelected(env);
      setReadingId(env.id);
      setMessage(null);
      try {
        const res = await window.electron.email.read({ messageId: env.id, folder: f, projectId });
        if (res.success) setMessage(res.message);
        else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
      } finally {
        setReadingId(null);
      }
    },
    [folder, projectId],
  );

  const askManyAbout = useCallback(
    (env: MailEnvelope | null, prompt: string) => {
      const many = useManyStore.getState();
      if (env) {
        // Pin the IMAP uid (what email_read / Himalaya expect), not the SQLite row id (emsg-…).
        many.addPinnedResource({
          id: String(env.id),
          title: env.subject || t('email.no_subject'),
          type: 'email',
          kind: 'email',
          meta: {
            folder,
            uid: String(env.id),
            dbId: env.dbId || undefined,
            accountId: env.accountId,
          },
        });
      }
      many.setPendingOneShotSkill('dome-email-triage');
      many.setPendingManyHandoff(prompt);
      many.setOpen(true);
    },
    [folder, t],
  );

  const applyEmailFocus = useCallback(
    async (intent: { sourceId: string; folder?: string; uid?: string | number }) => {
      if (hasAccount !== true) return;
      const targetFolder = intent.folder?.trim() || folder;
      setComposing(null);
      setQuery('');
      setError(null);

      const loadFolder = async (f: string): Promise<MailEnvelope[]> => {
        setLoading(true);
        try {
          const res = await window.electron.email.listEnvelopes({
            folder: f,
            projectId,
            pageSize: LIST_PAGE_SIZE,
          });
          if (res.success) {
            const list = (res.envelopes as MailEnvelope[]) || [];
            if (f.toUpperCase() === 'INBOX' || f === folder) setInbox(list);
            return list;
          }
          setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
          return [];
        } finally {
          setLoading(false);
        }
      };

      if (targetFolder !== folder) {
        setFolder(targetFolder);
        setSelected(null);
        setMessage(null);
      }

      const list = await loadFolder(targetFolder);
      const uidStr = intent.uid != null ? String(intent.uid) : null;
      const match =
        list.find((env) => env.dbId === intent.sourceId) ||
        (uidStr ? list.find((env) => String(env.id) === uidStr) : undefined) ||
        list.find((env) => env.id === intent.sourceId);

      if (match) await openMessage(match, targetFolder);
    },
    [folder, hasAccount, openMessage, projectId],
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (
        e as CustomEvent<{ sourceId?: string; folder?: string; uid?: string | number }>
      ).detail;
      if (!detail?.sourceId) return;
      useOpenIntentStore.getState().consume('email');
      void applyEmailFocus({
        sourceId: detail.sourceId,
        ...(detail.folder ? { folder: detail.folder } : {}),
        ...(detail.uid != null ? { uid: detail.uid } : {}),
      });
    };
    window.addEventListener('dome:focus-email', onFocus);
    return () => window.removeEventListener('dome:focus-email', onFocus);
  }, [applyEmailFocus]);

  useEffect(() => {
    if (hasAccount !== true) return;
    const pending = useOpenIntentStore.getState().consume('email');
    if (pending) {
      void applyEmailFocus({
        sourceId: pending.sourceId,
        ...(pending.folder ? { folder: pending.folder } : {}),
        ...(pending.uid != null ? { uid: pending.uid } : {}),
      });
    }
  }, [hasAccount, applyEmailFocus]);

  const matchedCount = useMemo(
    () => (query.trim() ? filterEnvelopesByQuery(inbox, query).length : null),
    [inbox, query],
  );

  if (hasAccount === null) {
    return (
      <div className="flex h-full min-h-[120px] flex-1 items-center justify-center bg-background">
        <ListState variant="loading" loadingLabel={t('common.loading')} compact />
      </div>
    );
  }

  if (hasAccount === false) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <HubSurface
          icon={Mail01Icon}
          title={t('email.empty.title')}
          description={t('email.empty.description')}
          className="max-w-md"
        >
          <Button type="button" onClick={openSettingsTab}>
            {t('email.empty.connect')}
          </Button>
        </HubSurface>
      </div>
    );
  }

  const syncDescription = syncError
    ? t('email.sync_error', { error: syncError })
    : syncing
      ? t('email.syncing')
      : lastSyncAt
        ? t('email.agent_subtitle_synced', {
            time: new Date(lastSyncAt).toLocaleString([], {
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            }),
          })
        : t('email.agent_subtitle');

  const detailOpen = composing != null || selected != null;

  return (
    <div className="@container/email flex h-full min-h-0 flex-col text-foreground">
      <div
        className={
          detailOpen
            ? 'flex shrink-0 flex-col gap-2 border-b bg-card px-3 py-2'
            : 'flex shrink-0 flex-col gap-3 border-b bg-card px-4 py-3'
        }
      >
        <HubHeader
          title={t('email.tab_title')}
          description={detailOpen ? undefined : syncDescription}
          className="w-full"
          actions={
            <>
              {syncError ? (
                <Badge variant="destructive">{t('email.sync_badge_error')}</Badge>
              ) : syncing || loading ? (
                <Badge variant="secondary">{t('email.sync_badge_syncing')}</Badge>
              ) : null}
              <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                )}
                <span className="@[40rem]/email:inline hidden">{t('email.sync_now')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setMessage(null);
                  setComposing({ mode: 'new' });
                }}
              >
                <HugeiconsIcon icon={NoteEditIcon} data-icon="inline-start" />
                <span className="@[40rem]/email:inline hidden">{t('email.compose')}</span>
              </Button>
            </>
          }
        />

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Popover open={folderMenuOpen} onOpenChange={setFolderMenuOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-0 max-w-[10rem] justify-between gap-1.5 @[48rem]/email:max-w-xs"
                  aria-label={t('email.folders.openMenu')}
                />
              }
            >
              <HugeiconsIcon icon={CurrentFolderIcon} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {currentFolder ? emailFolderLabel(currentFolder.name, t) : t('email.folders.title')}
              </span>
              <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-56 gap-0 overflow-hidden p-0">
              <Command>
                <CommandInput placeholder={t('email.folders.title')} />
                <CommandList>
                  <CommandEmpty>{t('email.no_messages')}</CommandEmpty>
                  <CommandGroup>
                    {folderOptions.map((f) => {
                      const icon = folderIcon(f.name);
                      return (
                        <CommandItem
                          key={f.name}
                          value={`${f.name} ${emailFolderLabel(f.name, t)}`}
                          onSelect={() => changeFolder(f.name)}
                        >
                          <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{emailFolderLabel(f.name, t)}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <HubSearch
            className="min-w-0 flex-1 basis-[12rem]"
            value={query}
            onChange={setQuery}
            onSubmit={() => void runSearch(query)}
            placeholder={t('email.agent_search')}
            aria-label={t('email.agent_search')}
            clearLabel={t('common.cancel')}
          />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <MailDashboard
            inbox={inbox}
            sent={sent}
            networkEmails={networkEmails}
            selfEmails={selfEmails}
            query={query}
            filter={filter}
            onFilter={setFilter}
            selectedId={selected?.id}
            onOpen={(env) => void openMessage(env)}
            onCompose={() => {
              setSelected(null);
              setMessage(null);
              setComposing({ mode: 'new' });
            }}
            onAskManyTriage={() => askManyAbout(null, t('email.agent_prompt_triage'))}
            onAskManySummarize={() => askManyAbout(null, t('email.agent_prompt_summarize'))}
            compact={detailOpen}
            resultCount={matchedCount}
          />
        </div>

        {detailOpen ? (
          <div className="absolute inset-0 z-10 flex h-full min-h-0 w-full flex-col border-l bg-background md:static md:inset-auto md:z-auto md:w-[28rem] md:shrink-0 lg:w-[32rem]">
            {composing ? (
              <MailComposePanel
                mode={composing.mode}
                replyTo={composing.replyTo}
                folder={folder}
                projectId={projectId}
                onClose={() => setComposing(null)}
                onSent={() => {
                  setComposing(null);
                  void refreshInbox();
                  void refreshSent(folders);
                }}
              />
            ) : selected ? (
              <MailDetailPanel
                selected={selected}
                reading={readingId === selected.id}
                error={error}
                folder={folder}
                message={message}
                onClose={() => {
                  setSelected(null);
                  setMessage(null);
                }}
                onReply={() => setComposing({ mode: 'reply', replyTo: selected })}
                onAskMany={() =>
                  askManyAbout(
                    selected,
                    t('email.agent_prompt_about', {
                      subject: selected.subject || t('email.no_subject'),
                    }),
                  )
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
