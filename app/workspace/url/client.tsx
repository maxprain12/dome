'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import URLViewer from '@/components/viewers/URLViewer';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { processUrlResource } from '@/lib/web/processor';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import type { Resource } from '@/types';

interface URLWorkspaceClientProps {
  resourceId: string;
}

export default function URLWorkspaceClient({ resourceId }: URLWorkspaceClientProps) {
  const { t } = useTranslation();
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [urlProcessBusy, setUrlProcessBusy] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const navigate = useNavigate();

  const runUrlProcess = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.web?.process) return;
    setUrlProcessBusy(true);
    try {
      const result = await processUrlResource(resourceId);
      if (result.success) {
        const resourceResult = await window.electron.db.resources.getById(resourceId);
        if (resourceResult?.success && resourceResult.data) {
          const resourceData = resourceResult.data;
          if (resourceData.metadata && typeof resourceData.metadata === 'string') {
            resourceData.metadata = JSON.parse(resourceData.metadata);
          }
          setResource(resourceData as Resource);
        }
      }
    } catch (err) {
      console.error('Error processing URL resource:', err);
    } finally {
      setUrlProcessBusy(false);
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
          // Parse metadata if it's a string
          const resourceData = result.data;
          if (resourceData.metadata && typeof resourceData.metadata === 'string') {
            resourceData.metadata = JSON.parse(resourceData.metadata);
          }
          setResource(resourceData as Resource);
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

  // Re-fetch resource when thumbnail is ready (web:process avoids broadcasting thumbnail_data to prevent OOM)
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
              const resourceData = result.data;
              if (resourceData.metadata && typeof resourceData.metadata === 'string') {
                resourceData.metadata = JSON.parse(resourceData.metadata);
              }
              setResource(resourceData as Resource);
            }
          })
          .catch((err) => console.error('Error re-fetching resource for thumbnail:', err));
      },
    );

    return unsubscribe;
  }, [resourceId]);

  // Merge metadata/title updates from resource:updated (lightweight, no thumbnail_data)
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

  // Set selected sources to current resource when opening (for Studio generation)
  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  // Schedule indexing when article has scraped_content (embeddings generated later, like notes)
  const hasScheduledIndex = useRef(false);
  useEffect(() => {
    if (!resource || !window.electron?.resource?.scheduleIndex) return;
    if (hasScheduledIndex.current) return;

    const metadata = resource.metadata as Record<string, unknown> | undefined;
    const processingStatus = metadata?.processing_status;
    const scrapedContent = metadata?.scraped_content;
    const isYouTube = metadata?.url_type === 'youtube' || !!metadata?.video_id;

    if (
      processingStatus === 'completed' &&
      typeof scrapedContent === 'string' &&
      scrapedContent.length >= 50 &&
      !isYouTube
    ) {
      hasScheduledIndex.current = true;
      window.electron.resource.scheduleIndex(resource.id).catch((err: unknown) =>
        console.warn('[URLWorkspace] Failed to schedule indexing:', err)
      );
    }
  }, [resource]);

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

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-full"
        style={{ background: 'var(--dome-bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dome-accent)' }} />
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>{t('workspace.loading_resources')}</p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-full p-8"
        style={{ background: 'var(--dome-bg)' }}
      >
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--dome-error, #ef4444)' }} />
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
          {t('workspace.error_loading')}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--dome-text-muted)' }}>
          {error || t('workspace.no_resources')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--dome-accent)', color: 'var(--base-text)' }}
        >
          {t('workspace.home')}
        </button>
      </div>
    );
  }

  const meta = resource.metadata as Record<string, unknown> | undefined;
  const pageUrl =
    (typeof meta?.url === 'string' && meta.url.length > 0 ? meta.url : null) ||
    (typeof resource.content === 'string' && resource.content.length > 0 ? resource.content : null);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header — solo título + índice + paneles + más (acciones web en el visor) */}
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sources Panel */}
        {sourcesPanelOpen && resource && (
          <SourcesPanel
            resourceId={resourceId}
            projectId={resource.project_id}
          />
        )}

        {/* Viewer - min-h-0 allows flex child to shrink and fill available space */}
        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          <URLViewer
            resource={resource}
            onRunUrlProcess={runUrlProcess}
            pageUrl={pageUrl}
            processBusy={urlProcessBusy}
          />

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
          isOpen={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
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
