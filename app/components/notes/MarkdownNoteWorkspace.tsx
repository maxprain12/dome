'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, es, fr, ptBR } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Home, Folder, FileText } from 'lucide-react';
import MarkdownNoteEditor, {
  type MarkdownNoteEditorHandle,
} from '@/components/markdown/MarkdownNoteEditor';
import SidePanel from '@/components/workspace/SidePanel';
import type { SidePanelTab } from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import SplitResourcePicker from '@/components/workspace/SplitResourcePicker';
import { useAppStore } from '@/lib/store/useAppStore';
import type { Resource, StudioOutput } from '@/types';
import NoteActionBar from '@/components/notes/NoteActionBar';
import type { ActionBarCrumbSegment, NoteViewMode } from '@/components/notes/NoteActionBar';
import type { NoteSavePillState } from '@/components/notes/NoteSavePill';
import NoteDocTitle from '@/components/notes/NoteDocTitle';
import NoteMetaBar from '@/components/notes/NoteMetaBar';
import NoteEmptyState from '@/components/notes/NoteEmptyState';
import NoteHeroCover from '@/components/notes/NoteHeroCover';
import NoteQuickTagModal from '@/components/notes/NoteQuickTagModal';
import { countWordsFromMarkdown, loadNoteMarkdown } from '@/lib/notes/loadNoteMarkdown';
import { HOME_TAB_ID, useTabStore } from '@/lib/store/useTabStore';

interface MarkdownNoteWorkspaceProps {
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

const NOTE_TEMPLATES: Record<string, (ctx: { today: string; weeklyLabel: string }) => string> = {
  daily: ({ today }) => `# ${today}\n\n`,
  meeting: () => `## Meeting notes\n\nAsistentes:\n\n- —\n`,
  brief: () => `## Idea / brief\n\n`,
  pdf_summary: () => `## Resumen fuente\n\n`,
  weekly: ({ weeklyLabel }) => `## ${weeklyLabel}\n\n- \n- \n`,
};

async function loadFolderAncestors(
  folderId: string,
): Promise<Array<{ id: string; title: string }>> {
  const path: Array<{ id: string; title: string }> = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId) && window.electron?.db?.resources?.getById) {
    visited.add(currentId);
    const res = await window.electron.db.resources.getById(currentId);
    if (!res?.success || !res.data || res.data.type !== 'folder') break;
    path.unshift({ id: res.data.id, title: res.data.title || '' });
    currentId = res.data.folder_id ?? null;
  }
  return path;
}

function getSavePillState(
  saveError: string | null,
  isSaving: boolean,
  isDirty: boolean,
): NoteSavePillState {
  if (saveError) return 'error';
  if (isSaving) return 'saving';
  if (isDirty) return 'dirty';
  return 'saved';
}

function getEditorPlaceholder(
  readOnly: boolean,
  editorReady: boolean,
  emptyVisible: boolean,
  t: TFunction,
): string | undefined {
  if (readOnly || !editorReady) return undefined;
  return emptyVisible ? '' : t('notes.editor_placeholder');
}

function getNoteHeroEmoji(resource: Resource): string | undefined {
  const meta = resource.metadata as Record<string, unknown> | undefined;
  return meta && typeof meta.dome_note_icon === 'string'
    ? String(meta.dome_note_icon)
    : undefined;
}

function getDomeShareLink(resource: Resource): string | null {
  return typeof resource.id === 'string' ? `dome://resource/${resource.id}/note` : null;
}

type EditorBlockArgs = {
  resourceId: string;
  readOnly: boolean;
  editorReady: boolean;
  wordCount: number;
  saveError: string | null;
  editorRef: RefObject<MarkdownNoteEditorHandle>;
  initialMarkdown: string;
  handleEditorChange: () => void;
  handleEditorReady: () => void;
  handlePickTemplate: (id: string) => void;
  t: TFunction;
};

function renderEditorBlock(args: EditorBlockArgs) {
  const emptyVisible = args.editorReady && !args.readOnly && args.wordCount === 0;
  const placeholder = getEditorPlaceholder(
    args.readOnly,
    args.editorReady,
    emptyVisible,
    args.t,
  );
  return (
    <>
      {emptyVisible ? (
        <NoteEmptyState
          onPickTemplate={args.readOnly ? undefined : args.handlePickTemplate}
        />
      ) : null}
      <div className="min-h-0 pb-24">
        <MarkdownNoteEditor
          key={args.resourceId}
          ref={args.editorRef}
          initialMarkdown={args.initialMarkdown}
          readOnly={args.readOnly}
          placeholder={placeholder}
          onChange={args.handleEditorChange}
          onReady={args.handleEditorReady}
        />
      </div>
      {args.saveError ? (
        <div role="alert" className="px-4 pb-6 text-xs" style={{ color: 'var(--dome-error)' }}>
          {args.saveError}
        </div>
      ) : null}
    </>
  );
}

