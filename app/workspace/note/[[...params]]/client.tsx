'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import NotionEditor from '@/components/editor/NotionEditor';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { looksLikeHtml, markdownToHtml, htmlToMarkdown } from '@/lib/utils/markdown';
import { type Resource } from '@/types';

interface NoteWorkspaceClientProps {
  resourceId: string;
}

export default function NoteWorkspaceClient({ resourceId }: NoteWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const savedFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load resource
  useEffect(() => {
    async function loadResource() {
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
          setContent(result.data.content || '');
          lastSavedContentRef.current = result.data.content || '';
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

    loadResource();
  }, [resourceId]);

  // Set selected sources to current resource when opening (for Studio generation)
  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  // Auto-save or manual save content
  const saveContent = useCallback(async (newContent: string, isManual = false) => {
    if (!window.electron?.db?.resources || !resource) return;
    if (newContent === lastSavedContentRef.current) return;

    setIsSaving(true);
    setLastSavedAt(null);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title: resource.title,
        content: newContent,
        updated_at: Date.now(),
      });
      lastSavedContentRef.current = newContent;
      setLastSavedAt(Date.now());
      if (savedFeedbackTimeoutRef.current) clearTimeout(savedFeedbackTimeoutRef.current);
      savedFeedbackTimeoutRef.current = setTimeout(() => setLastSavedAt(null), 2500);
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSaving(false);
    }
  }, [resourceId, resource]);

  // Manual save - triggers immediately with current content
  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveContent(content, true);
  }, [content, saveContent]);

  // Debounced save on content change (editor gives HTML, we convert to Markdown and save)
  const handleContentChange = useCallback((htmlFromEditor: string) => {
    const markdown = htmlToMarkdown(htmlFromEditor);
    setContent(markdown);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent(markdown);
    }, 1000);
  }, [saveContent]);

  // Save title
  const handleTitleBlur = useCallback(async () => {
    if (!window.electron?.db?.resources || !resource) return;
    if (title === resource.title) return;

    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: resource.content || null,
        updated_at: Date.now(),
      });
      setResource({ ...resource, title });
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [resourceId, resource, title]);

  // Save metadata from modal
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedFeedbackTimeoutRef.current) clearTimeout(savedFeedbackTimeoutRef.current);
    };
  }, []);

  const hasUnsavedChanges = content !== lastSavedContentRef.current;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="animate-pulse" style={{ color: 'var(--secondary-text)' }}>Loading note...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Note not found'}</div>
        <button
          onClick={() => { if (typeof window !== 'undefined') window.close(); }}
          className="btn btn-primary"
        >
          Close Window
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Shared Header */}
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={isPanelOpen}
        onToggleSidePanel={() => setIsPanelOpen(!isPanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
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
              <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Guardando automáticamente...</span>
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sources Panel */}
        {sourcesPanelOpen && resource && (
          <SourcesPanel
            resourceId={resourceId}
            projectId={resource.project_id}
          />
        )}

        {/* Editor area */}
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-auto p-6">
            <div className="note-editor-with-guides w-full">
              <NotionEditor
                content={looksLikeHtml(content) ? content : markdownToHtml(content || '')}
                contentType="html"
                onChange={handleContentChange}
                placeholder="Escribe '/' para comandos..."
              />
            </div>
          </div>

          {/* Studio Output Viewer Overlay */}
          {activeStudioOutput && (
            <StudioOutputViewer
              output={activeStudioOutput}
              onClose={() => setActiveStudioOutput(null)}
            />
          )}
        </div>

        {/* Side Panel */}
        <SidePanel
          resourceId={resourceId}
          resource={resource}
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />

        {/* Studio Panel */}
        {studioPanelOpen && resource && (
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} />
        )}

        {/* Graph Panel */}
        {graphPanelOpen && resource && (
          <GraphPanel resource={resource} />
        )}
      </div>

      {/* Metadata Modal */}
      <MetadataModal
        resource={resource}
        isOpen={showMetadata}
        onClose={() => setShowMetadata(false)}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
