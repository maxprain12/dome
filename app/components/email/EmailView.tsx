import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, RefreshCw, Search, PenSquare, Send, Reply, Loader2, Inbox } from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';
import EmailErrorNotice, { type EmailErrorInfo } from '@/components/email/EmailErrorNotice';
import EmailBody from '@/components/email/EmailBody';
import HubListState from '@/components/ui/HubListState';
import { emailFolderLabel, type EmailFolderRow } from '@/lib/email/folder-label';
import { invokeWithTimeout } from '@/lib/utils/ipcTimeout';

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

function parseFolders(raw: unknown): EmailFolderRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x): EmailFolderRow | null => {
      if (typeof x === 'string') return { name: x };
      if (x && typeof x === 'object' && typeof (x as { name?: string }).name === 'string') {
        const row = x as { name: string; desc?: string };
        return { name: row.name, desc: row.desc };
      }
      return null;
    })
    .filter((x): x is EmailFolderRow => Boolean(x?.name));
}

export default function EmailView() {
  const { t } = useTranslation();
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);

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

  const refresh = useCallback(async (targetFolder?: string) => {
    const f = targetFolder ?? folder;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.listEnvelopes({ folder: f });
      if (res.success) setEnvelopes((res.envelopes as Envelope[]) || []);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    (async () => {
      try {
        const res = await invokeWithTimeout(
          () => window.electron.email.listAccounts(),
          30_000,
        );
        const ok = res.success && (res.accounts?.length ?? 0) > 0;
        setHasAccount(ok);
        if (!ok) return;
        refresh('INBOX');
        const f = await invokeWithTimeout(
          () => window.electron.email.listFolders(),
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
  }, [refresh]);

  const folderOptions = useMemo(() => {
    const names = folders.map((f) => f.name);
    if (names.includes(folder)) return folders;
    return [{ name: folder }, ...folders];
  }, [folders, folder]);

  const changeFolder = (next: string) => {
    setFolder(next);
    setQuery('');
    setSelected(null);
    setMessage(null);
    refresh(next);
  };

  const runSearch = async () => {
    if (!query.trim()) return refresh();
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.email.search({ query: query.trim(), folder });
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
      const res = await window.electron.email.read({ messageId: env.id, folder });
      if (res.success) setMessage(res.message);
      else setError({ error: res.error, errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setReadingId(null);
    }
  };

  if (hasAccount === null) {
    return (
      <div className="flex flex-1 items-center justify-center h-full min-h-[120px]" style={{ background: 'var(--dome-bg)' }}>
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
    <div className="flex h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Folder sidebar */}
      <aside
        className="flex flex-col w-[200px] shrink-0 border-r overflow-y-auto py-2"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg-secondary)' }}
      >
        <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
          {t('email.folders.title')}
        </p>
        {folderOptions.map((f) => {
          const active = f.name === folder;
          return (
            <button
              key={f.name}
              type="button"
              onClick={() => changeFolder(f.name)}
              className="mx-1.5 px-2.5 py-2 rounded-md text-left text-sm truncate"
              style={{
                color: active ? 'var(--dome-accent)' : 'var(--dome-text)',
                background: active ? 'var(--dome-bg-hover)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}
              title={f.name}
            >
              {emailFolderLabel(f.name, t)}
            </button>
          );
        })}
      </aside>

      {/* List pane */}
      <div className="flex flex-col w-[320px] shrink-0 border-r" style={{ borderColor: 'var(--dome-border)' }}>
        <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <div className="flex items-center gap-1.5 flex-1 rounded-md px-2 py-1.5" style={{ background: 'var(--dome-bg-secondary)' }}>
            <Search className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder={t('email.search_placeholder')}
              className="bg-transparent text-sm flex-1 outline-none"
              style={{ color: 'var(--dome-text)' }}
            />
          </div>
          <button type="button" onClick={() => refresh()} className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]" title={t('email.refresh')}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--dome-text-muted)' }} />
          </button>
          <button
            type="button"
            onClick={() => setComposing({ mode: 'new' })}
            className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
            title={t('email.compose')}
          >
            <PenSquare className="size-4" style={{ color: 'var(--dome-accent)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {envelopes.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 p-8 text-center" style={{ color: 'var(--dome-text-muted)' }}>
              <Inbox className="size-6" />
              <span className="text-sm">{t('email.no_messages')}</span>
            </div>
          )}
          {envelopes.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => openMessage(env)}
              className="w-full text-left px-3 py-2.5 border-b hover:bg-[var(--dome-bg-hover)]"
              style={{
                borderColor: 'var(--dome-border)',
                background: selected?.id === env.id ? 'var(--dome-bg-secondary)' : 'transparent',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                  {fromLabel(env.from) || t('email.unknown_sender')}
                </span>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--dome-text-muted)' }}>
                  {env.date || ''}
                </span>
              </div>
              <div className="text-sm truncate" style={{ color: 'var(--dome-text-secondary, var(--dome-text-muted))' }}>
                {env.subject || t('email.no_subject')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Reader pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        {error && (
          <div className="px-4 py-2">
            <EmailErrorNotice info={error} compact />
          </div>
        )}
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('email.select_message')}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
                  {selected.subject || t('email.no_subject')}
                </h2>
                <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                  {fromLabel(selected.from)} · {selected.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposing({ mode: 'reply', replyTo: selected })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Reply className="size-3.5" /> {t('email.reply')}
              </button>
            </div>
            {readingId ? (
              <Loader2 className="size-5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
            ) : (
              <EmailBody message={message} />
            )}
          </div>
        )}
      </div>

      {composing && (
        <Composer
          mode={composing.mode}
          replyTo={composing.replyTo}
          folder={folder}
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

function Composer({
  mode,
  replyTo,
  folder,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  replyTo?: Envelope;
  folder: string;
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
          ? await window.electron.email.reply({ messageId: replyTo.id, body, folder })
          : await window.electron.email.send({ to, subject, body });
      if (res.success) onSent();
      else setError({ error: res.error || t('email.compose_failed'), errorCode: res.errorCode, helpUrl: res.helpUrl });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-[560px] max-w-[92vw] rounded-xl p-5 space-y-3"
        style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
      >
        <h3 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
          {mode === 'reply' ? t('email.reply') : t('email.compose')}
        </h3>
        {mode === 'new' && (
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('email.to')}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        )}
        {mode === 'new' && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('email.subject')}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('email.body')}
          rows={10}
          className="w-full rounded-md px-3 py-2 text-sm resize-none"
          style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        />
        <EmailErrorNotice info={error} compact />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || (mode === 'new' && !to)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', opacity: sending ? 0.6 : 1 }}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t('email.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
