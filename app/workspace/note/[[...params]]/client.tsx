'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import { FullEditor } from '@/components/editor/full-editor';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import ExportModal from '@/components/export/ExportModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { contentToPrintHtml } from '@/lib/utils/note-to-html';
import { type Resource } from '@/types';
import { useTranslation } from 'react-i18next';

interface NoteWorkspaceClientProps {
  resourceId: string;
  onTitleChange?: (title: string) => void;
  onUnsavedChange?: (hasUnsaved: boolean) => void;
}

export default function NoteWorkspaceClient({ resourceId, onTitleChange, onUnsavedChange }: NoteWorkspaceClientProps) {
  const { t } = useTranslation();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentRevision, setContentRevision] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const savedFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resourceRef = useRef<Resource | null>(null);
  const contentRef = useRef<string>('');
  const titleRef = useRef<string>('');
  resourceRef.current = resource;
  contentRef.current = content;
  titleRef.current = title;

  // Prevent ProseMirror scrollIntoView from scrolling the outer container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventScroll = () => {
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    el.addEventListener('scroll', preventScroll);
    return () => el.removeEventListener('scroll', preventScroll);
  }, []);

  const onTitleChangeRef = useRef(onTitleChange);
  const onUnsavedChangeRef = useRef(onUnsavedChange);
  onTitleChangeRef.current = onTitleChange;
  onUnsavedChangeRef.current = onUnsavedChange;

  // Load resource — single source: `resources` (type note)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent('');
    setTitle('');
    setError(null);
    setContentRevision(0);

    async function loadResource() {
      if (!window.electron?.db?.resources) {
        if (!cancelled) setError(t('errors.database_unavailable'));
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const resResult = await window.electron.db.resources.getById(resourceId);
        if (cancelled) return;

        if (resResult?.success && resResult.data) {
          const r = resResult.data as Resource;
          if (r.type !== 'note') {
            if (!cancelled) {
              setError('This resource is not a note.');
              setLoading(false);
            }
            return;
          }

          const body = typeof r.content === 'string' ? r.content : '';
          (window as unknown as { __domeCurrentProjectId?: string }).__domeCurrentProjectId = r.project_id || 'default';

          setResource(r);
          setTitle(r.title || '');
          setContent(body);
          lastSavedContentRef.current = body;
          onTitleChangeRef.current?.(r.title || 'Untitled');
          onUnsavedChangeRef.current?.(false);
        } else {
          setError('Note not found');
        }
      } catch (err) {
        console.error('Error loading note:', err);
        if (!cancelled) setError('Failed to load note');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadResource();
    return () => {
      cancelled = true;
    };
  }, [resourceId, t]);

  // External updates (AI tools, sync, other windows). Do not overwrite body while local edits are pending.
  useEffect(() => {
    if (!window.electron?.on) return;
    const unsub = window.electron.on(
      'resource:updated',
      ({ id, updates }: { id: string; updates: Partial<Resource> }) => {
        if (id !== resourceId) return;
        if (updates.title !== undefined) setTitle(updates.title);

        const hasLocalBodyChanges = contentRef.current !== lastSavedContentRef.current;
        if (updates.content !== undefined && !hasLocalBodyChanges) {
          const c = typeof updates.content === 'string' ? updates.content : '';
          setContent(c);
          lastSavedContentRef.current = c;
          setContentRevision((rev) => rev + 1);
        }

        setResource((prev) => {
          if (!prev) return prev;
          if (updates.content !== undefined && hasLocalBodyChanges) {
            const { content: _remoteBody, ...rest } = updates;
            return { ...prev, ...rest } as Resource;
          }
          return { ...prev, ...updates } as Resource;
        });
      },
    );
    return () => {
      unsub();
    };
  }, [resourceId]);

  // Closing the right "inspector" when Studio or Graph opens (single wide rail)
  useEffect(() => {
    if (studioPanelOpen || graphPanelOpen) {
      setIsPanelOpen(false);
    }
  }, [studioPanelOpen, graphPanelOpen]);

  // Set selected sources to current resource when opening (for Studio generation)
  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  const saveContent = useCallback(async (newContent: string, _isManual = false) => {
    const res = resourceRef.current;
    if (!res || !window.electron?.db?.resources) return;
    if (newContent === lastSavedContentRef.current) return;

    const titleToPersist = titleRef.current.trim() || res.title;

    setIsSaving(true);
    setLastSavedAt(null);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title: titleToPersist,
        content: newContent,
        updated_at: Date.now(),
      });
      lastSavedContentRef.current = newContent;
      setResource((prev) => (prev ? { ...prev, title: titleToPersist, content: newContent } : prev));
      setLastSavedAt(Date.now());
      onUnsavedChange?.(false);
      if (savedFeedbackTimeoutRef.current) clearTimeout(savedFeedbackTimeoutRef.current);
      savedFeedbackTimeoutRef.current = setTimeout(() => setLastSavedAt(null), 2500);
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSaving(false);
    }
  }, [resourceId, onUnsavedChange]);

  // Flush pending debounced save and persist latest content on unmount (tab switch / close)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (savedFeedbackTimeoutRef.current) {
        clearTimeout(savedFeedbackTimeoutRef.current);
      }
      const res = resourceRef.current;
      const latest = contentRef.current;
      if (!res || !window.electron?.db?.resources) return;
      if (latest === lastSavedContentRef.current) return;
      const titleToPersist = titleRef.current.trim() || res.title;
      void window.electron.db.resources.update({
        id: resourceId,
        title: titleToPersist,
        content: latest,
        updated_at: Date.now(),
      });
      lastSavedContentRef.current = latest;
    };
  }, [resourceId]);

  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveContent(content, true);
  }, [content, saveContent]);

  const handleContentChange = useCallback(
    (jsonFromEditor: unknown) => {
      const serialized =
        typeof jsonFromEditor === 'string' ? jsonFromEditor : JSON.stringify(jsonFromEditor);
      setContent(serialized);
      onUnsavedChange?.(serialized !== lastSavedContentRef.current);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveContent(serialized);
      }, 1000);
    },
    [saveContent, onUnsavedChange],
  );

  const handleTitleBlur = useCallback(async () => {
    const res = resourceRef.current;
    if (!res) return;
    if (title === res.title) return;

    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: contentRef.current,
        updated_at: Date.now(),
      });
      setResource({ ...res, title });
      onTitleChange?.(title);
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [resourceId, title, onTitleChange]);

  const handleExportPdf = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.note) return;
    const html = contentToPrintHtml(content, title);
    const result = await window.electron.note.exportToPdf({ html, title });
    if (result.success && result.path) {
      await window.electron.openPath(result.path);
    }
  }, [content, title]);

  const handleSaveMetadata = useCallback(async (updates: Partial<Resource>): Promise<boolean> => {
    if (!resource || typeof window === 'undefined' || !window.electron) return false;

    try {
      const updatedResource = {
        ...resource,
        ...updates,
        updated_at: Date.now(),
      };

      const result = await window.electron.db.resources.update(updatedResource);

      if (result.success) {
        setResource(updatedResource);
        if (updates.title) setTitle(updates.title);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving metadata:', err);
      return false;
    }
  }, [resource]);

  const handleToggleSidePanel = useCallback(() => {
    setIsPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        useAppStore.setState({ studioPanelOpen: false, graphPanelOpen: false });
      }
      return next;
    });
  }, []);

  const parsedEditorContent = useMemo(() => {
    const c = content;
    if (!c) return null;
    try {
      return JSON.parse(c);
    } catch {
      return c;
    }
  }, [content]);

  const hasUnsavedChanges = content !== lastSavedContentRef.current;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="animate-pulse" style={{ color: 'var(--secondary-text)' }}>
          Loading note...
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Note not found'}</div>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') window.close();
          }}
          className="btn btn-primary"
        >
          Close Window
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg)', overflow: 'clip' }}>
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={isPanelOpen}
        onToggleSidePanel={handleToggleSidePanel}
        onShowMetadata={() => setShowMetadata(true)}
        onExportPdf={handleExportPdf}
        onExport={() => setShowExportModal(true)}
        editableTitle={{
          value: title,
          onChange: setTitle,
          onBlur: handleTitleBlur,
          placeholder: 'Untitled Note',
        }}
        savingIndicator={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: hasUnsavedChanges ? 'var(--accent)' : 'var(--bg-secondary)',
                color: hasUnsavedChanges ? 'white' : 'var(--secondary-text)',
                border: '1px solid var(--border)',
              }}
              title={hasUnsavedChanges ? 'Guardar ahora' : 'Guardado'}
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
            </button>
            {isSaving && (
              <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                Guardando automáticamente...
              </span>
            )}
            {lastSavedAt && !isSaving && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--success, #22c55e)' }}>
                <Check size={12} />
                Guardado
              </span>
            )}
          </div>
        }
      />

      <div className="flex-1 flex relative min-h-0 min-w-0" style={{ overflow: 'clip' }}>
        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resourceId} projectId={resource.project_id} />
        )}

        <div className="flex-1 relative min-h-0 min-w-0" style={{ overflow: 'clip' }}>
          <div className="h-full overflow-auto min-w-0">
            <div className="w-full min-w-0">
              <FullEditor
                noteId={resourceId}
                title={title}
                content={parsedEditorContent}
                contentRevision={contentRevision}
                showTitleEditor={false}
                editable={true}
                onContentChange={handleContentChange}
              />
            </div>
          </div>

          {activeStudioOutput && (
            <StudioOutputViewer
              output={activeStudioOutput}
              onClose={() => setActiveStudioOutput(null)}
            />
          )}
        </div>

        <SidePanel
          resourceId={resourceId}
          resource={resource}
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />

        {studioPanelOpen && resource && (
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} />
        )}

        {graphPanelOpen && resource && <GraphPanel resource={resource} />}
      </div>

      {showExportModal && (
        <ExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          noteId={resourceId}
          title={title}
          content={content}
          isNoteFromNewDomain={false}
          onExportPdf={handleExportPdf}
        />
      )}

      <MetadataModal
        resource={resource}
        isOpen={showMetadata}
        onClose={() => setShowMetadata(false)}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
