'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { JSONContent, Editor } from '@tiptap/core';
import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, es, fr, ptBR } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Home, Folder, FileText } from 'lucide-react';
import NoteEditor from '@/components/editor/NoteEditor';
import SidePanel from '@/components/workspace/SidePanel';
import type { SidePanelTab } from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import SplitResourcePicker from '@/components/workspace/SplitResourcePicker';
import { useAppStore } from '@/lib/store/useAppStore';
import {
  getDefaultNoteContent,
  loadNoteContent,
  serializeNoteContent,
  serializeNoteToMarkdown,
  type LoadedNoteContent,
} from '@/lib/tiptap/utils';
import type { Resource } from '@/types';
import NoteActionBar from '@/components/notes/NoteActionBar';
import type { NoteViewMode } from '@/components/notes/NoteActionBar';
import type { NoteSavePillState } from '@/components/notes/NoteSavePill';
import NoteDocTitle from '@/components/notes/NoteDocTitle';
import NoteMetaBar from '@/components/notes/NoteMetaBar';
import NoteEmptyState from '@/components/notes/NoteEmptyState';
import NoteHeroCover from '@/components/notes/NoteHeroCover';
import NoteQuickTagModal from '@/components/notes/NoteQuickTagModal';
import {
  notifyResourceRelationsChanged,
  syncNoteMentionRelations,
} from '@/lib/utils/content-resources';
import { markdownToHtml } from '@/lib/utils/markdown';

/**
 * Resolve the initial editor content for a note. The Markdown vault is the
 * source of truth: when a mirror exists (`vault_path`), read the `.md` from
 * disk and render it. Fall back to the legacy Tiptap JSON in `content` for
 * notes not yet mirrored (or if the disk read fails).
 */
async function loadNoteEditorContent(resource: Resource): Promise<LoadedNoteContent> {
  if (resource.vault_path && window.electron?.notes?.readMirror) {
    try {
      const mirror = await window.electron.notes.readMirror({ id: resource.id });
      if (mirror?.success && typeof mirror.markdown === 'string') {
        return markdownToHtml(mirror.markdown);
      }
    } catch (err) {
      console.warn('Note mirror read failed, using DB content:', err);
    }
  }
  return loadNoteContent(resource.content);
}

interface NoteWorkspaceClientProps {
  resourceId: string;
  readOnly?: boolean;
  compact?: boolean;
}

function localeFor(language: string) {
  switch (language.split('-')[0]) {
    case 'es':
      return es;
    case 'fr':
      return fr;
    case 'pt':
      return ptBR;
    default:
      return enUS;
  }
}

