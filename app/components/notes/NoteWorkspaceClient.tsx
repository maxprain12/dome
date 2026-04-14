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
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { deserializeNoteContent, getDefaultNoteContent, serializeNoteContent } from '@/lib/tiptap/utils';
import type { Resource } from '@/types';

interface NoteWorkspaceClientProps {
  resourceId: string;
}

export default function NoteWorkspaceClient({ resourceId }: NoteWorkspaceClientProps) {
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
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  // Keep current editor JSON in a ref — no state to avoid re-mounting the editor
  const pendingContentRef = useRef<JSONContent | null>(null);
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
          pendingContentRef.current = deserializeNoteContent(result.data.content) ?? getDefaultNoteContent();
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

  // ── Register resource as active source for AI panel ────────────────────────
  useEffect(() => {
    if (resourceId) useAppStore.getState().setSelectedSourceIds([resourceId]);
  }, [resourceId]);

  // ── Keyboard shortcut Cmd/Ctrl+S ──────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!resource || !window.electron?.db?.resources || !editorRef.current) return;
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
  }, [resource, resourceId, title]);

  // ── Title save on blur ────────────────────────────────────────────────────
  const handleTitleBlur = useCallback(async () => {
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
  }, [resource, resourceId, title]);

  // ── Content change (marks dirty, no auto-save) ────────────────────────────
  const handleContentUpdate = useCallback((json: JSONContent) => {
    pendingContentRef.current = json;
    setIsDirty(true);
  }, []);

  const handleEditorReady = useCallback((editor: any) => {
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-surface)' }}>
      {/* Header */}
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((o) => !o)}
        onShowMetadata={() => setShowMetadata(true)}
        editableTitle={{ value: title, onChange: setTitle, onBlur: handleTitleBlur }}
        savingIndicator={
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            title={isSaving ? t('common.saving') : t('common.save')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              height: 28,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid',
              fontSize: 12,
              fontWeight: 500,
              cursor: isDirty && !isSaving ? 'pointer' : 'default',
              transition: 'all 150ms',
              borderColor: savedFeedback
                ? 'var(--dome-accent)'
                : isDirty
                  ? 'var(--border-hover)'
                  : 'transparent',
              background: savedFeedback
                ? 'color-mix(in srgb, var(--dome-accent) 15%, transparent)'
                : isDirty
                  ? 'var(--dome-bg-hover)'
                  : 'transparent',
              color: savedFeedback
                ? 'var(--dome-accent)'
                : isDirty
                  ? 'var(--dome-text)'
                  : 'var(--dome-text-muted)',
              opacity: !isDirty && !savedFeedback ? 0.4 : 1,
            }}
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
        }
      />

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main editor area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Render toolbar only when editor is ready */}
          {editorReady && editorRef.current && (
            <NoteToolbar editor={editorRef.current} />
          )}
          <NoteEditor
            content={initialContent}
            editable
            projectId={resource.project_id}
            currentResourceId={resource.id}
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
        {graphPanelOpen && resource && (
          <GraphPanel resource={resource} />
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
