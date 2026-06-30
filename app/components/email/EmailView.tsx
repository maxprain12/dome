import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Mail,
  RefreshCw,
  Search,
  PenSquare,
  Send,
  Reply,
  ReplyAll,
  Forward,
  Archive as ArchiveIcon,
  Trash2,
  MoreHorizontal,
  Loader2,
  Inbox,
  SendHorizontal,
  FileText,
  AlertOctagon,
  Archive,
  Star,
  Folder,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Check,
} from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import EmailBody from '@/components/email/EmailBody';
import HubListState from '@/components/ui/HubListState';
import DomeButton from '@/components/ui/DomeButton';
import { emailFolderLabel, type EmailFolderRow } from '@/lib/email/folder-label';
import { invokeWithTimeout } from '@/lib/utils/ipcTimeout';
import '@/styles/email-view.css';

interface Envelope {
  id: string;
  subject?: string;
  from?: { name?: string; addr?: string } | string;
  date?: string;
  flags?: string[];
}

function fromLabel(from: Envelope['from']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return from.name || from.addr || '';
}

function fromEmail(from: Envelope['from']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return from.addr || from.name || '';
}

function fromName(from: Envelope['from']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return from.name || from.addr || '';
}

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = trimmed[0]?.toUpperCase() ?? '?';
  return first;
}

const MONTHS_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_SHORT_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_SHORT_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

function localeStrings(lang: string): { months: string[]; weekdays: string[]; today: string; yesterday: string } {
  const lower = lang.toLowerCase();
  if (lower.startsWith('es')) return { months: MONTHS_SHORT_ES, weekdays: WEEKDAYS_ES, today: 'Hoy', yesterday: 'Ayer' };
  if (lower.startsWith('pt')) return { months: MONTHS_SHORT_PT, weekdays: WEEKDAYS_PT, today: 'Hoje', yesterday: 'Ontem' };
  if (lower.startsWith('fr')) return { months: MONTHS_SHORT_FR, weekdays: WEEKDAYS_FR, today: "Aujourd'hui", yesterday: 'Hier' };
  return { months: MONTHS_SHORT_EN, weekdays: WEEKDAYS_EN, today: 'Today', yesterday: 'Yesterday' };
}

function parseEmailDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const d = new Date(numeric);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function formatEmailDate(raw: string | undefined, lang: string): string {
  const date = parseEmailDate(raw);
  if (!date) return raw || '';
  const { months, weekdays, today, yesterday } = localeStrings(lang);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay(date, now)) return `${today}, ${time}`;
  if (sameDay(date, yesterdayDate)) return `${yesterday}, ${time}`;
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    const wd = weekdays[date.getDay()] ?? '';
    return `${wd}, ${time}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate()} ${months[date.getMonth()] ?? ''}, ${time}`;
  }
  return `${date.getDate()} ${months[date.getMonth()] ?? ''} ${date.getFullYear()}, ${time}`;
}

function flagChips(flags: string[] | undefined, t: (key: string) => string): { label: string; key: string }[] {
  if (!flags || flags.length === 0) return [];
  const out: { label: string; key: string }[] = [];
  const has = (kw: string) => flags.some((f) => f.toLowerCase().includes(kw.toLowerCase()));
  if (has('flagged')) out.push({ key: 'flagged', label: t('email.reader.flags.flagged') });
  if (has('answered')) out.push({ key: 'answered', label: t('email.reader.flags.answered') });
  if (has('draft')) out.push({ key: 'draft', label: t('email.reader.flags.draft') });
  if (has('deleted')) out.push({ key: 'deleted', label: t('email.reader.flags.deleted') });
  return out;
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
  if (upper === 'INBOX') return Inbox;
  if (upper === 'SENT' || upper === 'ENVIADOS') return SendHorizontal;
  if (upper === 'DRAFTS' || upper === 'BORRADORES') return FileText;
  if (upper === 'TRASH' || upper === 'PAPELERA') return Trash2;
  if (upper === 'SPAM' || upper === 'JUNK') return AlertOctagon;
  if (upper === 'ARCHIVE' || upper === 'ARCHIVO') return Archive;
  if (upper === 'STARRED' || upper === 'FLAGGED' || upper === 'DESTACADOS') return Star;
  return Folder;
}

