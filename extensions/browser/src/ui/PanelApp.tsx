import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ContactDraft,
  NoteSummary,
  ProjectSummary,
} from '../lib/protocol';
import * as api from '../lib/client';
import { detectMediaKind } from '../lib/extractors';
import type { PageContext } from '../lib/browser-context';
import { Button } from '../../../../app/components/ui/button';
import { DropdownMenuItem } from '../../../../app/components/ui/dropdown-menu';
import { Input } from '../../../../app/components/ui/input';
import { Textarea } from '../../../../app/components/ui/textarea';
import ManyHeader, {
  type ManyPanelViewId,
} from '../../../../app/components/many/panel/ManyHeader';
import manyMark from '../../../../public/many.png?inline';
import { formatWebCitation } from '../lib/citation';
import { loadSession, saveSession, type SessionState } from '../lib/session';
import NotePane from './NotePane';
import type { MarkdownNoteEditorHandle } from '../../../../app/components/markdown/MarkdownNoteEditor';
import ManyAssistant, {
  type ManyAssistantHandle,
  type ManyAssistantHeaderState,
  type Task,
} from './ManyAssistant';
import { Icon } from './Icon';
import './panel.css';

type SecondaryTask = Exclude<Task, 'agent'>;
const secondaryTasks: SecondaryTask[] = ['capture', 'note', 'contact'];
type Notice = { kind: 'ok' | 'error'; text: string; link?: string };