type SidePanelsArgs = {
  resource: Resource;
  sourcesPanelOpen: boolean;
  studioPanelOpen: boolean;
  activeStudioOutput: StudioOutput | null;
  setActiveStudioOutput: (output: StudioOutput | null) => void;
};

function renderSidePanels(args: SidePanelsArgs) {
  return (
    <>
      {args.sourcesPanelOpen ? (
        <SourcesPanel resourceId={args.resource.id} projectId={args.resource.project_id} />
      ) : null}
      {args.studioPanelOpen ? (
        <StudioPanel resourceId={args.resource.id} projectId={args.resource.project_id} />
      ) : null}
      {args.activeStudioOutput ? (
        <StudioOutputViewer
          output={args.activeStudioOutput}
          onClose={() => args.setActiveStudioOutput(null)}
        />
      ) : null}
    </>
  );
}

export default function MarkdownNoteWorkspace({
  resourceId,
  readOnly = false,
  compact = false,
}: MarkdownNoteWorkspaceProps) {
  const { t, i18n } = useTranslation();

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [initialMarkdown, setInitialMarkdown] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePillSavedAt, setSavePillSavedAt] = useState<number | null>(null);
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [editorReady, setEditorReady] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [sidePanelPreferredTab, setSidePanelPreferredTab] = useState<SidePanelTab | null>(null);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  const [projectLabel, setProjectLabel] = useState('');
  const [folderPath, setFolderPath] = useState<Array<{ id: string; title: string }>>([]);
  const [backlinkCount, setBacklinkCount] = useState(0);
  const [resourceTags, setResourceTags] = useState<Array<{ id: string; name: string }>>([]);
  const [tagQuickModalOpen, setTagQuickModalOpen] = useState(false);

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
      /* ignore quota / private mode */
    }
  }, [viewMode]);

  const editorRef = useRef<MarkdownNoteEditorHandle | null>(null);
  const mirroredOnceRef = useRef(false);
  // Monotonic counter of editor changes: lets persistNote detect keystrokes
  // that arrived while a save was in flight (must stay dirty afterwards).
  const changeSeqRef = useRef(0);
  const wordCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(
    () => () => {
      if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
    },
    [],
  );

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const isPopout =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/focus/note/');

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

  const refreshBacklinkCount = useCallback(async (id: string) => {
    if (!window.electron?.db?.resources?.getBacklinks) return;
    const bl = await window.electron.db.resources.getBacklinks(id);
    setBacklinkCount(bl?.success && Array.isArray(bl.data) ? bl.data.length : 0);
  }, []);

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
          const md = await loadNoteMarkdown(result.data);
          setResource(result.data);
          setTitle(result.data.title || '');
          setInitialMarkdown(md);
          setWordCount(countWordsFromMarkdown(md));
          setSavePillSavedAt(result.data.updated_at ?? Date.now());
          setEditorReady(false);
          setIsDirty(false);
          mirroredOnceRef.current = false;

          void window.electron.db.projects.getById(result.data.project_id).then((p) => {
            setProjectLabel(p?.success && p.data?.name ? p.data.name : '');
          });
          if (result.data.folder_id) {
            void loadFolderAncestors(result.data.folder_id).then(setFolderPath);
          } else {
            setFolderPath([]);
          }
          void refreshBacklinkCount(resourceId);
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
  }, [resourceId, refreshBacklinkCount, refreshResourceTags]);

  useEffect(() => {
    if (!window.electron?.on) return undefined;

    const applyExternalMarkdown = (markdown: string, updatedAt?: number) => {
      if (isDirtyRef.current) return;
      editorRef.current?.setMarkdown(markdown);
      setWordCount(countWordsFromMarkdown(markdown));
      setIsDirty(false);
      if (updatedAt != null) setSavePillSavedAt(updatedAt);
    };

    const unsub = window.electron.on(
      'resource:updated',
      (payload: {
        id?: string;
        updates?: Partial<Resource>;
        fromVault?: boolean;
        fromAgent?: boolean;
      }) => {
        if (payload?.id !== resourceId) return;

        const reloadFromMirror = () => {
          if (isDirtyRef.current || !window.electron?.notes?.readMirror) return;
          void window.electron.notes.readMirror({ id: resourceId }).then((m) => {
            if (isDirtyRef.current || !m?.success || typeof m.markdown !== 'string') return;
            applyExternalMarkdown(m.markdown, payload.updates?.updated_at);
          });
        };

        if (payload.fromVault) {
          reloadFromMirror();
          return;
        }

        const updates = payload.updates;
        if (!updates) return;

        if (typeof updates.title === 'string') {
          setTitle((curr) => (curr === updates.title ? curr : updates.title!));
          setResource((prev) => (prev ? { ...prev, title: updates.title! } : prev));
        }

        if (updates.content !== undefined) {
          if (payload.fromAgent || window.electron?.notes) {
            reloadFromMirror();
            return;
          }
          if (typeof updates.content === 'string' && !isDirtyRef.current) {
            applyExternalMarkdown(updates.content, updates.updated_at);
          }
        }
      },
    );
    return () => unsub?.();
  }, [resourceId]);

  const persistNote = useCallback(async () => {
    if (readOnly || !resource || !editorRef.current) return;
    const seqAtSave = changeSeqRef.current;
    const markdown = editorRef.current.getMarkdown();
    setIsSaving(true);
    setSaveError(null);
    try {
      if (window.electron?.notes?.writeMirror) {
        await window.electron.notes.writeMirror({ id: resourceId, markdown });
      }
      const now = Date.now();
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        updated_at: now,
      });
      // Keystrokes may have landed while awaiting the writes above; only
      // clear the dirty flag if nothing changed since we serialized.
      if (changeSeqRef.current === seqAtSave) {
        setIsDirty(false);
      } else {
        setAutosaveTick((n) => n + 1);
      }
      setSavePillSavedAt(now);
      setWordCount(countWordsFromMarkdown(markdown));
      setResource((prev) => (prev ? { ...prev, title, updated_at: now } : prev));
      await refreshBacklinkCount(resourceId);
    } catch (err) {
      console.error('Error saving note:', err);
      setSaveError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setIsSaving(false);
    }
  }, [readOnly, resource, resourceId, title, refreshBacklinkCount]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!readOnly && (e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void persistNote();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [persistNote, readOnly]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => void persistNote(), 1500);
    return () => clearTimeout(timer);
  }, [isDirty, persistNote, autosaveTick]);

  const handleTitleBlur = useCallback(async () => {
    if (readOnly || !resource || !window.electron?.db?.resources) return;
    if (title === resource.title && !isDirty) return;
    const now = Date.now();
    try {
      await window.electron.db.resources.update({ id: resourceId, title, updated_at: now });
      setResource((prev) => (prev ? { ...prev, title, updated_at: now } : prev));
      setIsDirty(false);
      setSavePillSavedAt(now);
      if (editorRef.current && window.electron?.notes?.writeMirror) {
        await window.electron.notes.writeMirror({
          id: resourceId,
          markdown: editorRef.current.getMarkdown(),
        });
      }
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [readOnly, resource, resourceId, title, isDirty]);

  const handleEditorChange = useCallback(() => {
    if (readOnly) return;
    changeSeqRef.current += 1;
    setIsDirty(true);
    // getMarkdown() serializes the whole doc — debounce so large notes don't
    // pay a full serialization on every keystroke.
    if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
    wordCountTimerRef.current = setTimeout(() => {
      wordCountTimerRef.current = null;
      if (editorRef.current) {
        setWordCount(countWordsFromMarkdown(editorRef.current.getMarkdown()));
      }
    }, 350);
  }, [readOnly]);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
    if (readOnly || !resource || resource.vault_path || mirroredOnceRef.current) return;
    mirroredOnceRef.current = true;
    if (!editorRef.current || !window.electron?.notes?.writeMirror) return;
    void window.electron.notes.writeMirror({
      id: resourceId,
      markdown: editorRef.current.getMarkdown(),
    });
  }, [readOnly, resource, resourceId]);

  const handlePickTemplate = useCallback(
    (id: string) => {
      if (readOnly || !editorRef.current) return;
      const factory = NOTE_TEMPLATES[id];
      if (!factory) return;
      const today = new Date().toLocaleDateString(i18n.language, {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const md = factory({ today, weeklyLabel: t('notes.template_weekly') });
      editorRef.current.setMarkdown(md);
      setWordCount(countWordsFromMarkdown(md));
      setIsDirty(true);
    },
    [i18n.language, readOnly, t],
  );

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
      console.error('[MarkdownNoteWorkspace] popout failed:', err);
    }
  }, [resource]);

  const openFolderTab = useTabStore((s) => s.openFolderTab);

  const crumbs = useMemo((): ActionBarCrumbSegment[] => {
    if (!resource) return [];

    const projectName = projectLabel.trim() || t('notes.folder_unfiled');
    const segments: ActionBarCrumbSegment[] = [
      {
        icon: <Home size={13} strokeWidth={2} />,
        label: t('notes.workspace_nav'),
        onClick: () => useTabStore.getState().activateTab(HOME_TAB_ID),
      },
      {
        icon: <Folder size={13} strokeWidth={2} />,
        label: projectName,
        onClick: resource.project_id
          ? () => openFolderTab(resource.project_id, projectName, 'var(--dome-accent)', resource.project_id)
          : undefined,
      },
    ];

    for (const folder of folderPath) {
      segments.push({
        icon: <Folder size={13} strokeWidth={2} />,
        label: folder.title,
        onClick: () => openFolderTab(folder.id, folder.title, undefined, resource.project_id),
      });
    }

    segments.push({
      icon: <FileText size={13} strokeWidth={2} />,
      label: t('notes.crumb_note'),
      current: true,
    });

    return segments;
  }, [resource, projectLabel, folderPath, openFolderTab, t]);

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

  const savePillState = getSavePillState(saveError, isSaving, isDirty);

  const editedRelative = formatDistanceToNowStrict(resource.updated_at, {
    addSuffix: true,
    locale: localeFor(i18n.language),
  });

  const editorBlockNode = renderEditorBlock({
    resourceId,
    readOnly,
    editorReady,
    wordCount,
    saveError,
    editorRef,
    initialMarkdown,
    handleEditorChange,
    handleEditorReady,
    handlePickTemplate,
    t,
  });

  const sidePanelsNode = renderSidePanels({
    resource,
    sourcesPanelOpen,
    studioPanelOpen,
    activeStudioOutput,
    setActiveStudioOutput,
  });

  if (compact) {
    return (
      <div
        className="note-area flex flex-col h-full min-h-0 overflow-hidden"
        data-note-mode="standard"
        style={{ background: 'var(--dome-bg)' }}
      >
        <div className="note-scroll flex-1 overflow-y-auto min-h-0">
          <div className="note-doc">
            <NoteDocTitle
              value={title}
              placeholder={t('notes.untitled_note')}
              disabled={readOnly}
              onChange={setTitle}
              onBlur={handleTitleBlur}
            />
            {editorBlockNode}
          </div>
        </div>
        {sidePanelsNode}
      </div>
    );
  }

  const noteHeroEmojiRaw = getNoteHeroEmoji(resource);
  const domeShareLink = getDomeShareLink(resource);

  return (
    <div
      className={`note-area flex flex-col h-full min-h-0 overflow-hidden${isPopout ? ' note-area--popout' : ''}`}
      data-note-mode={viewMode === 'focused' ? 'focused' : 'standard'}
      style={{ background: 'var(--dome-bg)' }}
    >
      <NoteActionBar
        crumbs={crumbs}
        saveState={savePillState}
        lastSavedAt={savePillSavedAt ?? resource.updated_at}
        onSave={() => void persistNote()}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSplit={() => setSplitPickerOpen(true)}
        canOpenSplit={Boolean(resource.project_id)}
        onOpenPopout={() => void handlePopoutNote()}
        onOpenMetadata={() => setShowMetadata(true)}
        domeLinkToCopy={domeShareLink}
        onOpenBacklinksPanel={() => {
          setSidePanelPreferredTab('backlinks');
          setSidePanelOpen(true);
        }}
        hideWindowControls={isPopout}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((o) => !o)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="note-scroll flex-1 overflow-y-auto min-h-0">
            <div className="note-doc">
              <NoteHeroCover visible={false} emoji={noteHeroEmojiRaw} readOnly={readOnly} />
              <NoteDocTitle
                value={title}
                placeholder={t('notes.untitled_note')}
                disabled={readOnly}
                onChange={setTitle}
                onBlur={handleTitleBlur}
              />
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
              {editorBlockNode}
            </div>
          </div>
        </div>

        {sidePanelsNode}
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