export default function EmailView() {
  const { t } = useTranslation();
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Envelope | null>(null);
  const [message, setMessage] = useState<unknown>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<EmailFolderRow[]>([]);
  const [composing, setComposing] = useState<null | { mode: 'new' | 'reply'; replyTo?: Envelope }>(null);
  const [error, setError] = useState<EmailErrorInfo | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);

  const refresh = useCallback(async (targetFolder?: string) => {
    const f = targetFolder ?? folder;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.listEnvelopes({ folder: f, projectId });
      if (res.success) setEnvelopes((res.envelopes as Envelope[]) || []);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setLoading(false);
    }
  }, [folder, projectId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await invokeWithTimeout(
          () => window.electron.email.listAccounts({ projectId }),
          30_000,
        );
        const ok = res.success && (res.accounts?.length ?? 0) > 0;
        setHasAccount(ok);
        if (!ok) return;
        refresh('INBOX');
        const f = await invokeWithTimeout(
          () => window.electron.email.listFolders({ projectId }),
          30_000,
        );
        if (f.success) {
          const parsed = parseFolders(f.folders);
          setFolders(parsed.length > 0 ? parsed : [{ name: 'INBOX' }]);
        } else {
          setFolders([{ name: 'INBOX' }]);
        }
      } catch (err) {
        setHasAccount(false);
        setError({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [refresh, projectId]);

  const folderOptions = useMemo(() => {
    const names = folders.map((f) => f.name);
    if (names.includes(folder)) return folders;
    return [{ name: folder }, ...folders];
  }, [folders, folder]);

  const currentFolder = folderOptions.find((f) => f.name === folder) ?? folderOptions[0];
  const CurrentFolderIcon = currentFolder ? folderIcon(currentFolder.name) : Folder;

  const changeFolder = (next: string) => {
    setFolder(next);
    setQuery('');
    setSelected(null);
    setMessage(null);
    setFolderMenuOpen(false);
    refresh(next);
  };

  const runSearch = async () => {
    if (!query.trim()) return refresh();
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.search({ query: query.trim(), folder, projectId });
      if (res.success) setEnvelopes((res.envelopes as Envelope[]) || []);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setLoading(false);
    }
  };

  const openMessage = async (env: Envelope) => {
    setSelected(env);
    setReadingId(env.id);
    setMessage(null);
    try {
      const res = await window.electron.email.read({ messageId: env.id, folder, projectId });
      if (res.success) setMessage(res.message);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setReadingId(null);
    }
  };

  if (hasAccount === null) {
    return (
      <div
        className="flex flex-1 items-center justify-center h-full min-h-[120px]"
        style={{ background: 'var(--dome-bg)' }}
      >
        <HubListState variant="loading" loadingLabel={t('common.loading')} compact />
      </div>
    );
  }

  if (hasAccount === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <Mail className="size-10" style={{ color: 'var(--dome-accent)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('email.empty.title')}
        </h2>
        <p className="text-sm max-w-md" style={{ color: 'var(--dome-text-muted)' }}>
          {t('email.empty.description')}
        </p>
        <button
          type="button"
          onClick={openSettingsTab}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)' }}
        >
          {t('email.empty.connect')}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`dome-email-view${selected ? ' dome-email-view--reader-active' : ''}`}
    >
      {/* Folder sidebar — visible only on wide layouts (>= 960px container width). */}
      <aside
        className="dome-email-view__sidebar"
        aria-label={t('email.folders.title')}
      >
        <div className="dome-email-view__sidebar-header">
          <span className="dome-email-view__sidebar-title">
            {t('email.folders.title')}
          </span>
        </div>
        <ul id="dome-email-folder-list" className="dome-email-view__folder-list list-none m-0 p-0">
          {folderOptions.map((f) => {
            const active = f.name === folder;
            const Icon = folderIcon(f.name);
            return (
              <li key={f.name}>
                <button
                  type="button"
                  onClick={() => changeFolder(f.name)}
                  className={`dome-email-view__folder-btn${active ? ' dome-email-view__folder-btn--active' : ''}`}
                  title={f.name}
                  aria-current={active ? 'true' : undefined}
                >
                  <Icon className="dome-email-view__folder-btn-icon" aria-hidden="true" />
                  <span className="dome-email-view__folder-btn-label">
                    {emailFolderLabel(f.name, t)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right column holds the top header (on narrow widths) and the list/reader panes. */}
      <div className="dome-email-view__main">
        {/* Top header — on wide layouts acts as the list-pane toolbar; on narrow
            layouts also carries the folder selector dropdown. */}
        <div className="dome-email-view__topbar">
          <FolderMenuButton
            currentFolder={currentFolder}
            CurrentFolderIcon={CurrentFolderIcon}
            folderOptions={folderOptions}
            folderIconFor={folderIcon}
            open={folderMenuOpen}
            onToggle={() => setFolderMenuOpen((v) => !v)}
            onSelect={changeFolder}
            onClose={() => setFolderMenuOpen(false)}
          />

          <label className="dome-email-view__search">
            <Search className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder={t('email.search_placeholder')}
              aria-label={t('email.search_placeholder')}
            />
          </label>

          <div className="dome-email-view__list-actions">
            <DomeButton
              iconOnly
              size="sm"
              variant="ghost"
              aria-label={t('email.refresh')}
              title={t('email.refresh')}
              onClick={() => refresh()}
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </DomeButton>
            <DomeButton
              iconOnly
              size="sm"
              variant="ghost"
              aria-label={t('email.compose')}
              title={t('email.compose')}
              onClick={() => setComposing({ mode: 'new' })}
            >
              <PenSquare className="size-4" style={{ color: 'var(--dome-accent)' }} />
            </DomeButton>
          </div>
        </div>

        <div className="dome-email-view__panes">
          {/* List pane */}
          <div className="dome-email-view__list" aria-label={t('email.tab_title')}>
            <div className="dome-email-view__list-body">
              {envelopes.length === 0 && !loading && (
                <div className="dome-email-view__empty">
                  <Inbox className="size-6" />
                  <span>{t('email.no_messages')}</span>
                </div>
              )}
              {envelopes.map((env) => {
                const active = selected?.id === env.id;
                const senderName = fromLabel(env.from) || t('email.unknown_sender');
                const initials = monogram(senderName);
                return (
                  <button
                    key={env.id}
                    type="button"
                    onClick={() => openMessage(env)}
                    className={`dome-email-view__envelope${active ? ' dome-email-view__envelope--active' : ''}`}
                  >
                    <span className="dome-email-view__envelope-avatar" aria-hidden="true">
                      {initials}
                    </span>
                    <span className="dome-email-view__envelope-content">
                      <span className="dome-email-view__envelope-sender">{senderName}</span>
                      <span className="dome-email-view__envelope-subject">
                        {env.subject || t('email.no_subject')}
                      </span>
                    </span>
                    <span className="dome-email-view__envelope-meta">
                      <span className="dome-email-view__envelope-date">{env.date || ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reader pane */}
          <ReaderPane
            selected={selected}
            reading={!!readingId}
            error={error}
            folder={folder}
            message={message}
            onReply={(env) => setComposing({ mode: 'reply', replyTo: env })}
            onBack={() => setSelected(null)}
          />
        </div>
      </div>

      {composing && (
        <Composer
          mode={composing.mode}
          replyTo={composing.replyTo}
          folder={folder}
          projectId={projectId}
          onClose={() => setComposing(null)}
          onSent={() => {
            setComposing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

interface FolderMenuButtonProps {
  currentFolder: EmailFolderRow | undefined;
  CurrentFolderIcon: typeof Folder;
  folderOptions: EmailFolderRow[];
  folderIconFor: (name: string) => typeof Folder;
  open: boolean;
  onToggle: () => void;
  onSelect: (name: string) => void;
  onClose: () => void;
}

function FolderMenuButton({
  currentFolder,
  CurrentFolderIcon,
  folderOptions,
  folderIconFor,
  open,
  onToggle,
  onSelect,
  onClose,
}: FolderMenuButtonProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const prevOpenRef = useRef(open);
  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (!open) {
      setMenuPos(null);
    } else {
      const el = triggerRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
      }
    }
  }

  // Reposition on scroll/resize while open (listeners stay mounted; openRef avoids prop-sync effect).
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const update = () => {
      if (!openRef.current) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, []);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t0 = e.target as Node | null;
      if (!t0) return;
      if (menuRef.current?.contains(t0)) return;
      if (triggerRef.current?.contains(t0)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Focus first item when opening.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[data-folder-menu-item]');
      first?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const label = currentFolder ? emailFolderLabel(currentFolder.name, t) : t('email.folders.title');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`dome-email-view__folder-trigger${open ? ' dome-email-view__folder-trigger--open' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('email.folders.openMenu', { defaultValue: t('email.folders.title') })}
        title={label}
      >
        <CurrentFolderIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="dome-email-view__folder-trigger-label">{label}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 dome-email-view__folder-trigger-caret${open ? ' dome-email-view__folder-trigger-caret--open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="dome-email-view__folder-menu"
              role="menu"
              aria-label={t('email.folders.title')}
              style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }}
            >
              {folderOptions.map((f) => {
                const active = f.name === currentFolder?.name;
                const Icon = folderIconFor(f.name);
                return (
                  <button
                    key={f.name}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    data-folder-menu-item
                    onClick={() => onSelect(f.name)}
                    className={`dome-email-view__folder-menu-item${active ? ' dome-email-view__folder-menu-item--active' : ''}`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="dome-email-view__folder-menu-item-label">
                      {emailFolderLabel(f.name, t)}
                    </span>
                    {active && (
                      <Check
                        className="size-3.5 shrink-0 dome-email-view__folder-menu-item-check"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

interface ReaderPaneProps {
  selected: Envelope | null;
  reading: boolean;
  error: EmailErrorInfo | null;
  folder: string;
  message: unknown;
  onReply: (env: Envelope) => void;
  onBack: () => void;
}

function ReaderPane({ selected, reading, error, folder, message, onReply, onBack }: ReaderPaneProps) {
  const { t, i18n } = useTranslation();
  const [recipientsOpen, setRecipientsOpen] = useState(false);

  if (!selected) {
    return (
      <div className="dome-email-view__reader" aria-label={t('email.select_message')}>
        <output className="dome-email-view__reader-empty-state">
          <Inbox className="dome-email-view__reader-empty-icon" aria-hidden="true" />
          <h3 className="dome-email-view__reader-empty-title">
            {t('email.reader.empty.title')}
          </h3>
          <p className="dome-email-view__reader-empty-subtitle">
            {t('email.reader.empty.subtitle')}
          </p>
        </output>
      </div>
    );
  }

  const senderName = fromName(selected.from);
  const senderEmail = fromEmail(selected.from);
  const displayName = senderName || senderEmail || t('email.unknown_sender');
  const dateStr = formatEmailDate(selected.date, i18n.language);
  const chips = flagChips(selected.flags, t);

  const soonTitle = t('email.reader.soon');

  return (
    <div className="dome-email-view__reader" aria-label={t('email.select_message')}>
      {error && (
        <div className="dome-email-view__reader-error">
          <EmailErrorNotice info={error} compact />
        </div>
      )}

      <div className="dome-email-view__reader-body">
        <header className="dome-email-view__reader-header">
          {/* Row 1 — subject + actions */}
          <div className="dome-email-view__reader-row dome-email-view__reader-row--top">
            <h2 className="dome-email-view__reader-subject">
              {selected.subject || t('email.no_subject')}
            </h2>
            <div className="dome-email-view__reader-actions" role="toolbar" aria-label={t('email.reader.actions.reply')}>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.reply')}
                title={t('email.reader.actions.reply')}
                onClick={() => onReply(selected)}
              >
                <Reply className="size-4" />
              </DomeButton>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.replyAll')}
                title={soonTitle}
                disabled
              >
                <ReplyAll className="size-4" />
              </DomeButton>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.forward')}
                title={soonTitle}
                disabled
              >
                <Forward className="size-4" />
              </DomeButton>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.archive')}
                title={soonTitle}
                disabled
              >
                <ArchiveIcon className="size-4" />
              </DomeButton>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.delete')}
                title={soonTitle}
                disabled
              >
                <Trash2 className="size-4" />
              </DomeButton>
              <DomeButton
                iconOnly
                size="sm"
                variant="ghost"
                aria-label={t('email.reader.actions.more')}
                title={soonTitle}
                disabled
              >
                <MoreHorizontal className="size-4" />
              </DomeButton>
            </div>
          </div>

          {/* Row 2 — sender avatar + name + meta + date + chips */}
          <div className="dome-email-view__reader-row dome-email-view__reader-row--sender">
            <div className="dome-email-view__reader-avatar" aria-hidden="true">
              {monogram(displayName)}
            </div>
            <div className="dome-email-view__reader-sender">
              <span className="dome-email-view__reader-sender-name">{displayName}</span>
              {senderEmail && senderEmail !== displayName && (
                <span className="dome-email-view__reader-sender-email">&lt;{senderEmail}&gt;</span>
              )}
              {chips.length > 0 && (
                <div className="dome-email-view__reader-chips" aria-label={t('email.reader.meta.flags')}>
                  {chips.map((c) => (
                    <span key={c.key} className="dome-email-view__reader-chip">
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <time
              className="dome-email-view__reader-date"
              dateTime={selected.date || undefined}
              title={selected.date || undefined}
            >
              {dateStr}
            </time>
          </div>

          {/* Row 3 — recipients collapse */}
          {senderEmail && (
            <div className="dome-email-view__reader-recipients">
              <button
                type="button"
                className="dome-email-view__reader-recipients-toggle"
                onClick={() => setRecipientsOpen((v) => !v)}
                aria-expanded={recipientsOpen}
                aria-controls="dome-email-reader-recipients-detail"
              >
                {recipientsOpen ? (
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="dome-email-view__reader-recipients-label">
                  {t('email.reader.meta.to')}:
                </span>
                <span className="dome-email-view__reader-recipients-address">
                  {senderEmail}
                </span>
              </button>
              {recipientsOpen && (
                <dl
                  id="dome-email-reader-recipients-detail"
                  className="dome-email-view__reader-recipients-detail"
                >
                  <div className="dome-email-view__reader-recipients-detail-row">
                    <dt>{t('email.reader.meta.messageId')}</dt>
                    <dd>{selected.id}</dd>
                  </div>
                  <div className="dome-email-view__reader-recipients-detail-row">
                    <dt>{t('email.reader.meta.folder')}</dt>
                    <dd>{folder}</dd>
                  </div>
                  {selected.date && (
                    <div className="dome-email-view__reader-recipients-detail-row">
                      <dt>ISO</dt>
                      <dd>{selected.date}</dd>
                    </div>
                  )}
                  {selected.flags && selected.flags.length > 0 && (
                    <div className="dome-email-view__reader-recipients-detail-row">
                      <dt>{t('email.reader.meta.flags')}</dt>
                      <dd>{selected.flags.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
        </header>

        {/* Back button — only visible on narrow layouts via container query */}
        <div className="dome-email-view__reader-back-row">
          <button
            type="button"
            className="dome-email-view__reader-back"
            onClick={() => onBack()}
            aria-label={t('common.back')}
            title={t('common.back')}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span>{t('common.back')}</span>
          </button>
        </div>

      {/* Body */}
        <div className="dome-email-view__reader-body-scroll">
          {reading ? (
            <output className="dome-email-view__reader-loading">
              <Loader2
                className="size-4 animate-spin"
                style={{ color: 'var(--dome-text-muted)' }}
                aria-hidden="true"
              />
              <span>{t('email.reader.loading')}</span>
            </output>
          ) : (
            <div className="dome-email-view__reader-body-content">
              <EmailBody message={message} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({
  mode,
  replyTo,
  folder,
  projectId,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  replyTo?: Envelope;
  folder: string;
  projectId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const [to, setTo] = useState(mode === 'reply' ? fromLabel(replyTo?.from) : '');
  const [subject, setSubject] = useState(mode === 'reply' ? `Re: ${replyTo?.subject || ''}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<EmailErrorInfo | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res =
        mode === 'reply' && replyTo
          ? await window.electron.email.reply({ messageId: replyTo.id, body, folder, projectId })
          : await window.electron.email.send({ to, subject, body, projectId });
      if (res.success) onSent();
      else setError({ error: res.error || t('email.compose_failed'), errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-[560px] max-w-full rounded-xl p-5 space-y-3"
        style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
            {mode === 'reply' ? t('email.reply') : t('email.compose')}
          </h3>
          <DomeButton iconOnly size="sm" variant="ghost" aria-label={t('common.cancel')} onClick={onClose}>
            <X className="size-4" />
          </DomeButton>
        </div>
        {mode === 'new' && (
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('email.to')}
            aria-label={t('email.to')}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        )}
        {mode === 'new' && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('email.subject')}
            aria-label={t('email.subject')}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('email.body')}
          aria-label={t('email.body')}
          rows={10}
          className="w-full rounded-md px-3 py-2 text-sm resize-none"
          style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        />
        <EmailErrorNotice info={error} compact />
        <div className="flex justify-end gap-2">
          <DomeButton variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton
            variant="primary"
            size="sm"
            leftIcon={
              sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />
            }
            disabled={sending || (mode === 'new' && !to)}
            loading={sending}
            onClick={send}
          >
            {t('email.send')}
          </DomeButton>
        </div>
      </div>
    </div>
  );
}