export default function PanelApp({
  onClose,
  snapshot,
  browserTools,
}: {
  onClose: () => void;
  snapshot: PageContext;
  browserTools: ReactNode;
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionState | null>(null);
  const [code, setCode] = useState('');
  const [view, setView] = useState<ManyPanelViewId>(
    () =>
      (localStorage.getItem('dome.manyView') as ManyPanelViewId | null) ||
      'chat',
  );
  const [task, setTask] = useState<SecondaryTask | null>(null);
  const [taskPaneOpen, setTaskPaneOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem('dome.manyView', view);
  }, [view]);
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
  const initialTitle = useRef(snapshot.title);
  if (!initialTitle.current && snapshot.title)
    initialTitle.current = snapshot.title;
  const contextUrl = useRef(snapshot.url);
  const [selection, setSelection] = useState(snapshot.selection);
  const detected = snapshot.contact;
  const [contact, setContact] = useState<ContactDraft>(
    () =>
      detected || {
        displayName: '',
        source: 'manual',
        externalId: crypto.randomUUID(),
        pageUrl: snapshot.url,
      },
  );
  useEffect(() => {
    setSelection(snapshot.selection);
    if (contextUrl.current !== snapshot.url || !contact.displayName) {
      contextUrl.current = snapshot.url;
      const saved = localStorage.getItem(`dome.contactDraft:${snapshot.url}`);
      try {
        setContact(
          saved
            ? JSON.parse(saved)
            : snapshot.contact || {
                displayName: '',
                source: 'manual',
                externalId: crypto.randomUUID(),
                pageUrl: snapshot.url,
              },
        );
      } catch {
        setContact(
          snapshot.contact || {
            displayName: '',
            source: 'manual',
            externalId: crypto.randomUUID(),
            pageUrl: snapshot.url,
          },
        );
      }
    }
  }, [snapshot]);
  useEffect(() => {
    if (contact.pageUrl && contact.displayName)
      localStorage.setItem(
        `dome.contactDraft:${contact.pageUrl}`,
        JSON.stringify(contact),
      );
  }, [contact]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
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
  const manyRef = useRef<ManyAssistantHandle>(null);
  const [manyHeaderState, setManyHeaderState] =
    useState<ManyAssistantHeaderState>({
      status: 'idle',
      canClear: false,
      interactionLocked: false,
    });
  useEffect(() => {
    const header = panelRef.current?.querySelector('header');
    const newChatLabel = t('many.newChat');
    header?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.getAttribute('aria-label') === newChatLabel) {
        button.disabled = manyHeaderState.interactionLocked;
      }
    });
    header?.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab) => {
      tab.disabled = manyHeaderState.interactionLocked;
    });
  }, [manyHeaderState.interactionLocked, t]);
  const activeTask: Task = task ?? 'agent';

  const notify = useCallback(
    (task: Task, value?: Notice) =>
      setNotices((prev) => ({ ...prev, [task]: value })),
    [],
  );
  const openManyChat = useCallback(() => {
    setTask(null);
    setTaskPaneOpen(false);
    setView('chat');
  }, []);
  const closeTaskPane = useCallback(() => {
    setTaskPaneOpen(false);
    setView('chat');
  }, []);
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
      setTitle(next?.title || initialTitle.current.slice(0, 200));
      replaceDraft(next?.markdown || '');
      setDirty(false);
      setConflict(null);
    },
    [replaceDraft],
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
        setTitle(initialTitle.current.slice(0, 200));
        await connect(loaded);
        const raw = localStorage.getItem('dome.noteDraft');
        if (raw) {
          try {
            const saved = JSON.parse(raw);
            if (
              saved.projectId === loaded.projectId &&
              saved.noteId === loaded.noteId
            ) {
              replaceDraft(saved.markdown);
              setTitle(saved.title);
              setNote(saved.note);
              setDirty(true);
            }
          } catch {
            /* Ignore an invalid local draft. */
          }
        }
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
  }, [connect, t]);

  const appendText = useCallback(
    (text: string) => {
      replaceDraft(
        `${editorRef.current?.getMarkdown() ?? draftRef.current}${text}`,
      );
      setDirty(true);
    },
    [replaceDraft],
  );
  const savedDraftRef = useRef<() => void>(() => undefined);
  savedDraftRef.current = () => {
    if (dirtyRef.current)
      localStorage.setItem(
        'dome.noteDraft',
        JSON.stringify({
          projectId,
          noteId: session?.noteId,
          note,
          title,
          markdown: editorRef.current?.getMarkdown() ?? draftRef.current,
        }),
      );
  };
  useEffect(() => {
    savedDraftRef.current();
  }, [draftMd, title, dirty]);
  useEffect(() => {
    const changed = (changes: Record<string, { newValue?: unknown }>) => {
      const quote = changes['dome.pendingQuote']?.newValue as
        | { text: string; url: string; title: string }
        | undefined;
      if (!quote) return;
      setView('chat');
      setTask('note');
      setTaskPaneOpen(true);
      appendText(formatWebCitation(quote));
      browser.storage.local.remove('dome.pendingQuote');
    };
    browser.storage.onChanged.addListener(changed);
    browser.storage.local.get('dome.pendingQuote').then((value) =>
      changed({
        'dome.pendingQuote': { newValue: value['dome.pendingQuote'] },
      }),
    );
    return () => browser.storage.onChanged.removeListener(changed);
  }, [appendText]);

  // Persist the current editor document when the native sidebar is destroyed.

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      savedDraftRef.current();
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
      localStorage.removeItem('dome.noteDraft');
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
      task === 'note' &&
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
    perform(activeTask, async () => {
      if (!session?.token || dirty) return;
      const result = await api.listNotes(session.token, id);
      if (!result.success) {
        notify(activeTask, { kind: 'error', text: t('error') });
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
        localStorage.removeItem('dome.noteDraft');
        localStorage.removeItem('dome.noteDraft');
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
      return [
        contact.displayName,
        contact.displayLabel,
        contact.notes,
        JSON.stringify(contact.profile || {}),
      ]
        .filter(Boolean)
        .join('\n');
    if (task === 'note')
      return [
        editorRef.current?.getMarkdown() ?? draftMd,
        selection || snapshot.readableText,
      ]
        .filter(Boolean)
        .join('\n\n');
    return (
      selection ||
      snapshot.readableText ||
      'No accessible web page. Ask the user to open a website if needed.'
    );
  };
  const many =
    session?.token && (
      <ManyAssistant
        ref={manyRef}
        view={view}
        task={activeTask}
        projectId={projectId}
        tabId={snapshot.tabId}
        token={session.token}
        getContext={() =>
          [
            manyContext(activeTask),
            `Page sections: ${JSON.stringify(snapshot.headings)}`,
          ].join('\n\n')
        }
        page={snapshot}
        browserTools={browserTools}
        disabled={busy || !connected}
        onOpenChat={openManyChat}
        onHeaderStateChange={setManyHeaderState}
        onApply={
          task
            ? (output) => {
                if (activeTask === 'contact') {
                  const notes = `${contact.notes || ''}\n\n${output}`.trim();
                  if (notes.length > 4000) {
                    notify('contact', {
                      kind: 'error',
                      text: t('contactTooLong'),
                    });
                    return false;
                  }
                  setContact((previous) => ({ ...previous, notes }));
                  setTaskPaneOpen(true);
                } else {
                  appendText(`\n\n${output}\n`);
                  setView('chat');
                  setTask('note');
                  setTaskPaneOpen(true);
                }
                notify(activeTask === 'contact' ? 'contact' : 'note', {
                  kind: 'ok',
                  text: t('applied'),
                });
                return true;
              }
            : undefined
        }
      />
    );

  return (
    <div
      ref={panelRef}
      className={`dome-panel${dark ? ' dark' : ''}${taskPaneOpen ? ' task-view' : ''}${!taskPaneOpen && view === 'chat' ? ' agent-view' : ''}`}
      aria-label="Dome"
    >
      {!session?.token ? (
        <header className="panel-header">
          <div className="brand">
            <img src={manyMark} alt="" width="28" height="28" />
            <strong>Dome</strong>
            <span className="browser-label">/ Browser</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('close')}
            onClick={onClose}
          >
            <Icon name="close" />
          </Button>
        </header>
      ) : null}
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
              <Input
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
            <Button
              type="submit"
              className="full-width"
              disabled={busy || code.trim().length < 6}
            >
              {t(busy ? 'working' : 'pair')}
              <Icon name="arrow" />
            </Button>
          </form>
          {connectionError && (
            <p role="alert" className="status error">
              {connectionError}
            </p>
          )}
        </div>
      ) : (
        <>
          <ManyHeader
            status={manyHeaderState.status}
            sessionTitle={manyHeaderState.sessionTitle}
            contextDescription={snapshot.title}
            view={view}
            onViewChange={(next) => {
              if (manyHeaderState.interactionLocked) return;
              setTask(null);
              setTaskPaneOpen(false);
              setView(next);
            }}
            showViewSwitcher
            onStartNewChat={() => {
              if (!manyHeaderState.interactionLocked) {
                manyRef.current?.startNewChat();
              }
            }}
            onClear={() => {
              if (!manyHeaderState.interactionLocked) {
                manyRef.current?.clearChat();
              }
            }}
            canClear={
              manyHeaderState.canClear &&
              !manyHeaderState.interactionLocked
            }
            onClose={onClose}
            showClose
            showFullscreenToggle={false}
            showPopoutToggle={false}
            manyImageSrc={manyMark}
            viewLabels={{
              chat: t('chat'),
              history: t('history'),
              context: t('context'),
            }}
            viewPresentation="icons"
            secondaryActions={
              <>
                {secondaryTasks.map((secondaryTask) => (
                  <Button
                    key={secondaryTask}
                    id={`dome-action-${secondaryTask}`}
                    type="button"
                    variant={task === secondaryTask ? 'secondary' : 'ghost'}
                    size="sm"
                    className="min-w-0 flex-1"
                    aria-pressed={task === secondaryTask}
                    disabled={manyHeaderState.interactionLocked}
                    onClick={() => {
                      if (taskPaneOpen && task === secondaryTask) {
                        closeTaskPane();
                        return;
                      }
                      setView('chat');
                      setTask(secondaryTask);
                      setTaskPaneOpen(true);
                    }}
                  >
                    <Icon name={secondaryTask} />
                    {t(secondaryTask)}
                  </Button>
                ))}
              </>
            }
            overflowActions={
              <>
                <DropdownMenuItem
                    disabled={manyHeaderState.interactionLocked}
                  onClick={() => {
                    setDark(!dark);
                    browser.storage.local
                      .set({ 'dome.appearance': dark ? 'light' : 'dark' })
                      .catch(() => undefined);
                  }}
                >
                  <Icon name={dark ? 'sun' : 'moon'} />
                  {t('appearance')}
                </DropdownMenuItem>
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    disabled={
                      manyHeaderState.interactionLocked ||
                      busy ||
                      dirty ||
                      !connected ||
                      project.id === projectId
                    }
                    onClick={() => {
                      changeProject(project.id).catch(() =>
                        setConnectionError(t('error')),
                      );
                    }}
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </>
            }
          />
          {connectionError && (
            <div className="connection-error" role="alert">
              <p>{connectionError}</p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => perform(activeTask, () => connect(session))}
              >
                {t('retry')}
              </Button>
              <Button
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
              </Button>
            </div>
          )}
          <div className="task-toolbar" hidden={!taskPaneOpen}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={manyHeaderState.interactionLocked}
              onClick={closeTaskPane}
            >
              <Icon name="back" />
              {t('backToMany')}
            </Button>
            <span>{task ? t(task) : ''}</span>
          </div>
          <div className="panel-scroll" hidden={!taskPaneOpen}>
            <section
              id="dome-pane-capture"
              role="tabpanel"
              aria-labelledby="dome-action-capture"
              hidden={task !== 'capture'}
              className="panel-content"
            >
              <p className="eyebrow">{t('page')}</p>
              <article className="page-preview">
                <span className="source-domain">
                  <Icon name="link" />
                  {(snapshot.url ? new URL(snapshot.url).hostname : '').replace(
                    /^www\./,
                    '',
                  )}
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
              <Button
                type="button"
                className="full-width"
                disabled={
                  busy ||
                  !connected ||
                  !projectId ||
                  Boolean(snapshot.error) ||
                  !snapshot.url
                }
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
              </Button>
              {renderNotice('capture')}
            </section>
            <section
              id="dome-pane-note"
              role="tabpanel"
              aria-labelledby="dome-action-note"
              hidden={task !== 'note'}
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
                      title !==
                        (note?.title || initialTitle.current.slice(0, 200)),
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
            </section>
            <section
              id="dome-pane-contact"
              role="tabpanel"
              aria-labelledby="dome-action-contact"
              hidden={task !== 'contact'}
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
                    {detected?.displayLabel ||
                      (snapshot.url ? new URL(snapshot.url).hostname : '')}
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
                  <Input
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
                  <Input
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
                  <Input
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
                {(['location', 'company', 'phone', 'website'] as const).map(
                  (field) => (
                    <label className="field" key={field}>
                      {t(field)}
                      <Input
                        value={String(contact.profile?.[field] || '')}
                        maxLength={500}
                        onChange={(event) =>
                          setContact({
                            ...contact,
                            profile: {
                              ...contact.profile,
                              [field]: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ),
                )}
                {(
                  [
                    'about',
                    'experience',
                    'education',
                    'skills',
                    'certifications',
                    'languages',
                    'links',
                  ] as const
                ).map((field) =>
                  contact.profile?.[field] ? (
                    <details className="profile-section" key={field}>
                      <summary>{t(field)}</summary>
                      <Textarea
                        aria-label={t(field)}
                        value={String(contact.profile[field])}
                        maxLength={6000}
                        rows={5}
                        onChange={(event) =>
                          setContact({
                            ...contact,
                            profile: {
                              ...contact.profile,
                              [field]: event.target.value,
                            },
                          })
                        }
                      />
                    </details>
                  ) : null,
                )}
                <p className="helper">
                  {t('profileSource')}{' '}
                  <a href={contact.pageUrl} target="_blank" rel="noreferrer">
                    {t('page')}
                  </a>
                </p>
                <label className="field">
                  {t('contactNotes')}
                  <Textarea
                    maxLength={4000}
                    rows={3}
                    value={contact.notes || ''}
                    disabled={busy}
                    onChange={(event) =>
                      setContact({ ...contact, notes: event.target.value })
                    }
                  />
                </label>
                <Button
                  type="submit"
                  className="full-width"
                  disabled={
                    busy ||
                    !connected ||
                    !projectId ||
                    !contact.displayName.trim()
                  }
                >
                  <Icon name="contact" />
                  {t(busy ? 'working' : 'saveContact')}
                </Button>
              </form>
              {renderNotice('contact')}
            </section>
          </div>
          {many}
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
