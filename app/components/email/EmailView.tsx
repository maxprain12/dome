import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { HubSearch, HubSurface } from '@/components/hub';
import { HubSectionShell } from '@/components/shared/HubSectionShell';
import ListState from '@/components/shared/ListState';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import { toEmailPin } from '@/lib/chat/pinLabels';
import { useManyStore } from '@/lib/store/useManyStore';
import { emailFolderLabel, type EmailFolderRow } from '@/lib/email/folder-label';
import {
  collectNetworkEmails,
  filterEnvelopesByQuery,
  type MailEnvelope,
  type MailFilter,
} from '@/lib/email/mailQueues';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { invokeWithTimeout } from '@/lib/utils/ipcTimeout';
import { cn } from '@/lib/utils';
import type { EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import { MailDashboard } from '@/components/email/MailDashboard';
import { MailDetailPanel } from '@/components/email/MailDetailPanel';
import { MailComposePanel } from '@/components/email/MailComposePanel';

/** Match IPC/store max so the dashboard is not stuck at Himalaya's old page of 30. */
const LIST_PAGE_SIZE = 500;

type EmailAccountOption = {
  id: string;
  email?: string;
  display_name?: string;
};

type EmailFocusIntent = {
  sourceId: string;
  folder?: string;
  uid?: string | number;
  accountId?: string;
};

function parseEmailAccounts(raw: unknown): EmailAccountOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row): EmailAccountOption | null => {
      if (!row || typeof row !== 'object') return null;
      const id = typeof (row as { id?: unknown }).id === 'string' ? (row as { id: string }).id : '';
      if (!id) return null;
      const email = (row as { email?: unknown }).email;
      const displayName = (row as { display_name?: unknown }).display_name;
      return {
        id,
        email: typeof email === 'string' ? email : undefined,
        display_name: typeof displayName === 'string' ? displayName : undefined,
      };
    })
    .filter((row): row is EmailAccountOption => row != null);
}

function emailAccountLabel(account: EmailAccountOption, unknownLabel: string): string {
  const name = (account.display_name || '').trim();
  const email = (account.email || '').trim();
  if (name && !looksLikeOpaqueId(name)) return name;
  if (email && !looksLikeOpaqueId(email)) return email;
  return unknownLabel;
}

function accountScope(accountId: string | null | undefined): { accountId?: string } {
  return accountId ? { accountId } : {};
}

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

/** Sync subtitle under the mail hub title — extracted for S3776. */
function emailSyncDescription(
  syncError: string | null,
  syncing: boolean,
  lastSyncAt: number | null,
  t: TFunction,
): string {
  if (syncError) return t('email.sync_error', { error: syncError });
  if (syncing) return t('email.syncing');
  if (lastSyncAt) {
    return t('email.agent_subtitle_synced', {
      time: new Date(lastSyncAt).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      }),
    });
  }
  return t('email.agent_subtitle');
}

function EmailLoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[120px] flex-1 items-center justify-center bg-background">
      <ListState variant="loading" loadingLabel={t('common.loading')} compact />
    </div>
  );
}

function EmailEmptyAccountState({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <HubSurface
        icon={Mail01Icon}
        title={t('email.empty.title')}
        description={t('email.empty.description')}
        className="max-w-md"
      >
        <Button type="button" onClick={onConnect}>
          {t('email.empty.connect')}
        </Button>
      </HubSurface>
    </div>
  );
}

function EmailSyncStatusBadge({
  syncError,
  syncing,
  loading,
}: {
  syncError: string | null;
  syncing: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (syncError) {
    return <Badge variant="destructive">{t('email.sync_badge_error')}</Badge>;
  }
  if (syncing || loading) {
    return <Badge variant="secondary">{t('email.sync_badge_syncing')}</Badge>;
  }
  return null;
}

type EmailFolderPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderOptions: EmailFolderRow[];
  currentFolder: EmailFolderRow | undefined;
  onSelectFolder: (name: string) => void;
};

/** Folder command menu in the mail toolbar — extracted for S3776. */
function EmailFolderPicker({
  open,
  onOpenChange,
  folderOptions,
  currentFolder,
  onSelectFolder,
}: EmailFolderPickerProps) {
  const { t } = useTranslation();
  const CurrentFolderIcon = currentFolder ? folderIcon(currentFolder.name) : Folder01Icon;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
                    onSelect={() => onSelectFolder(f.name)}
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
  );
}

