'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import URLViewer from '@/components/viewers/URLViewer';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
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
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  const navigate = useNavigate();

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
        className="flex items-center justify-center min-h-screen"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Loading resource...</p>
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

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
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

        {/* Viewer */}
        <div className="flex-1 overflow-hidden relative">
          <URLViewer resource={resource} />

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
          <StudioPanel projectId={resource.project_id} />
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
