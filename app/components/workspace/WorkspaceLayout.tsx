import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, File, ExternalLink } from 'lucide-react';
import WorkspaceHeader from './WorkspaceHeader';
import SidePanel from './SidePanel';
import SourcesPanel from './SourcesPanel';
import StudioPanel from './StudioPanel';
import GraphPanel from './GraphPanel';
import StudioOutputViewer from './StudioOutputViewer';
import MetadataModal from './MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { type Resource } from '@/types';

const PDFViewer = lazy(() => import('../viewers/PDFViewer'));
const VideoPlayer = lazy(() => import('../viewers/VideoPlayer'));
const AudioPlayer = lazy(() => import('../viewers/AudioPlayer'));
const ImageViewer = lazy(() => import('../viewers/ImageViewer'));
const DocxViewer = lazy(() => import('../viewers/DocxViewer'));
const SpreadsheetViewer = lazy(() => import('../viewers/SpreadsheetViewer'));

interface WorkspaceLayoutProps {
  resourceId: string;
}

export default function WorkspaceLayout({ resourceId }: WorkspaceLayoutProps) {
  const navigate = useNavigate();
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setContext = useManyStore((s) => s.setContext);

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

  // Update Many context when resource loads (ensures ManyFloatingButton has current resource)
  useEffect(() => {
    if (resource) {
      setContext(resourceId, resource.title);
    }
    return () => setContext(null, null);
  }, [resourceId, resource, setContext]);

  // Set selected sources to current resource when opening workspace (for Studio generation)
  useEffect(() => {
    if (resourceId && typeof window !== 'undefined' && window.electron) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
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

  const handleOpenExternally = useCallback(async () => {
    if (!resource || typeof window === 'undefined' || !window.electron) return;
    try {
      const result = await window.electron.resource.getFilePath(resource.id);
      if (result.success && result.data) {
        await window.electron.openPath(result.data);
      }
    } catch (err) {
      console.error('Failed to open file externally:', err);
    }
  }, [resource]);

  // Check if a document resource is actually a PDF
  const isDocumentPdf = (res: Resource): boolean => {
    const mimeType = res.file_mime_type || '';
    const filename = (res.original_filename || res.title || '').toLowerCase();
    return mimeType === 'application/pdf' || filename.endsWith('.pdf');
  };

  // Render the appropriate viewer based on resource type
  const renderViewer = () => {
    if (!resource) return null;

    const ViewerComponent = () => {
      switch (resource.type) {
        case 'pdf':
          return <PDFViewer resource={resource} />;
        case 'video':
          return <VideoPlayer resource={resource} />;
        case 'audio':
          return <AudioPlayer resource={resource} />;
        case 'image':
          return <ImageViewer resource={resource} />;
        case 'excel':
          return <SpreadsheetViewer resource={resource} />;
        case 'ppt':
          navigate(`/workspace/ppt?id=${resource.id}`, { replace: true });
          return (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                Abriendo presentación...
              </p>
            </div>
          );
        case 'document': {
          if (isDocumentPdf(resource)) {
            return <PDFViewer resource={resource} />;
          }

          const filename = (resource.original_filename || resource.title || '').toLowerCase();
          const mime = resource.file_mime_type || '';
          const isPptx = filename.endsWith('.pptx') || filename.endsWith('.ppt') || mime.includes('presentationml') || mime.includes('ms-powerpoint');

          // PPTX / PPT — redirect to PPT workspace
          if (isPptx) {
            navigate(`/workspace/ppt?id=${resource.id}`, { replace: true });
            return (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                  Abriendo presentación...
                </p>
              </div>
            );
          }

          const isDocx = filename.endsWith('.docx') || filename.endsWith('.doc') || mime.includes('wordprocessingml') || mime.includes('msword') || !resource.internal_path;

          // DOCX / DOC — redirect to editable workspace (incl. AI-created document without file)
          if (isDocx) {
            navigate(`/workspace/docx?id=${resource.id}`, { replace: true });
            return (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                  Abriendo documento...
                </p>
              </div>
            );
          }

          // XLSX / XLS
          if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || mime.includes('spreadsheetml') || mime.includes('ms-excel')) {
            return <SpreadsheetViewer resource={resource} />;
          }

          // CSV
          if (filename.endsWith('.csv') || mime === 'text/csv') {
            return <SpreadsheetViewer resource={resource} />;
          }

          // Fallback for unsupported document types
          return (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <File className="w-16 h-16 mb-4" style={{ color: 'var(--tertiary-text)' }} />
              <p className="text-lg font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
                {resource.original_filename || resource.title}
              </p>
              <p className="text-sm mb-6" style={{ color: 'var(--secondary-text)' }}>
                This document type cannot be previewed. Open it with your default application.
              </p>
              <button
                onClick={handleOpenExternally}
                className="btn btn-primary flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Open with default app
              </button>
            </div>
          );
        }
        case 'note':
        case 'url':
        case 'notebook': {
          const metadata = typeof resource.metadata === 'string'
            ? (() => { try { return JSON.parse(resource.metadata || '{}'); } catch { return {}; } })()
            : (resource.metadata || {});
          const isYouTube = metadata.url_type === 'youtube' || !!metadata.video_id;

          const routeMap: Record<string, string> = {
            note: `/workspace/note?id=${resource.id}`,
            url: isYouTube ? `/workspace/youtube?id=${resource.id}` : `/workspace/url?id=${resource.id}`,
            notebook: `/workspace/notebook?id=${resource.id}`,
          };
          const route = routeMap[resource.type] || `/workspace?id=${resource.id}`;

          if (typeof window !== 'undefined') {
            window.location.hash = `#${route}`;
          }

          return (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                Redirecting to {resource.type} viewer...
              </p>
            </div>
          );
        }
        default:
          return (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--tertiary-text)' }} />
              <p className="text-lg font-medium" style={{ color: 'var(--primary-text)' }}>
                Unsupported file type
              </p>
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                This resource type ({resource.type}) cannot be previewed in the workspace.
              </p>
            </div>
          );
      }
    };

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        }
      >
        <ViewerComponent />
      </Suspense>
    );
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen animate-in"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-5 animate-slide-up">
          <Loader2
            className="w-10 h-10 animate-spin"
            style={{ color: 'var(--accent)' }}
          />
          <p className="text-sm font-medium" style={{ color: 'var(--secondary-text)' }}>
            Loading workspace...
          </p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-8 animate-in"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-5 animate-slide-up">
          <AlertCircle className="w-16 h-16 shrink-0" style={{ color: 'var(--error)' }} />
          <h1 className="text-xl font-display font-semibold text-center" style={{ color: 'var(--primary-text)' }}>
            Failed to load resource
          </h1>
          <p className="text-sm text-center mb-6 max-w-md" style={{ color: 'var(--secondary-text)' }}>
            {error ?? 'The requested resource could not be found.'}
          </p>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.close(); }}
            className="btn btn-primary"
          >
            Close Window
          </button>
        </div>
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
          {renderViewer()}

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
