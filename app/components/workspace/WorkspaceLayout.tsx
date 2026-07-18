import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import WorkspaceHeader from './WorkspaceHeader';
import WorkspaceInspector, { type WorkspaceInspectorTab } from './WorkspaceInspector';
import StudioOutputViewer from './StudioOutputViewer';
import MetadataModal from './MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { type Resource } from '@/types';
import { mergeResourceOnBroadcast } from '@/lib/utils/resource-metadata';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

const PDFViewer = lazy(() => import('../viewers/PDFViewer'));
const VideoPlayer = lazy(() => import('../viewers/VideoPlayer'));
const AudioPlayer = lazy(() => import('../viewers/AudioPlayer'));
const ImageViewer = lazy(() => import('../viewers/ImageViewer'));
const DocxViewer = lazy(() => import('../viewers/DocxViewer'));
const SpreadsheetViewer = lazy(() => import('../viewers/SpreadsheetViewer'));
const PptViewerLazy = lazy(() => import('../viewers/PptViewer'));
const ArtifactWorkspaceClient = lazy(() => import('../artifacts/ArtifactWorkspaceClient'));

interface WorkspaceLayoutProps {
  resourceId: string;
  initialPage?: number;
}

function isDocumentPdfResource(res: Resource): boolean {
  const mimeType = res.file_mime_type || '';
  const filename = (res.original_filename || res.title || '').toLowerCase();
  return mimeType === 'application/pdf' || filename.endsWith('.pdf');
}

function WorkspaceResourceViewer({ resource, initialPage }: { resource: Resource; initialPage?: number }) {
  switch (resource.type) {
    case 'pdf':
      return <PDFViewer key={resource.id} resource={resource} initialPage={initialPage} />;
    case 'video':
      return <VideoPlayer key={resource.id} resource={resource} />;
    case 'audio':
      return <AudioPlayer key={resource.id} resource={resource} />;
    case 'image':
      return <ImageViewer key={resource.id} resource={resource} />;
    case 'excel':
      return <SpreadsheetViewer key={resource.id} resource={resource} />;
    case 'ppt':
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <HugeiconsIcon icon={Loading03Icon} className="mb-4 size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Abriendo presentación...
          </p>
        </div>
      );
    case 'artifact':
      return (
        <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">
          <ArtifactWorkspaceClient resourceId={resource.id} />
        </div>
      );
    case 'url':
    case 'notebook': {
      const metadata = typeof resource.metadata === 'string'
        ? (() => { try { return JSON.parse(resource.metadata || '{}'); } catch { return {}; } })()
        : (resource.metadata || {});
      const isYouTube = metadata.url_type === 'youtube' || !!metadata.video_id;

      const routeMap: Record<string, string> = {
        url: isYouTube ? `/workspace/youtube?id=${resource.id}` : `/workspace/url?id=${resource.id}`,
        notebook: `/workspace/notebook?id=${resource.id}`,
      };
      const route = routeMap[resource.type] || `/workspace?id=${resource.id}`;

      if (typeof window !== 'undefined') {
        window.location.hash = `#${route}`;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <HugeiconsIcon icon={Loading03Icon} className="mb-4 size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Redirecting to {resource.type} viewer...
          </p>
        </div>
      );
    }
    case 'document': {
      const mime = resource.file_mime_type || '';
      const name = (resource.original_filename || resource.title || '').toLowerCase();
      if (mime.includes('spreadsheetml') || /\.(xlsx|xls|csv)$/.test(name)) {
        return <SpreadsheetViewer key={resource.id} resource={resource} />;
      }
      if (mime.includes('wordprocessingml') || /\.(docx|doc)$/.test(name)) {
        return <DocxViewer key={resource.id} resource={resource} />;
      }
      if (mime.includes('presentationml') || /\.(pptx|ppt)$/.test(name)) {
        return <PptViewerLazy key={resource.id} resource={resource} activeIndex={0} />;
      }
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <HugeiconsIcon icon={AlertCircleIcon} className="mb-4 size-12 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">
            Unsupported file type
          </p>
          <p className="text-sm text-muted-foreground">
            This resource type ({resource.type}) cannot be previewed in the workspace.
          </p>
        </div>
      );
    }
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <HugeiconsIcon icon={AlertCircleIcon} className="mb-4 size-12 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">
            Unsupported file type
          </p>
          <p className="text-sm text-muted-foreground">
            This resource type ({resource.type}) cannot be previewed in the workspace.
          </p>
        </div>
      );
  }
}

