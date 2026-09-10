import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ContactDraft,
  NoteSummary,
  ProjectSummary,
} from '../lib/protocol';
import * as api from '../lib/client';
import { extractContact, detectMediaKind } from '../lib/extractors';
import { getPageSnapshot, getSelectionText } from '../lib/page-content';
import {
  consumePendingSelection,
  subscribePendingSelection,
} from '../lib/pending-selection';
import { formatWebCitation } from '../lib/citation';
import { loadSession, saveSession, type SessionState } from '../lib/session';
import NotePane from './NotePane';
import type { MarkdownNoteEditorHandle } from '../../../../app/components/markdown/MarkdownNoteEditor';
import ManyAssistant, { type Task } from './ManyAssistant';
import { Icon } from './Icon';
import './panel.css';

const tasks: Task[] = ['capture', 'note', 'contact'];
type Notice = { kind: 'ok' | 'error'; text: string; link?: string };

export default function PanelApp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionState | null>(null);
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<Task>('capture');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [note, setNote] = useState<api.NoteDetail | null>(null);
  const [draftMd, setDraftMd] = useState('');
  const [title, setTitle] = useState('');
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<api.NoteDetail | null>(null);
  const [notices, setNotices] = useState<Partial<Record<Task, Notice>>>({});
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [dark, setDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const snapshot = useMemo(() => getPageSnapshot(), []);
  const [selection, setSelection] = useState(snapshot.selection);
  const detected = useMemo(() => extractContact(document, location.href), []);
  const [contact, setContact] = useState<ContactDraft>(
    () =>
      detected || {
        displayName: '',
        source: 'manual',
        externalId: crypto.randomUUID(),
        pageUrl: snapshot.url,
      },
  );
  const projectId = session?.projectId || '';
  const editorRef = useRef<MarkdownNoteEditorHandle>(null);
  const operation = useRef(false);
  const draftRef = useRef(draftMd);
  draftRef.current = draftMd;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const panelRef = useRef<HTMLDivElement>(null);

  const notify = useCallback(
    (task: Task, value?: Notice) =>
      setNotices((prev) => ({ ...prev, [task]: value })),
    [],
  );
  const persist = useCallback(async (next: SessionState) => {
    setSession(next);
    await saveSession(next);
  }, []);
  const replaceDraft = useCallback((markdown: string) => {
    setDraftMd(markdown);
    draftRef.current = markdown;
    setRevision((n) => n + 1);
  }, []);
  const applyNote = useCallback(
    (next: api.NoteDetail | null) => {
      setNote(next);
      setTitle(next?.title || snapshot.title.slice(0, 200));
      replaceDraft(next?.markdown || '');
      setDirty(false);
      setConflict(null);
    },
    [replaceDraft, snapshot.title],
  );

  const connect = useCallback(
    async (loaded: SessionState) => {
      if (!loaded.token) return;
      setConnectionError('');
      const result = await api.getContext(loaded.token);
      if (!result.success) {
        setConnected(false);
        setConnectionError(t('offline'));
        return;
      }
      setProjects(result.data.projects);
      const pid = result.data.projects.some((p) => p.id === loaded.projectId)
        ? loaded.projectId!
        : result.data.projectId;
      const listed = await api.listNotes(loaded.token, pid);
      if (!listed.success) {
        setConnected(false);
        setConnectionError(t('offline'));
        return;
      }
      setNotes(listed.data.notes);
      let noteId = loaded.noteId;
      if (noteId && !dirtyRef.current) {
        const current = await api.getNote(loaded.token, noteId);
        if (current.success && current.data.projectId === pid)
          applyNote(current.data);
        else {
          noteId = null;
          applyNote(null);
        }
      }
      setConnected(true);
      await persist({ ...loaded, projectId: pid, noteId });
    },
    [applyNote, persist, t],
  );

  useEffect(() => {
    loadSession()
      .then(async (loaded) => {
        setSession(loaded);
        setTitle(snapshot.title.slice(0, 200));
        await connect(loaded);
      })
      .catch(() => setConnectionError(t('offline')));
    browser.storage.local
      .get('dome.appearance')
      .then((stored) => {
        if (
          stored['dome.appearance'] === 'dark' ||
          stored['dome.appearance'] === 'light'
        )
          setDark(stored['dome.appearance'] === 'dark');
      })
      .catch(() => undefined);
  }, [connect, snapshot.title, t]);

  useEffect(() => {
    const update = () => {
      const text = getSelectionText();
      if (
        text &&
        !panelRef.current?.contains(document.getSelection()?.anchorNode || null)
      )
        setSelection(text);
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const appendText = useCallback(
    (text: string) => {
      replaceDraft(
        `${editorRef.current?.getMarkdown() ?? draftRef.current}${text}`,
      );
      setDirty(true);
    },
    [replaceDraft],
  );
  useEffect(
    () =>
      subscribePendingSelection((text) => {
        consumePendingSelection();
        setSelection(text);
        setTab('note');
        appendText(
          formatWebCitation({ text, title: snapshot.title, url: snapshot.url }),
        );
        notify('note', { kind: 'ok', text: t('selectionAdded') });
      }),
    [appendText, notify, snapshot.title, snapshot.url, t],
  );

  // Keep the panel mounted when closed, so in-progress drafts and streams survive toggling.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const perform = async (task: Task, work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    notify(task);
    try {
      await work();
    } catch {
      notify(task, { kind: 'error', text: t('error') });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const saveNote = (copy = false) =>
    perform('note', async () => {
      if (!session?.token) return;
      const markdown = editorRef.current?.getMarkdown() ?? draftRef.current;
      const result =
        note && !copy
          ? await api.updateNote(session.token, note.id, {
              markdown,
              title: title.trim(),
              expectedUpdatedAt: note.updatedAt,
              expectedRevision: note.revision,
            })
          : await api.createNote(session.token, {
              projectId,
              title:
                `${title.trim()}${copy ? ` (${t('copySuffix')})` : ''}`.slice(
                  0,
                  200,
                ),
              markdown,
            });
      if (!result.success) {
        if (result.conflict && result.note) setConflict(result.note);
        else notify('note', { kind: 'error', text: t('error') });
        return;
      }
      applyNote(result.data);
      await persist({ ...session, noteId: result.data.id });
      setNotes((items) => [
        {
          id: result.data.id,
          title: result.data.title,
          updatedAt: result.data.updatedAt,
        },
        ...items.filter((item) => item.id !== result.data.id),
      ]);
      notify('note', {
        kind: 'ok',
        text: t('noteSaved'),
        link: `dome://resource/${result.data.id}/note`,
      });
    });

  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  shortcutRef.current = (event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === 's' &&
      tab === 'note' &&
      connected
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!conflict && title.trim()) saveNote();
    }
  };
  useEffect(() => {
    const panel = panelRef.current;
    const handle = (event: KeyboardEvent) => shortcutRef.current(event);
    panel?.addEventListener('keydown', handle);
    return () => panel?.removeEventListener('keydown', handle);
  }, []);

  const changeProject = (id: string) =>
    perform(tab, async () => {
      if (!session?.token || dirty) return;
      const result = await api.listNotes(session.token, id);
      if (!result.success) {
        notify(tab, { kind: 'error', text: t('error') });
        return;
      }
      setNotes(result.data.notes);
      applyNote(null);
      setNotices({});
      await persist({ ...session, projectId: id, noteId: null });
    });
  const selectNote = (id: string) =>
    perform('note', async () => {
      if (!session?.token || dirty) return;
      if (!id) {
        applyNote(null);
        await persist({ ...session, noteId: null });
        return;
      }
      const result = await api.getNote(session.token, id);
      if (result.success) {
        applyNote(result.data);
        await persist({ ...session, noteId: id });
      } else notify('note', { kind: 'error', text: t('error') });
    });
  const pairing = async () => {
    if (!session || busy) return;
    setBusy(true);
    setConnectionError('');
    try {
      const result = await api.pair(code.trim(), session.clientName);
      if (result.success) {
        const next = { ...session, token: result.data.token };
        await persist(next);
        await connect(next);
      } else
        setConnectionError(
          t(
            /code|expired|pairing/i.test(result.error)
              ? 'invalidCode'
              : 'offline',
          ),
        );
    } catch {
      setConnectionError(t('offline'));
    } finally {
      setBusy(false);
    }
  };

  const renderNotice = (task: Task) => {
    const value = notices[task];
    return (
      value && (
        <div
          className={`status ${value.kind}`}
          role={value.kind === 'error' ? 'alert' : 'status'}
        >
          {value.kind === 'ok' && <Icon name="check" />}
          <span>
            {value.text}
            {value.link && <a href={value.link}>{t('openDome')} ↗</a>}
          </span>
        </div>
      )
    );
  };
  const manyContext = (task: Task) => {
    if (task === 'contact')
      return [contact.displayName, contact.displayLabel, contact.notes]
        .filter(Boolean)
        .join('\n');
    if (task === 'note')
      return [
        editorRef.current?.getMarkdown() ?? draftMd,
        selection || snapshot.readableText,
      ]
        .filter(Boolean)
        .join('\n\n');
    return selection || snapshot.readableText;
  };
  const many = (task: Task) =>
    session?.token && (
      <ManyAssistant
        key={`${task}:${projectId}:${task === 'note' ? note?.id || 'new' : ''}`}
        task={task}
        token={session.token}
        getContext={() => manyContext(task)}
        title={snapshot.title}
        url={snapshot.url}
        disabled={busy || !connected}
        onApply={(output) => {
          if (task === 'contact') {
            const notes = `${contact.notes || ''}\n\n${output}`.trim();
            if (notes.length > 4000) {
              notify('contact', { kind: 'error', text: t('contactTooLong') });
              return false;
            }
            setContact((previous) => ({ ...previous, notes }));
          } else {
            appendText(`\n\n${output}\n`);
            setTab('note');
          }
          notify(task === 'contact' ? 'contact' : 'note', {
            kind: 'ok',
            text: t('applied'),
          });
          return true;
        }}
      />
    );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      className={`dome-panel${dark ? ' dark' : ''}`}
      aria-label="Dome"
    >
      <header className="panel-header">
        <div className="brand">
          <span className="dome-mark" aria-hidden="true">
            D
          </span>
          <strong>Dome</strong>
          <span className="browser-label">/ Browser</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={t('appearance')}
            onClick={() => {
              setDark(!dark);
              browser.storage.local
                .set({ 'dome.appearance': dark ? 'light' : 'dark' })
                .catch(() => undefined);
            }}
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('close')}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      {!session ? (
        <div className="panel-content" role="status">
          {t('connecting')}
        </div>
      ) : !session.token ? (
        <div className="panel-content pairing">
          <div className="pair-illustration">
            <Icon name="link" />
          </div>
          <h1>{t('pairTitle')}</h1>
          <p>{t('pairHelp')}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              pairing();
            }}
          >
            <label className="field">
              {t('pairCode')}
              <input
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                placeholder="ABCD2345"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/\s/g, ''))
                }
              />
            </label>
            <button
              type="submit"
              className="primary full-width"
              disabled={busy || code.trim().length < 6}
            >
              {t(busy ? 'working' : 'pair')}
              <Icon name="arrow" />
            </button>
          </form>
          {connectionError && (
            <p role="alert" className="status error">
              {connectionError}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="workspace-row">
            <label htmlFor="dome-project">{t('workspace')}</label>
            <select
              id="dome-project"
              value={projectId}
              disabled={busy || dirty || !connected}
              onChange={(event) => changeProject(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          {connectionError && (
            <div className="connection-error" role="alert">
              <p>{connectionError}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => perform(tab, () => connect(session))}
              >
                {t('retry')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConnectionError('');
                  setConnected(false);
                  persist({ ...session, token: null }).catch(() =>
                    setConnectionError(t('error')),
                  );
                }}
              >
                {t('newCode')}
              </button>
            </div>
          )}
          <nav className="tabs" aria-label="Dome">
            <div role="tablist">
              {tasks.map((task) => (
                <button
                  key={task}
                  id={`dome-tab-${task}`}
                  type="button"
                  role="tab"
                  tabIndex={tab === task ? 0 : -1}
                  aria-controls={`dome-pane-${task}`}
                  aria-selected={tab === task}
                  onClick={() => setTab(task)}
                  onKeyDown={(event) => {
                    const index = tasks.indexOf(task);
                    const next =
                      event.key === 'ArrowRight'
                        ? tasks[(index + 1) % tasks.length]
                        : event.key === 'ArrowLeft'
                          ? tasks[(index + tasks.length - 1) % tasks.length]
                          : event.key === 'Home'
                            ? tasks[0]
                            : event.key === 'End'
                              ? tasks[2]
                              : null;
                    if (next) {
                      event.preventDefault();
                      setTab(next);
                      (
                        event.currentTarget.parentElement?.querySelector(
                          `#dome-tab-${next}`,
                        ) as HTMLElement
                      )?.focus();
                    }
                  }}
                >
                  <Icon name={task} />
                  {t(task)}
                </button>
              ))}
            </div>
          </nav>
          <div className="panel-scroll">
            <section
              id="dome-pane-capture"
              role="tabpanel"
              aria-labelledby="dome-tab-capture"
              hidden={tab !== 'capture'}
              className="panel-content"
            >
              <p className="eyebrow">{t('page')}</p>
              <article className="page-preview">
                <span className="source-domain">
                  <Icon name="link" />
                  {new URL(snapshot.url).hostname.replace(/^www\./, '')}
                </span>
                <h1>{snapshot.title}</h1>
                <p className="page-excerpt">
                  {snapshot.readableText.slice(0, 200)}
                </p>
                <a
                  className="source-url"
                  href={snapshot.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {snapshot.url}
                </a>
              </article>
              <p className="helper">{t('captureHint')}</p>
              <button
                type="button"
                className="primary full-width"
                disabled={busy || !connected || !projectId}
                onClick={() =>
                  perform('capture', async () => {
                    const result = await api.captureUrl(session.token!, {
                      projectId,
                      url: snapshot.url,
                      title: snapshot.title.slice(0, 300),
                      readableText: snapshot.readableText,
                      mediaKind: detectMediaKind(snapshot.url),
                    });
                    notify(
                      'capture',
                      result.success
                        ? {
                            kind: 'ok',
                            text: t(
                              result.data.reused ? 'existingPage' : 'savedPage',
                            ),
                            link: result.data.domeLink,
                          }
                        : { kind: 'error', text: t('error') },
                    );
                  })
                }
              >
                <Icon name="capture" />
                {t(busy ? 'working' : 'savePage')}
              </button>
              {renderNotice('capture')}
              {many('capture')}
            </section>
            <section
              id="dome-pane-note"
              role="tabpanel"
              aria-labelledby="dome-tab-note"
              hidden={tab !== 'note'}
              className="panel-content"
            >
              <NotePane
                editorRef={editorRef}
                onEdit={() => {
                  dirtyRef.current = true;
                  setDirty(true);
                }}
                notes={notes}
                note={note}
                markdown={draftMd}
                title={title}
                revision={revision}
                dirty={dirty}
                busy={busy || !connected}
                selection={selection}
                conflict={conflict}
                onSelect={selectNote}
                onChange={(markdown) => {
                  draftRef.current = markdown;
                  setDraftMd(markdown);
                  setDirty(
                    markdown !== (note?.markdown || '') ||
                      title !== (note?.title || snapshot.title.slice(0, 200)),
                  );
                }}
                onTitle={(value) => {
                  setTitle(value);
                  setDirty(true);
                }}
                onSave={saveNote}
                onRemote={() => {
                  if (conflict) {
                    applyNote(conflict);
                    notify('note');
                  }
                }}
                onQuote={() => {
                  appendText(
                    formatWebCitation({
                      text: selectionRef.current,
                      title: snapshot.title,
                      url: snapshot.url,
                    }),
                  );
                  notify('note', { kind: 'ok', text: t('selectionAdded') });
                }}
              />
              {renderNotice('note')}
              {many('note')}
            </section>
            <section
              id="dome-pane-contact"
              role="tabpanel"
              aria-labelledby="dome-tab-contact"
              hidden={tab !== 'contact'}
              className="panel-content"
            >
              <div className="contact-heading">
                <span className="contact-avatar">
                  {contact.displayName.trim().slice(0, 1).toUpperCase() || (
                    <Icon name="contact" />
                  )}
                </span>
                <div>
                  <strong>{t(detected ? 'detected' : 'manual')}</strong>
                  <p>
                    {detected?.displayLabel || new URL(snapshot.url).hostname}
                  </p>
                </div>
              </div>
              <p className="helper">
                {t(detected ? 'contactHint' : 'noContact')}
              </p>
              <form
                className="contact-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  perform('contact', async () => {
                    const result = await api.saveContact(session.token!, {
                      ...contact,
                      displayName: contact.displayName.trim(),
                      primaryEmail: contact.primaryEmail?.trim() || undefined,
                      projectId,
                    });
                    notify(
                      'contact',
                      result.success
                        ? { kind: 'ok', text: t('contactSaved') }
                        : { kind: 'error', text: t('error') },
                    );
                  });
                }}
              >
                <label className="field">
                  {t('name')}
                  <input
                    required
                    maxLength={200}
                    value={contact.displayName}
                    disabled={busy}
                    onChange={(event) =>
                      setContact({
                        ...contact,
                        displayName: event.target.value,
                      })
                    }
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  {t('headline')}
                  <input
                    maxLength={200}
                    value={contact.displayLabel || ''}
                    disabled={busy}
                    onChange={(event) =>
                      setContact({
                        ...contact,
                        displayLabel: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  {t('email')}
                  <input
                    type="email"
                    value={contact.primaryEmail || ''}
                    disabled={busy}
                    onChange={(event) =>
                      setContact({
                        ...contact,
                        primaryEmail: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  {t('contactNotes')}
                  <textarea
                    maxLength={4000}
                    rows={3}
                    value={contact.notes || ''}
                    disabled={busy}
                    onChange={(event) =>
                      setContact({ ...contact, notes: event.target.value })
                    }
                  />
                </label>
                <button
                  type="submit"
                  className="primary full-width"
                  disabled={
                    busy ||
                    !connected ||
                    !projectId ||
                    !contact.displayName.trim()
                  }
                >
                  <Icon name="contact" />
                  {t(busy ? 'working' : 'saveContact')}
                </button>
              </form>
              {renderNotice('contact')}
              {many('contact')}
            </section>
          </div>
          <footer className="panel-footer">
            <span
              className={
                connected ? 'connection-dot connected' : 'connection-dot'
              }
            />
            <span>{t(connected ? 'connected' : 'connecting')}</span>
            <span className="footer-name">Dome Desktop</span>
          </footer>
        </>
      )}
    </div>
  );
}