type EmailAccountPickerProps = {
  accounts: EmailAccountOption[];
  activeAccountId: string | null;
  onSelectAccount: (id: string) => void;
};

/** Visible only when the project has more than one mailbox. */
function EmailAccountPicker({ accounts, activeAccountId, onSelectAccount }: EmailAccountPickerProps) {
  const { t } = useTranslation();
  if (accounts.length <= 1) return null;
  const unknown = t('email.unknown_account');
  const selected = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];
  const items = accounts.map((a) => ({
    value: a.id,
    label: emailAccountLabel(a, unknown),
  }));

  return (
    <Select
      value={selected?.id ?? null}
      onValueChange={(next) => {
        if (next) onSelectAccount(next);
      }}
      items={items}
    >
      <SelectTrigger
        size="sm"
        className="min-w-0 max-w-[10rem] @[48rem]/email:max-w-xs"
        aria-label={t('email.account_label')}
      >
        <SelectValue>
          {selected ? emailAccountLabel(selected, unknown) : t('email.account_label')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {emailAccountLabel(a, unknown)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type EmailComposeState = { mode: 'new' | 'reply'; replyTo?: MailEnvelope };

type EmailDetailSidePanelProps = {
  composing: EmailComposeState | null;
  selected: MailEnvelope | null;
  readingId: string | null;
  error: EmailErrorInfo | null;
  folder: string;
  message: unknown;
  projectId: string;
  onCloseCompose: () => void;
  onCloseDetail: () => void;
  onReply: () => void;
  onAskMany: () => void;
  onSent: () => void;
};

/** Compose / read pane beside the dashboard — extracted for S3776. */
function EmailDetailSidePanel({
  composing,
  selected,
  readingId,
  error,
  folder,
  message,
  projectId,
  onCloseCompose,
  onCloseDetail,
  onReply,
  onAskMany,
  onSent,
}: EmailDetailSidePanelProps) {
  if (!composing && !selected) return null;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col border-l bg-background studio-view-enter',
        composing
          ? 'absolute inset-0 z-10 min-[720px]:static min-[720px]:inset-auto min-[720px]:z-auto min-[720px]:min-w-0 min-[720px]:flex-1 min-[720px]:max-w-2xl'
          : 'absolute inset-0 z-10 md:static md:inset-auto md:z-auto md:w-[28rem] md:shrink-0 lg:w-[32rem]',
      )}
    >
      {composing ? (
        <MailComposePanel
          mode={composing.mode}
          replyTo={composing.replyTo}
          folder={folder}
          projectId={projectId}
          onClose={onCloseCompose}
          onSent={onSent}
        />
      ) : selected ? (
        <MailDetailPanel
          selected={selected}
          reading={readingId === selected.id}
          error={error}
          folder={folder}
          message={message}
          onClose={onCloseDetail}
          onReply={onReply}
          onAskMany={onAskMany}
        />
      ) : null}
    </div>
  );
}

