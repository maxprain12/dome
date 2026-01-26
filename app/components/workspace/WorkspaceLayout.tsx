'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import WorkspaceHeader from './WorkspaceHeader';
import SidePanel from './SidePanel';
import MetadataModal from './MetadataModal';
import PDFViewer from '../viewers/PDFViewer';
import VideoPlayer from '../viewers/VideoPlayer';
import AudioPlayer from '../viewers/AudioPlayer';
import ImageViewer from '../viewers/ImageViewer';
import { type Resource } from '@/types';

interface WorkspaceLayoutProps {
  resourceId: string;
}

export default function WorkspaceLayout({ resourceId }: WorkspaceLayoutProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);

  // Load resource data
  useEffect(() => {
    async function loadResource() {
      if (!resourceId || typeof window === 'undefined' || !window.electron) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.db.resources.getById(resourceId);

        if (result.success && result.data) {
          setResource(result.data);
        } else {
          setError(result.error || 'Resource not found');
        }
      } catch (err) {
        console.error('Error loading resource:', err);
        setError(err instanceof Error ? err.message : 'Failed to load resource');
      } finally {
        setIsLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  // Setup event listener for resource updates
  useEffect(() => {
    if (!resourceId || typeof window === 'undefined' || !window.electron) return;

    // Listener: Actualización del recurso actual
    const unsubscribe = window.electron.on('resource:updated',
      ({ id, updates }: { id: string, updates: Partial<Resource> }) => {
        if (id === resourceId && resource) {
          setResource(prev => prev ? { ...prev, ...updates } : prev);
        }
      }
    );

    return unsubscribe;
  }, [resourceId, resource]);

  const handleBack = useCallback(() => {
    // Close the window
    if (typeof window !== 'undefined') {
      window.close();
    }
  }, []);

  const handleToggleSidePanel = useCallback(() => {
    setSidePanelOpen((prev) => !prev);
  }, []);

  const handleShowMetadata = useCallback(() => {
    setShowMetadata(true);
  }, []);

  const handleSaveMetadata = useCallback(async (updates: Partial<Resource>): Promise<boolean> => {
    if (!resource || typeof window === 'undefined' || !window.electron) {
      return false;
    }

    try {
      const updatedResource = {
        ...resource,
        ...updates,
        updated_at: Date.now(),
      };

      const result = await window.electron.db.resources.update(updatedResource);

      if (result.success) {
        // NO actualizar estado aquí - el listener se encargará
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error saving metadata:', err);
      return false;
    }
  }, [resource]);

  // Render the appropriate viewer based on resource type
  const renderViewer = () => {
    if (!resource) return null;

    switch (resource.type) {
      case 'pdf':
        return <PDFViewer resource={resource} />;
      case 'video':
        return <VideoPlayer resource={resource} />;
      case 'audio':
        return <AudioPlayer resource={resource} />;
      case 'image':
        return <ImageViewer resource={resource} />;
      case 'document':
        // For general documents, try to use PDF viewer or show a placeholder
        return <PDFViewer resource={resource} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--tertiary)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--primary)' }}>
              Unsupported file type
            </p>
            <p className="text-sm" style={{ color: 'var(--secondary)' }}>
              This resource type ({resource.type}) cannot be previewed in the workspace.
            </p>
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: 'var(--brand-primary)' }}
          />
          <p className="text-sm" style={{ color: 'var(--secondary)' }}>
            Loading workspace...
          </p>
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
        <AlertCircle className="w-16 h-16 mb-4 text-red-500" />
        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--primary)' }}>
          Failed to load resource
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--secondary)' }}>
          {error || 'The requested resource could not be found.'}
        </p>
        <button
          onClick={handleBack}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            background: 'var(--brand-primary)',
            color: 'white',
          }}
        >
          Close Window
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
        onToggleSidePanel={handleToggleSidePanel}
        onShowMetadata={handleShowMetadata}
        onBack={handleBack}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Viewer */}
        <div className="flex-1 overflow-hidden">
          {renderViewer()}
        </div>

        {/* Side Panel */}
        <SidePanel
          resourceId={resourceId}
          resource={resource}
          isOpen={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
        />
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