export default function NoteWorkspaceClient({
  resourceId,
  readOnly = false,
  compact = false,
}: NoteWorkspaceClientProps) {
  const { t, i18n } = useTranslation();

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePillSavedAt, setSavePillSavedAt] = useState<number | null>(null);

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [sidePanelPreferredTab, setSidePanelPreferredTab] = useState<SidePanelTab | null>(null);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);

  const [projectLabel, setProjectLabel] = useState<string>('');
  const [wordCount, setWordCount] = useState(0);
  const [backlinkCount, setBacklinkCount] = useState(0);

  const [resourceTags, setResourceTags] = useState<Array<{ id: string; name: string }>>([]);
  const [tagQuickModalOpen, setTagQuickModalOpen] = useState(false);

  // Fixed layout values (tweaks drawer removed)
  const docWidthPreset = 'wide' as const;
  const docTypographyPreset = 'regular' as const;
  const noteShowCover = false;
  const noteShowMetadataBar = true;
  const noteShowFloatingInsert = true;

  const [viewMode, setViewMode] = useState<NoteViewMode>(() => {
    try {
      const raw = localStorage.getItem('dome:note-view-mode');
      return raw === 'focused' ? 'focused' : 'standard';
    } catch {
      return 'standard';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('dome:note-view-mode', viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const [, setStatsTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStatsTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const pendingContentRef = useRef<LoadedNoteContent | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const mirroredOnceRef = useRef(false);
  /** Skips marking dirty/autosaving right after Collaboration + TipTap bootstrap noise. */
  const ignoreStaleCollaborationDirtyUntilMsRef = useRef(0);
  const [editorReady, setEditorReady] = useState(false);

  const refreshResourceTags = useCallback(() => {
    if (!window.electron?.db?.tags?.getByResource) return;
    void window.electron.db.tags.getByResource(resourceId).then((tr) => {
      if (tr?.success && Array.isArray(tr.data)) {
        setResourceTags(tr.data.map((x) => ({ id: x.id, name: x.name })));
      } else {
        setResourceTags([]);
      }
    });
  }, [resourceId]);

  const isPopout =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/focus/note/');

  const prevResourceIdRef = useRef(resourceId);
  if (resourceId !== prevResourceIdRef.current) {
    prevResourceIdRef.current = resourceId;
    editorRef.current = null;
    mirroredOnceRef.current = false;
    ignoreStaleCollaborationDirtyUntilMsRef.current = 0;
    setEditorReady(false);
    setWordCount(0);
    setSidePanelOpen(false);
    setShowMetadata(false);
    setSplitPickerOpen(false);
    setSidePanelPreferredTab(null);
    setSaveError(null);
    setIsDirty(false);
    setResourceTags([]);
  }

  // ── Load resource ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!window.electron?.db?.resources) {
        setError('Database not available');
        setLoading(false);
        return;
      }
      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (result?.success && result.data) {
          setResource(result.data);
          setTitle(result.data.title || '');
          pendingContentRef.current = await loadNoteEditorContent(result.data);
          setSavePillSavedAt(result.data.updated_at ?? Date.now());

          void window.electron.db.projects.getById(result.data.project_id).then((p) => {
            if (p?.success && p.data?.name) setProjectLabel(p.data.name);
            else setProjectLabel('');
          });

          void window.electron.db.resources.getBacklinks(resourceId).then((bl) => {
            setBacklinkCount(bl?.success && Array.isArray(bl.data) ? bl.data.length : 0);
          });

          refreshResourceTags();
        } else {
          setError('Note not found');
        }
      } catch (err) {
        console.error('Error loading note:', err);
        setError('Failed to load note');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [resourceId, refreshResourceTags]);

  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on(
      'resource:updated',
      (payload: { id?: string; updates?: Partial<Resource>; fromVault?: boolean }) => {
        if (payload?.id !== resourceId) return;
        // External edit to the .md (Obsidian/Finder): reload from the mirror so
        // the open editor reflects disk (unless the user has unsaved changes).
        if (payload.fromVault && !isDirty && window.electron?.notes?.readMirror && editorRef.current) {
          void window.electron.notes.readMirror({ id: resourceId }).then((m) => {
            if (!editorRef.current || isDirty) return;
            if (m?.success && typeof m.markdown === 'string') {
              const html = markdownToHtml(m.markdown);
              pendingContentRef.current = html;
              try {
                editorRef.current.commands.setContent(html, { emitUpdate: false });
              } catch (err) {
                console.warn('[NoteWorkspaceClient] external reload failed:', err);
              }
            }
          });
          return;
        }
        const updates = payload.updates;
        if (!updates) return;
        if (typeof updates.title === 'string') {
          setTitle((curr) => (curr === updates.title ? curr : updates.title!));
          setResource((prev) => (prev ? { ...prev, title: updates.title! } : prev));
        }
        if (typeof updates.content === 'string' && !isDirty && editorRef.current) {
          const next = loadNoteContent(updates.content);
          pendingContentRef.current = next;
          try {
            editorRef.current.commands.setContent(next, { emitUpdate: false });
          } catch (err) {
            console.warn('[NoteWorkspaceClient] setContent failed during sync:', err);
          }
          setResource((prev) => (prev ? { ...prev, content: updates.content as string } : prev));
        }
      },
    );
    return () => unsub?.();
  }, [resourceId, isDirty]);

  useEffect(() => {
    if (resourceId) useAppStore.getState().setSelectedSourceIds([resourceId]);
  }, [resourceId]);

  const savePillState: NoteSavePillState = saveError ? 'error' : isSaving ? 'saving' : isDirty ? 'dirty' : 'saved';

  const refreshBacklinkCount = useCallback(async (id: string) => {
    if (!window.electron?.db?.resources?.getBacklinks) return;
    const bl = await window.electron.db.resources.getBacklinks(id);
    setBacklinkCount(bl?.success && Array.isArray(bl.data) ? bl.data.length : 0);
  }, []);

  const syncMentionsAndNotify = useCallback(
    async (sourceId: string, serialized: string) => {
      const targetIds = await syncNoteMentionRelations(sourceId, serialized);
      notifyResourceRelationsChanged(sourceId, targetIds);
      await refreshBacklinkCount(sourceId);
    },
    [refreshBacklinkCount],
  );

  // Best-effort: mirror the note to a Markdown file on disk (Phase 1 vault
  // export). Conversion needs the live editor (Turndown DOM); failures must
  // never block the primary DB save, so everything here is wrapped/guarded.
  const mirrorNoteToDisk = useCallback(async () => {
    if (!window.electron?.notes?.writeMirror || !editorRef.current) return;
    try {
      const markdown = serializeNoteToMarkdown(editorRef.current);
      await window.electron.notes.writeMirror({ id: resourceId, markdown });
    } catch (err) {
      console.warn('Note markdown mirror failed:', err);
    }
  }, [resourceId]);

  const handleSave = useCallback(async () => {
    if (readOnly || !resource || !window.electron?.db?.resources || !editorRef.current) return;
    const serialized = serializeNoteContent(editorRef.current);
    setIsSaving(true);
    setSaveError(null);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: serialized,
        updated_at: Date.now(),
      });
      const now = Date.now();
      setIsDirty(false);
      setSavePillSavedAt(now);
      setResource((prev) => (prev ? { ...prev, content: serialized, updated_at: now } : prev));
      await syncMentionsAndNotify(resourceId, serialized);
      void mirrorNoteToDisk();
    } catch (err) {
      console.error('Error saving note:', err);
      setSaveError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setIsSaving(false);
    }
  }, [readOnly, resource, resourceId, title, syncMentionsAndNotify, mirrorNoteToDisk]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!readOnly && (e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleSave, readOnly]);

  // Autosave: 1.5s after last content change
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => void handleSave(), 1500);
    return () => clearTimeout(timer);
  }, [isDirty, handleSave]);

  const handleTitleBlur = useCallback(async () => {
    if (readOnly || !resource || !window.electron?.db?.resources) return;
    if (title === resource.title && !isDirty) return;
    const serialized = editorRef.current
      ? serializeNoteContent(editorRef.current)
      : (resource.content || null);
    const now = Date.now();
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: serialized,
        updated_at: now,
      });
      setResource((prev) => (prev ? { ...prev, title, content: serialized ?? undefined, updated_at: now } : prev));
      setIsDirty(false);
      setSavePillSavedAt(now);
      if (serialized) await syncMentionsAndNotify(resourceId, serialized);
      void mirrorNoteToDisk();
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [readOnly, resource, resourceId, title, isDirty, syncMentionsAndNotify, mirrorNoteToDisk]);

  const handleContentUpdate = useCallback(
    (json: JSONContent) => {
      if (readOnly) return;
      pendingContentRef.current = json;
      if (Date.now() < ignoreStaleCollaborationDirtyUntilMsRef.current) return;
      setIsDirty(true);
    },
    [readOnly],
  );

  const handleInsertAIBlock = useCallback(() => {
    editorRef.current
      ?.chain()
      .focus()
      .insertContent({
        type: 'aiBlock',
        attrs: { prompt: '', response: '', status: 'idle' },
      })
      .run();
  }, []);

  const patchWordCountFromEditor = useCallback((editor: Editor) => {
    const text = editor.getText().trim();
    setWordCount(text ? text.split(/\s+/).filter(Boolean).length : 0);
  }, []);

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      ignoreStaleCollaborationDirtyUntilMsRef.current = Date.now() + 200;
      const onUp = () => patchWordCountFromEditor(editor);
      editor.on('update', onUp);
      patchWordCountFromEditor(editor);
      setEditorReady(true);
      const serialized = serializeNoteContent(editor);
      if (serialized) {
        void syncMentionsAndNotify(resourceId, serialized);
      }
    },
    [patchWordCountFromEditor, resourceId, syncMentionsAndNotify],
  );

  // Lazy backfill: a note opened but never edited still gets its Markdown
  // mirror written once, so the vault stays complete without requiring an edit.
  useEffect(() => {
    if (readOnly || !editorReady || !resource) return;
    if (resource.vault_path || mirroredOnceRef.current) return;
    mirroredOnceRef.current = true;
    void mirrorNoteToDisk();
  }, [readOnly, editorReady, resource, mirrorNoteToDisk]);

  const handleSaveMetadata = useCallback(
    async (updates: Partial<Resource>): Promise<boolean> => {
      if (!resource || !window.electron?.db?.resources) return false;
      try {
        const updatedResource = { ...resource, ...updates, updated_at: Date.now() };
        const result = await window.electron.db.resources.update(updatedResource);
        if (result.success) {
          setResource(updatedResource);
          return true;
        }
        return false;
      } catch (err) {
        console.error('Error saving metadata:', err);
        return false;
      }
    },
    [resource],
  );

  const handleToggleInsightsPanel = useCallback(() => {
    setSidePanelOpen((o) => {
      const next = !o;
      if (next) setSidePanelPreferredTab(null);
      return next;
    });
  }, []);

  const handleOpenBacklinksFromToolbar = useCallback(() => {
    setSidePanelPreferredTab('backlinks');
    setSidePanelOpen(true);
  }, []);

  const domeShareLink =
    typeof resource?.id === 'string' ? `dome://resource/${resource.id}/note` : null;

  const handlePickTemplate = useCallback(
    (id: string) => {
      const ed = editorRef.current;
      if (!ed || readOnly) return;
      const today = new Date().toLocaleDateString(i18n.language, {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const payloads: Record<string, JSONContent> = {
        daily: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `${today}` }] },
            { type: 'paragraph' },
          ],
        },
        meeting: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting notes' }] },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Asistentes:' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '—' }] }],
                },
              ],
            },
          ],
        },
        brief: {
          type: 'doc',
          content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Idea / brief' }] }, { type: 'paragraph' }],
        },
        pdf_summary: {
          type: 'doc',
          content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Resumen fuente' }] }, { type: 'paragraph' }],
        },
        weekly: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: t('notes.template_weekly') }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      };
      const body = payloads[id];
      if (!body) return;
      ed.commands.setContent(body, { emitUpdate: true });
    },
    [i18n.language, readOnly, t],
  );

  const handlePopoutNote = useCallback(async () => {
    if (!resource || !window.electron?.invoke) return;
    try {
      await window.electron.invoke('window:create', {
        id: `note-focus:${resource.id}`,
        route: `/focus/note/${encodeURIComponent(resource.id)}`,
        options: {
          width: 960,
          height: 760,
          minWidth: 560,
          minHeight: 480,
          title: `${resource.title} — Dome`,
          transparent: false,
        },
      });
    } catch (err) {
      console.error('[NoteWorkspaceClient] Failed to open note popout:', err);
    }
  }, [resource]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="flex flex-1 items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <span className="text-sm">{error ?? 'Note not found'}</span>
      </div>
    );
  }

  const initialContent = pendingContentRef.current ?? getDefaultNoteContent();

  const editedRelative = formatDistanceToNowStrict(resource.updated_at, {
    addSuffix: true,
    locale: localeFor(i18n.language),
  });

  /** Compact pane (split tab: hosting a note beside another viewer). */
  if (compact) {
    return (
      <div
        className="note-area flex flex-col h-full min-h-0 overflow-hidden"
        data-note-mode="standard"
        data-doc-width={docWidthPreset}
        data-doc-size={docTypographyPreset}
        style={{ background: 'var(--dome-bg)' }}
      >
        <div className="note-scroll flex-1 overflow-y-auto min-h-0">
          <div className="note-doc">
            <div className="min-h-0 flex-1 note-editor-scroll-host">
              <NoteEditor
                key={resourceId}
                content={initialContent}
                editable={!readOnly}
                placeholder={readOnly ? undefined : t('notes.editor_placeholder')}
                projectId={resource.project_id}
                currentResourceId={resource.id}
                zenMode={false}
                splitLinkNav
                onUpdate={handleContentUpdate}
                onEditorReady={handleEditorReady}
                showFloatingInsert={noteShowFloatingInsert}
              />
            </div>
          </div>
        </div>
        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {studioPanelOpen && resource && (
          <StudioPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {activeStudioOutput ? (
          <StudioOutputViewer output={activeStudioOutput} onClose={() => setActiveStudioOutput(null)} />
        ) : null}
      </div>
    );
  }

  const crumbs = [
    { icon: <Home size={13} strokeWidth={2} />, label: t('notes.workspace_nav') },
    {
      icon: <Folder size={13} strokeWidth={2} />,
      label: projectLabel.trim() ? projectLabel : t('notes.folder_unfiled'),
    },
    {
      icon: <FileText size={13} strokeWidth={2} />,
      label: t('notes.crumb_note'),
    },
  ];

  const noteHeroEmojiRaw =
    resource.metadata &&
    typeof (resource.metadata as Record<string, unknown>).dome_note_icon === 'string'
      ? String((resource.metadata as Record<string, unknown>).dome_note_icon)
      : undefined;

  /** Estado vacío “prototipo”: mostrar onboarding mientras no haya texto; no depender de isDirty — el primer onUpdate marca sucio antes de cualquier escritura humana. */
  const emptyVisible = editorReady && !readOnly && wordCount === 0;

  const editorPlaceholder =
    readOnly || !editorReady ? undefined : emptyVisible ? '' : t('notes.editor_placeholder');

  return (
    <div
      className={`note-area flex flex-col h-full min-h-0 overflow-hidden${isPopout ? ' note-area--popout' : ''}`}
      data-note-mode={viewMode === 'focused' ? 'focused' : 'standard'}
      data-doc-width={docWidthPreset}
      data-doc-size={docTypographyPreset}
      style={{ background: 'var(--dome-bg)' }}
    >
      <NoteActionBar
        crumbs={crumbs}
        saveState={savePillState}
        lastSavedAt={savePillSavedAt ?? resource.updated_at}
        onSave={() => void handleSave()}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSplit={() => setSplitPickerOpen(true)}
        onOpenPopout={() => void handlePopoutNote()}
        onOpenMetadata={() => setShowMetadata(true)}
        domeLinkToCopy={domeShareLink}
        onOpenBacklinksPanel={handleOpenBacklinksFromToolbar}
        hideWindowControls={isPopout}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={handleToggleInsightsPanel}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="note-scroll flex-1 overflow-y-auto min-h-0">
            <div className={`note-doc${noteShowCover ? ' note-doc--with-cover' : ''}`}>
              <NoteHeroCover visible={noteShowCover} emoji={noteHeroEmojiRaw} readOnly={readOnly} />

              <NoteDocTitle
                value={title}
                placeholder={t('notes.untitled_note')}
                disabled={readOnly}
                onChange={setTitle}
                onBlur={handleTitleBlur}
              />

              {noteShowMetadataBar ? (
                <NoteMetaBar
                  wordCount={wordCount}
                  editedRelative={editedRelative}
                  backlinksCount={backlinkCount}
                  aiReadyHint={
                    Array.isArray(resource.metadata?.embedding) &&
                    resource.metadata.embedding.length > 0
                  }
                  tags={resourceTags}
                  onRequestAddTag={readOnly ? undefined : () => setTagQuickModalOpen(true)}
                />
              ) : null}

              {emptyVisible ? (
                <NoteEmptyState onPickTemplate={readOnly ? undefined : handlePickTemplate} />
              ) : null}

              <div className="min-h-0 pb-24">
                <NoteEditor
                  key={resourceId}
                  content={initialContent}
                  editable={!readOnly}
                  placeholder={editorPlaceholder}
                  projectId={resource.project_id}
                  currentResourceId={resource.id}
                  zenMode={viewMode === 'focused'}
                  splitLinkNav={false}
                  showFloatingInsert={noteShowFloatingInsert}
                  onUpdate={handleContentUpdate}
                  onEditorReady={handleEditorReady}
                  onInsertAiBlock={readOnly ? undefined : handleInsertAIBlock}
                />
              </div>

              {saveError ? (
                <div role="alert" className="px-4 pb-6 text-xs" style={{ color: 'var(--dome-error)' }}>
                  {saveError}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {studioPanelOpen && resource && (
          <StudioPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {activeStudioOutput ? (
          <StudioOutputViewer output={activeStudioOutput} onClose={() => setActiveStudioOutput(null)} />
        ) : null}
        <SidePanel
          resourceId={resource.id}
          resource={resource}
          isOpen={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
          preferredTab={sidePanelPreferredTab}
          onPreferredTabApplied={() => setSidePanelPreferredTab(null)}
        />
      </div>

      <SplitResourcePicker
        opened={splitPickerOpen}
        onClose={() => setSplitPickerOpen(false)}
        projectId={resource.project_id}
        excludeResourceId={resource.id}
      />

      {showMetadata ? (
        <MetadataModal
          isOpen={showMetadata}
          resource={resource}
          onClose={() => setShowMetadata(false)}
          onSave={handleSaveMetadata}
        />
      ) : null}

      <NoteQuickTagModal
        opened={tagQuickModalOpen}
        onClose={() => setTagQuickModalOpen(false)}
        resourceId={resource.id}
        onTagsChanged={() => refreshResourceTags()}
      />
    </div>
  );
}