export default function EmailView() {
  const { t } = useTranslation();
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [inbox, setInbox] = useState<MailEnvelope[]>([]);
  const [sent, setSent] = useState<MailEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MailEnvelope | null>(null);
  const [message, setMessage] = useState<unknown>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<EmailFolderRow[]>([]);
  const [composing, setComposing] = useState<EmailComposeState | null>(null);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [filter, setFilter] = useState<MailFilter>('all');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [networkEmails, setNetworkEmails] = useState<Set<string>>(() => new Set());
  const [selfEmails, setSelfEmails] = useState<Set<string>>(() => new Set());
  /** True after a remote search merged into inbox — clear restores folder list. */
  const searchMergedRef = useRef(false);
  /** Skip folder/sent effects once after bootstrap already fetched. */
  const skipFolderRefreshRef = useRef(false);
  const skipSentRefreshRef = useRef(false);
  const openMessageSeqRef = useRef(0);

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
        ...accountScope(activeAccountId),
      });
      if (res.success) setInbox((res.envelopes as MailEnvelope[]) || []);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, folder, projectId]);

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
          ...accountScope(activeAccountId),
        });
        if (res.success) setSent((res.envelopes as MailEnvelope[]) || []);
      } catch {
        setSent([]);
      }
    },
    [activeAccountId, projectId],
  );

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await window.electron.email.syncNow?.({
        projectId,
        ...accountScope(activeAccountId),
      });
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
        ...accountScope(activeAccountId),
      });
      if (inboxRes.success) setInbox((inboxRes.envelopes as MailEnvelope[]) || []);
      else setError({ error: inboxRes.error, errorCode: inboxRes.errorCode, helpUrl: inboxRes.helpUrl });
      await refreshSent(folders);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t('email.sync_failed'));
    } finally {
      setSyncing(false);
    }
  }, [activeAccountId, folders, projectId, refreshSent, syncing, t]);

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
        const listed = parseEmailAccounts(res.accounts);
        setAccounts(listed);
        const ok = res.success && listed.length > 0;
        setHasAccount(ok);
        if (!ok) return;
        setSelfEmails(
          new Set(
            listed
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
        skipFolderRefreshRef.current = true;
        skipSentRefreshRef.current = true;
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

  const changeFolder = (next: string) => {
    setFolder(next);
    setQuery('');
    setSelected(null);
    setMessage(null);
    setComposing(null);
    setFolderMenuOpen(false);
    setFilter('all');
  };

  const changeAccount = (nextId: string) => {
    if (!nextId || nextId === activeAccountId) return;
    setActiveAccountId(nextId);
    setSelected(null);
    setMessage(null);
    setComposing(null);
    setQuery('');
    setFilter('all');
  };

  useEffect(() => {
    if (hasAccount !== true) return;
    if (skipFolderRefreshRef.current) {
      skipFolderRefreshRef.current = false;
      return;
    }
    void refreshInbox();
  }, [folder, hasAccount, refreshInbox]);

  useEffect(() => {
    if (hasAccount !== true) return;
    if (skipSentRefreshRef.current) {
      skipSentRefreshRef.current = false;
      return;
    }
    void refreshSent(folders);
  }, [folders, hasAccount, refreshSent]);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      searchMergedRef.current = false;
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
        ...accountScope(activeAccountId),
      });
      if (res.success) {
        const remote = (res.envelopes as MailEnvelope[]) || [];
        // Merge into local cache so from:/subject: filters still apply on the full set.
        searchMergedRef.current = true;
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
  }, [activeAccountId, folder, projectId, refreshInbox]);

  // Local filter is instant; remote search deepens results after a short pause.
  // Clearing the query restores the folder listing after a remote merge.
  useEffect(() => {
    if (hasAccount !== true) return;
    const q = query.trim();
    if (q.length < 2) {
      if (searchMergedRef.current) {
        searchMergedRef.current = false;
        void refreshInbox();
      }
      return;
    }
    const id = window.setTimeout(() => {
      void runSearch(q);
    }, 400);
    return () => window.clearTimeout(id);
  }, [hasAccount, query, refreshInbox, runSearch]);

  const openMessage = useCallback(
    async (env: MailEnvelope, folderName?: string) => {
      const seq = ++openMessageSeqRef.current;
      const f = folderName ?? folder;
      setComposing(null);
      setSelected(env);
      setReadingId(env.id);
      setMessage(null);
      setError(null);
      try {
        const res = await window.electron.email.read({
          messageId: env.id,
          folder: f,
          projectId,
          ...accountScope(env.accountId ?? activeAccountId),
        });
        if (openMessageSeqRef.current !== seq) return;
        if (res.success) setMessage(res.message);
        else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
      } finally {
        if (openMessageSeqRef.current === seq) setReadingId(null);
      }
    },
    [activeAccountId, folder, projectId],
  );

  const sentFolderName = useMemo(() => findSentFolder(folders), [folders]);
  const sentIds = useMemo(() => new Set(sent.map((e) => e.id)), [sent]);

  const askManyAbout = useCallback(
    (env: MailEnvelope | null, prompt: string) => {
      const many = useManyStore.getState();
      if (env) {
        many.addPinnedResource(
          toEmailPin({
            title: env.subject || t('email.no_subject'),
            uid: env.id,
            dbId: env.dbId ?? null,
            folder,
            accountId: env.accountId ?? null,
          }),
        );
      }
      many.setPendingOneShotSkill('dome-email-triage');
      many.setPendingManyHandoff(prompt);
      many.setOpen(true);
    },
    [folder, t],
  );

  const applyEmailFocus = useCallback(
    async (intent: EmailFocusIntent) => {
      if (hasAccount !== true) return;
      const targetFolder = intent.folder?.trim() || folder;
      const focusAccountId = intent.accountId?.trim() || activeAccountId;
      if (intent.accountId?.trim()) setActiveAccountId(intent.accountId.trim());
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
            ...accountScope(focusAccountId),
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
    [activeAccountId, folder, hasAccount, openMessage, projectId],
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (
        e as CustomEvent<{ sourceId?: string; folder?: string; uid?: string | number; accountId?: string }>
      ).detail;
      if (!detail?.sourceId) return;
      useOpenIntentStore.getState().consume('email');
      void applyEmailFocus({
        sourceId: detail.sourceId,
        ...(detail.folder ? { folder: detail.folder } : {}),
        ...(detail.uid != null ? { uid: detail.uid } : {}),
        ...(detail.accountId ? { accountId: detail.accountId } : {}),
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
        ...(pending.accountId ? { accountId: pending.accountId } : {}),
      });
    }
  }, [hasAccount, applyEmailFocus]);

  const matchedCount = useMemo(
    () => (query.trim() ? filterEnvelopesByQuery(inbox, query).length : null),
    [inbox, query],
  );

  if (hasAccount === null) return <EmailLoadingState />;
  if (hasAccount === false) return <EmailEmptyAccountState onConnect={openSettingsTab} />;

  const syncDescription = emailSyncDescription(syncError, syncing, lastSyncAt, t);
  const detailOpen = composing != null || selected != null;

  const startCompose = () => {
    setSelected(null);
    setMessage(null);
    setComposing({ mode: 'new' });
  };

  const handleSent = () => {
    setComposing(null);
    refreshInbox().catch(() => {});
    refreshSent(folders).catch(() => {});
  };

  const handleAskMany = () => {
    if (!selected) return;
    askManyAbout(
      selected,
      t('email.agent_prompt_about', {
        subject: selected.subject || t('email.no_subject'),
      }),
    );
  };

  return (
    <HubSectionShell
      className="@container/email text-foreground"
      title={t('email.tab_title')}
      description={syncDescription}
      actions={
        <>
          <EmailSyncStatusBadge syncError={syncError} syncing={syncing} loading={loading} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={() => {
              syncNow().catch(() => {});
            }}
          >
            {syncing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            )}
            <span className="@[40rem]/email:inline hidden">{t('email.sync_now')}</span>
          </Button>
          <Button type="button" size="sm" onClick={startCompose}>
            <HugeiconsIcon icon={NoteEditIcon} data-icon="inline-start" />
            <span className="@[40rem]/email:inline hidden">{t('email.compose')}</span>
          </Button>
        </>
      }
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <EmailAccountPicker
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSelectAccount={changeAccount}
          />
          <EmailFolderPicker
            open={folderMenuOpen}
            onOpenChange={setFolderMenuOpen}
            folderOptions={folderOptions}
            currentFolder={currentFolder}
            onSelectFolder={changeFolder}
          />

          <HubSearch
            className="min-w-0 flex-1 basis-[12rem]"
            value={query}
            onChange={setQuery}
            onSubmit={() => {
              runSearch(query).catch(() => {});
            }}
            placeholder={t('email.agent_search')}
            aria-label={t('email.agent_search')}
            clearLabel={t('common.cancel')}
          />
        </div>
      }
    >
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Must be a flex column so MailDashboard's flex-1/min-h-0 can bound the list scroll. */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            // Give the compose pane room: collapse list on narrow, shrink on md+.
            composing && 'hidden min-[720px]:flex min-[720px]:max-w-[42%] min-[1100px]:max-w-none',
          )}
        >
          <MailDashboard
            inbox={inbox}
            sent={sent}
            networkEmails={networkEmails}
            selfEmails={selfEmails}
            query={query}
            filter={filter}
            onFilter={setFilter}
            selectedId={selected?.id}
            onOpen={(env) => {
              const openInSent =
                filter === 'recent_sent' || (sentFolderName != null && sentIds.has(env.id));
              openMessage(env, openInSent ? sentFolderName ?? undefined : undefined).catch(() => {});
            }}
            resultCount={matchedCount}
          />
        </div>

        {detailOpen ? (
          <EmailDetailSidePanel
            composing={composing}
            selected={selected}
            readingId={readingId}
            error={error}
            folder={folder}
            message={message}
            projectId={projectId}
            onCloseCompose={() => setComposing(null)}
            onCloseDetail={() => {
              setSelected(null);
              setMessage(null);
            }}
            onReply={() => {
              if (!selected) return;
              setComposing({ mode: 'reply', replyTo: selected });
            }}
            onAskMany={handleAskMany}
            onSent={handleSent}
          />
        ) : null}
      </div>
    </HubSectionShell>
  );
}
