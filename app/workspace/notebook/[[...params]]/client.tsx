'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import NotebookEditor from '@/components/notebook/NotebookEditor';
import { PyodideProvider } from '@/lib/notebook/PyodideProvider';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { type Resource } from '@/types';

interface NotebookWorkspaceClientProps {
  resourceId: string;
}

export default function NotebookWorkspaceClient({ resourceId }: NotebookWorkspaceClientProps) {
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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

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
          setError('Notebook not found');
        }
      } catch (err) {
        console.error('Error loading notebook:', err);
        setError('Failed to load notebook');
      } finally {
        setLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  const saveContent = useCallback(async (newContent: string) => {
    if (!window.electron?.db?.resources || !resource) return;
    if (newContent === lastSavedContentRef.current) return;

    setIsSaving(true);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title: resource.title,
        content: newContent,
        updated_at: Date.now(),
      });
      lastSavedContentRef.current = newContent;
    } catch (err) {
      console.error('Error saving notebook:', err);
    } finally {
      setIsSaving(false);
    }
  }, [resourceId, resource]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

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

  const notebookWorkspacePath = resource?.metadata && typeof resource.metadata === 'object'
    ? (resource.metadata as Record<string, unknown>).notebook_workspace_path as string | undefined
    : undefined;

  const handleWorkspacePathChange = useCallback(
    async (path: string) => {
      if (!resource) return;
      await handleSaveMetadata({
        metadata: {
          ...(resource.metadata || {}),
          notebook_workspace_path: path,
        },
      });
    },
    [resource, handleSaveMetadata]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="animate-pulse" style={{ color: 'var(--secondary-text)' }}>Loading notebook...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Notebook not found'}</div>
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
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={isPanelOpen}
        onToggleSidePanel={() => setIsPanelOpen(!isPanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
        editableTitle={{
          value: title,
          onChange: setTitle,
          onBlur: handleTitleBlur,
          placeholder: 'Untitled Notebook',
        }}
        savingIndicator={
          isSaving ? (
            <span className="text-xs shrink-0" style={{ color: 'var(--secondary-text)' }}>Saving...</span>
          ) : null
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        {sourcesPanelOpen && resource && (
          <SourcesPanel
            resourceId={resourceId}
            projectId={resource.project_id}
          />
        )}

        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-gutter-stable">
            <PyodideProvider>
              <NotebookEditor
                content={content}
                onChange={handleContentChange}
                title={title}
                workingDirectory={notebookWorkspacePath}
              />
            </PyodideProvider>
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
          notebookWorkspacePath={notebookWorkspacePath}
          onNotebookWorkspacePathChange={handleWorkspacePathChange}
        />

        {studioPanelOpen && resource && (
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} />
        )}

        {graphPanelOpen && resource && (
          <GraphPanel resource={resource} />
        )}
      </div>

      <MetadataModal
        resource={resource}
        isOpen={showMetadata}
        onClose={() => setShowMetadata(false)}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
