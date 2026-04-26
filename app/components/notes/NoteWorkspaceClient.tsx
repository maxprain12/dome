'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { JSONContent, Editor } from '@tiptap/core';
import { Save, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import NoteEditor from '@/components/editor/NoteEditor';
import NoteToolbar from '@/components/editor/NoteToolbar';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { getDefaultNoteContent, loadNoteContent, serializeNoteContent, type LoadedNoteContent } from '@/lib/tiptap/utils';
import type { Resource } from '@/types';

interface NoteWorkspaceClientProps {
  resourceId: string;
  readOnly?: boolean;
  compact?: boolean;
}

export default function NoteWorkspaceClient({ resourceId, readOnly = false, compact = false }: NoteWorkspaceClientProps) {
  const { t } = useTranslation();

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  // Keep current editor content in a ref — no state to avoid re-mounting the
  // editor. Stores either a Tiptap JSON doc (steady-state) or an HTML string
  // (when we had to recover content from legacy markdown).
  const pendingContentRef = useRef<LoadedNoteContent | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load resource ──────────────────────────────────────────────────────────
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
          pendingContentRef.current = loadNoteContent(result.data.content);
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
    load();
  }, [resourceId]);

  // ── Cross-window sync: when this note is updated in another window
  // (popout ↔ workspace), refresh the editor content as long as we don't
  // have unsaved changes locally (last-writer-wins, no silent overwrites).
  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on(
      'resource:updated',
      (payload: { id?: string; updates?: Partial<Resource> }) => {
        if (payload?.id !== resourceId) return;
        const updates = payload.updates;
        if (!updates) return;
        // Update title if remote changed it (and the user isn't actively typing it).
        if (typeof updates.title === 'string') {
          setTitle((curr) => (curr === updates.title ? curr : updates.title!));
          setResource((prev) => (prev ? { ...prev, title: updates.title! } : prev));
        }
        // Reload content only when we have no local pending edits — protects
        // the user from losing in-flight typing in this window.
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

  // ── Register resource as active source for AI panel ────────────────────────
  useEffect(() => {
    if (resourceId) useAppStore.getState().setSelectedSourceIds([resourceId]);
  }, [resourceId]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (readOnly || !resource || !window.electron?.db?.resources || !editorRef.current) return;
    const serialized = serializeNoteContent(editorRef.current);
    setIsSaving(true);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: serialized,
        updated_at: Date.now(),
      });
      setIsDirty(false);
      setSavedFeedback(true);
      if (savedFeedbackTimerRef.current) clearTimeout(savedFeedbackTimerRef.current);
      savedFeedbackTimerRef.current = setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSaving(false);
    }
  }, [readOnly, resource, resourceId, title]);

  // ── Keyboard shortcut Cmd/Ctrl+S ──────────────────────────────────────────
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

  // ── Title save on blur ────────────────────────────────────────────────────
  const handleTitleBlur = useCallback(async () => {
    if (readOnly) return;
    if (!resource || !window.electron?.db?.resources) return;
    if (title === resource.title) return;
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: resource.content || null,
        updated_at: Date.now(),
      });
      setResource((prev) => prev ? { ...prev, title } : prev);
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [readOnly, resource, resourceId, title]);

  // ── Content change (marks dirty, no auto-save) ────────────────────────────
  const handleContentUpdate = useCallback((json: JSONContent) => {
    if (readOnly) return;
    pendingContentRef.current = json;
    setIsDirty(true);
  }, [readOnly]);

  const handleAskAI = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dome:focused-editor-ai', { detail: { action: 'open' } }));
  }, []);

  const handleInsertAIBlock = useCallback(() => {
    editorRef.current?.chain().focus().insertContent({
      type: 'aiBlock',
      attrs: { prompt: '', response: '', status: 'idle' },
    }).run();
  }, []);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorReady(true);
  }, []);

  const handleSaveMetadata = useCallback(async (updates: Partial<Resource>): Promise<boolean> => {
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
  }, [resource]);

  // ── Render states ─────────────────────────────────────────────────────────
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

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--dome-bg)' }}
    >
      {!compact && (
        <WorkspaceHeader
          resource={resource}
          sidePanelOpen={sidePanelOpen}
          onToggleSidePanel={() => setSidePanelOpen((o) => !o)}
          onShowMetadata={() => setShowMetadata(true)}
          editableTitle={readOnly ? undefined : { value: title, onChange: setTitle, onBlur: handleTitleBlur }}
          savingIndicator={readOnly ? null : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title={isSaving ? t('common.saving') : t('common.save')}
              className="focused-editor-save-button"
              data-dirty={isDirty}
              data-saved={savedFeedback}
            >
              {savedFeedback ? (
                <CheckCircle size={12} strokeWidth={2} />
              ) : (
                <Save size={12} strokeWidth={2} />
              )}
              <span>
                {savedFeedback ? t('common.saved') : isSaving ? t('common.saving') : t('common.save')}
              </span>
            </button>
          )}
        />
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main editor area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Render toolbar only when editor is ready */}
          {editorReady && editorRef.current && !readOnly && (
            <NoteToolbar
              editor={editorRef.current}
              focused
              onAskAI={handleAskAI}
              onInsertAIBlock={handleInsertAIBlock}
            />
          )}
          <NoteEditor
            content={initialContent}
            editable={!readOnly}
            projectId={resource.project_id}
            currentResourceId={resource.id}
            focused
            onUpdate={handleContentUpdate}
            onEditorReady={handleEditorReady}
          />
        </div>

        {/* Right side panels */}
        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {studioPanelOpen && resource && (
          <StudioPanel resourceId={resource.id} projectId={resource.project_id} />
        )}
        {activeStudioOutput && (
          <StudioOutputViewer output={activeStudioOutput} onClose={() => setActiveStudioOutput(null)} />
        )}
        <SidePanel
          resourceId={resource.id}
          resource={resource}
          isOpen={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
        />
      </div>

      {showMetadata && resource && (
        <MetadataModal
          isOpen={showMetadata}
          resource={resource}
          onClose={() => setShowMetadata(false)}
          onSave={handleSaveMetadata}
        />
      )}
    </div>
  );
}
