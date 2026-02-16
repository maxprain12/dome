'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import type { Resource } from '@/types';
import { processUrlResource } from '@/lib/web/processor';

interface YouTubeWorkspaceClientProps {
  resourceId: string;
}

export default function YouTubeWorkspaceClient({ resourceId }: YouTubeWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const navigate = useNavigate();

  const handleProcess = useCallback(async () => {
    if (!resourceId || !window.electron?.web?.process) return;
    try {
      setIsProcessing(true);
      await processUrlResource(resourceId);
      const result = await window.electron.db.resources.getById(resourceId);
      if (result?.success && result.data) {
        const data = result.data;
        if (data.metadata && typeof data.metadata === 'string') {
          data.metadata = JSON.parse(data.metadata);
        }
        setResource(data as Resource);
      }
    } catch (err) {
      console.error('Error processing YouTube resource:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [resourceId]);

  useEffect(() => {
    async function loadResource() {
      if (typeof window === 'undefined' || !window.electron?.db?.resources) {
        setError('Electron API not available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.db.resources.getById(resourceId);

        if (result?.success && result.data) {
          const resourceData = result.data;
          if (resourceData.metadata && typeof resourceData.metadata === 'string') {
            resourceData.metadata = JSON.parse(resourceData.metadata);
          }
          const res = resourceData as Resource;
          const meta = res.metadata as Record<string, unknown> | undefined;
          setResource(res);

          if (meta?.processing_status === 'pending' || !meta?.video_id) {
            setIsProcessing(true);
            try {
              await processUrlResource(resourceId);
              const refetch = await window.electron.db.resources.getById(resourceId);
              if (refetch?.success && refetch.data) {
                const d = refetch.data;
                if (d.metadata && typeof d.metadata === 'string') {
                  d.metadata = JSON.parse(d.metadata);
                }
                setResource(d as Resource);
              }
            } catch (err) {
              console.error('Error processing YouTube:', err);
            } finally {
              setIsProcessing(false);
            }
          }
        } else {
          setError(result?.error || 'Resource not found');
        }
      } catch (err) {
        console.error('Error loading resource:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId || typeof window === 'undefined' || !window.electron?.on) return;

    const unsubscribe = window.electron.on(
      'resource:updated',
      ({ id, updates }: { id: string; updates: Partial<Resource> }) => {
        if (id !== resourceId || !updates?.thumbnail_ready) return;
        window.electron.db.resources
          .getById(resourceId)
          .then((result) => {
            if (result?.success && result.data) {
              const data = result.data;
              if (data.metadata && typeof data.metadata === 'string') {
                data.metadata = JSON.parse(data.metadata);
              }
              setResource(data as Resource);
            }
          })
          .catch((err) => console.error('Error re-fetching resource:', err));
      },
    );

    return unsubscribe;
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId || typeof window === 'undefined' || !window.electron?.on) return;

    const unsubscribe = window.electron.on(
      'resource:updated',
      ({ id, updates }: { id: string; updates: Partial<Resource> }) => {
        if (id !== resourceId || !updates || updates.thumbnail_ready) return;
        setResource((prev) => {
          if (!prev) return prev;
          const merged = { ...prev, ...updates };
          if (updates.metadata != null) {
            merged.metadata =
              typeof updates.metadata === 'string'
                ? (JSON.parse(updates.metadata) as Record<string, unknown>)
                : (updates.metadata as Record<string, unknown>);
          }
          return merged;
        });
      },
    );

    return unsubscribe;
  }, [resourceId]);

  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

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
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving metadata:', err);
      return false;
    }
  }, [resource]);

  const handleOpenExternal = useCallback(async () => {
    const url =
      (resource?.metadata as Record<string, unknown>)?.url || resource?.content;
    if (url && typeof url === 'string' && window.electron) {
      await window.electron.invoke('open-external-url', url);
    }
  }, [resource]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-8"
        style={{ background: 'var(--bg)' }}
      >
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--error)' }} />
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
          Error
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
          {error || 'Resource not found'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const metadata = resource.metadata as Record<string, unknown> | undefined;
  const videoId = metadata?.video_id as string | undefined;
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}`
    : null;

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg)' }}>
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resourceId} projectId={resource.project_id} />
        )}

        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {!embedUrl ? (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
              {(metadata?.processing_status === 'processing' || isProcessing) && (
                <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: 'var(--accent)' }} />
              )}
              <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
                {isProcessing ? 'Fetching video metadata...' : 'Video not ready yet.'}
              </p>
              {!isProcessing && (
                <button
                  type="button"
                  onClick={handleProcess}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                >
                  Load Video
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div
                className="flex items-center justify-end px-4 py-3 border-b shrink-0"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="min-w-[44px] min-h-[44px] px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  style={{
                    backgroundColor: 'var(--bg)',
                    color: 'var(--primary-text)',
                    border: '1px solid var(--border)',
                  }}
                  aria-label="Open in YouTube"
                  title="Open in YouTube"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                  Open in YouTube
                </button>
              </div>

              {/* Embedded player */}
              <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <div
                  className="w-full max-w-4xl"
                  style={{ aspectRatio: '16/9' }}
                >
                  <iframe
                    src={embedUrl}
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full rounded-lg"
                    style={{
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  />
                </div>
              </div>
            </>
          )}

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
          isOpen={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
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