export default function WorkspaceLayout({ resourceId, initialPage }: WorkspaceLayoutProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<WorkspaceInspectorTab>('details');
  const [showMetadata, setShowMetadata] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setContext = useManyStore((s) => s.setContext);
  const isNarrow = useIsMobile();
  const prevContextKeyRef = useRef<string | null>(null);

  // Load resource data
  useEffect(() => {
    let cancelled = false;

    async function loadResource() {
      if (!resourceId || typeof window === 'undefined' || !window.electron) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.db.resources.getById(resourceId);

        if (cancelled) return;

        if (result.success && result.data) {
          setResource(result.data);
          if (result.data.type === 'ppt') {
            const { activeTabId, replaceTabType } = useTabStore.getState();
            replaceTabType(activeTabId, 'ppt');
          }
        } else {
          setError(result.error || 'Resource not found');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading resource:', err);
        setError(err instanceof Error ? err.message : 'Failed to load resource');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadResource();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount via key={resourceId} on parent
  }, []);

  // Update Many context when resource loads (ensures ManyFloatingButton has current resource)
  useEffect(() => {
    return () => setContext(null, null);
  }, [setContext]);

  if (resource) {
    const contextKey = `${resourceId}:${resource.title}`;
    if (contextKey !== prevContextKeyRef.current) {
      prevContextKeyRef.current = contextKey;
      setContext(resourceId, resource.title);
    }
  }

  // Setup event listener for resource updates
  useEffect(() => {
    if (!resourceId || typeof window === 'undefined' || !window.electron) return;

    const unsubscribe = window.electron.on('resource:updated', (payload: unknown) => {
      setResource((prev) => {
        if (!prev || (payload as { id?: string }).id !== resourceId) return prev;
        return mergeResourceOnBroadcast(prev, payload);
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [resourceId]);

  // Modo multimedia: menos paneles al abrir audio/vídeo (workspace más limpio)
  useEffect(() => {
    if (!resource) return;
    if (resource.type !== 'audio' && resource.type !== 'video') return;
    const app = useAppStore.getState();
    app.setSourcesPanelOpen(false);
    if (app.studioPanelOpen) app.toggleStudioPanel();
  }, [resource]);

  const handleToggleSidePanel = useCallback(() => {
    setSidePanelOpen((prev) => {
      const next = !prev;
      if (next) setInspectorTab('relations');
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sourcesPanelOpen) return;
    setInspectorTab('sources');
    setSidePanelOpen(false);
    if (useAppStore.getState().studioPanelOpen) {
      useAppStore.setState({ studioPanelOpen: false });
    }
  }, [sourcesPanelOpen]);

  useEffect(() => {
    if (!studioPanelOpen) return;
    setInspectorTab('outputs');
    setSidePanelOpen(false);
    useAppStore.getState().setSourcesPanelOpen(false);
  }, [studioPanelOpen]);

  const inspectorOpen = sidePanelOpen || sourcesPanelOpen || studioPanelOpen;
  const closeInspector = useCallback(() => {
    setSidePanelOpen(false);
    useAppStore.getState().setSourcesPanelOpen(false);
    useAppStore.setState({ studioPanelOpen: false });
  }, []);

  const selectInspectorTab = useCallback((tab: WorkspaceInspectorTab) => {
    setInspectorTab(tab);
    setSidePanelOpen(tab === 'details' || tab === 'relations');
    useAppStore.getState().setSourcesPanelOpen(tab === 'sources');
    useAppStore.setState({ studioPanelOpen: tab === 'outputs' });
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

  const _handleOpenExternally = useCallback(async () => {
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

  // Render the appropriate viewer based on resource type
  const renderViewer = () => {
    if (!resource) return null;

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-primary" />
          </div>
        }
      >
        <WorkspaceResourceViewer key={resource.id} resource={resource} initialPage={initialPage} />
      </Suspense>
    );
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-full animate-in fade-in bg-background"
      >
        <div className="flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <HugeiconsIcon icon={Loading03Icon} className="size-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Loading workspace...
          </p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-full p-8 animate-in fade-in bg-background"
      >
        <div className="flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-16 shrink-0 text-muted-foreground" />
          <h1 className="text-xl font-display font-semibold text-center text-foreground">
            Failed to load resource
          </h1>
          <p className="text-sm text-center mb-6 max-w-md text-muted-foreground">
            {error ?? 'The requested resource could not be found.'}
          </p>
          <Button
            type="button"
            onClick={() => { if (typeof window !== 'undefined') window.close(); }}
            
          >
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={handleToggleSidePanel}
        onShowMetadata={handleShowMetadata}
        mediaFocusMode={resource.type === 'audio' || resource.type === 'video'}
      />

      {/* Main Content + a single contextual inspector */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="workspace-viewer" minSize={420}>
          <div className="relative h-full overflow-hidden">
            {renderViewer()}
            {activeStudioOutput ? (
              <StudioOutputViewer output={activeStudioOutput} onClose={() => setActiveStudioOutput(null)} />
            ) : null}
          </div>
        </ResizablePanel>

        {inspectorOpen && !isNarrow ? (
          <>
            <ResizableHandle aria-label="Redimensionar inspector" />
            <ResizablePanel id="workspace-inspector" defaultSize={360} minSize={300} maxSize={520} groupResizeBehavior="preserve-pixel-size">
              <WorkspaceInspector
                resource={resource}
                activeTab={inspectorTab}
                onActiveTabChange={selectInspectorTab}
                onClose={closeInspector}
                onEditMetadata={handleShowMetadata}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      {isNarrow ? (
        <Sheet open={inspectorOpen} onOpenChange={(open) => { if (!open) closeInspector(); }}>
          <SheetContent side="right" showCloseButton={false} className="w-[min(92vw,28rem)] p-0">
            <SheetTitle className="sr-only">Inspector</SheetTitle>
            <SheetDescription className="sr-only">{resource.title}</SheetDescription>
            <WorkspaceInspector
              resource={resource}
              activeTab={inspectorTab}
              onActiveTabChange={selectInspectorTab}
              onClose={closeInspector}
              onEditMetadata={handleShowMetadata}
            />
          </SheetContent>
        </Sheet>
      ) : null}

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
