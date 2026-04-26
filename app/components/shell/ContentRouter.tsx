import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HubListState from '@/components/ui/HubListState';
import { useTabStore, type DomeTab } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceSplitView from '@/components/workspace/WorkspaceSplitView';

// Lazy-load heavy workspace components
const WorkspaceClient = lazy(() => import('@/workspace/[[...params]]/client'));
const NotebookWorkspaceClient = lazy(() => import('@/workspace/notebook/[[...params]]/client'));
const URLWorkspaceClient = lazy(() => import('@/workspace/url/client'));
const YouTubeWorkspaceClient = lazy(() => import('@/workspace/youtube/client'));
const NoteWorkspaceClient = lazy(() => import('@/workspace/note/[[...params]]/client'));
const PptWorkspaceClient = lazy(() => import('@/workspace/ppt/client'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const ManyPanel = lazy(() => import('@/components/many/ManyPanel'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const LearnPage = lazy(() => import('@/components/learn/LearnPage'));
const LearnTabShell = lazy(() => import('@/components/learn/LearnTabShell'));
const TagsPage = lazy(() => import('@/components/home/TagBrowser'));
const MarketplacePage = lazy(() => import('@/components/marketplace/MarketplaceView'));
const AgentsPage = lazy(() => import('@/components/automations/AutomationsHubView'));
const FolderTabView = lazy(() => import('@/components/shell/FolderTabView'));
const TranscriptionsListPage = lazy(() => import('@/components/transcription/TranscriptionsListPage'));
const TranscriptionDetailPage = lazy(() => import('@/components/transcription/TranscriptionDetailPage'));
const SemanticGraphView = lazy(() => import('@/components/semantic-graph/SemanticGraphView'));
const ArtifactTabView = lazy(() => import('@/components/shell/ArtifactTabView'));

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center h-full min-h-[120px]" style={{ background: 'var(--dome-bg)' }}>
      <HubListState variant="loading" loadingLabel={t('common.loading')} compact />
    </div>
  );
}

function NoResource() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center h-full min-h-[120px]" style={{ background: 'var(--dome-bg)' }}>
      <HubListState variant="empty" title={t('common.noResourceSelected')} compact />
    </div>
  );
}

function ChatTabView({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  useEffect(() => {
    if (sessionId) useManyStore.getState().switchSession(sessionId);
  }, [sessionId]);

  return (
    <Suspense fallback={<Loading />}>
      <ManyPanel width={0} onClose={onClose} isVisible isFullscreen />
    </Suspense>
  );
}

function getResourceTabType(resourceType: string): DomeTab['type'] {
  const typeMap: Record<string, DomeTab['type']> = {
    note: 'note',
    notebook: 'notebook',
    url: 'url',
    youtube: 'youtube',
    docx: 'docx',
    ppt: 'ppt',
    document: 'resource',
    pdf: 'resource',
    image: 'resource',
    audio: 'resource',
    video: 'resource',
    excel: 'resource',
  };
  return typeMap[resourceType] ?? 'resource';
}

function TabContent({ tab, referenceMode = false }: { tab: DomeTab; referenceMode?: boolean }) {
  const { closeTab } = useTabStore();

  switch (tab.type) {
    case 'home':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <HomePage />
          </Suspense>
        </ErrorBoundary>
      );

    case 'projects':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <ProjectsPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'note':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <NoteWorkspaceClient resourceId={tab.resourceId} readOnly={referenceMode} compact={referenceMode} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'notebook':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <NotebookWorkspaceClient resourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'resource':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <WorkspaceClient resourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'url':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <URLWorkspaceClient resourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'youtube':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <YouTubeWorkspaceClient resourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'ppt':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <PptWorkspaceClient resourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'settings':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <SettingsPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'calendar':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <CalendarPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'chat':
      return (
        <ErrorBoundary>
          <ChatTabView sessionId={tab.resourceId ?? ''} onClose={() => closeTab(tab.id)} />
        </ErrorBoundary>
      );

    case 'learn':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'studio':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnTabShell initialSection="all" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'flashcards':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnTabShell initialSection="decks" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'tags':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <TagsPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'marketplace':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <MarketplacePage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'agents':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AgentsPage shellHubTab="agents" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'workflows':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AgentsPage shellHubTab="workflows" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'automations':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AgentsPage shellHubTab="automations" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'runs':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AgentsPage shellHubTab="runs" />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'folder':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <FolderTabView folderId={tab.resourceId} folderTitle={tab.title} />
          </Suspense>
        </ErrorBoundary>
      );

    case 'transcriptions':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <TranscriptionsListPage />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'transcription-detail':
      if (!tab.resourceId) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <TranscriptionDetailPage noteId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'semantic-graph':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <SemanticGraphView focusResourceId={tab.resourceId} />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'artifact':
      if (!tab.artifactPayload) return <NoResource />;
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <ArtifactTabView rawJson={tab.artifactPayload} />
          </Suspense>
        </ErrorBoundary>
      );

    default:
      return <NoResource />;
  }
}

function TabContentWithSplit({ tab }: { tab: DomeTab }) {
  const splitResource = tab.splitOpen ? tab.splitResource : undefined;
  if (!splitResource) return <TabContent tab={tab} />;

  const referenceTab: DomeTab = {
    id: `${tab.id}:split`,
    type: getResourceTabType(splitResource.resourceType),
    title: splitResource.title,
    resourceId: splitResource.resourceId,
  };

  return (
    <WorkspaceSplitView
      tab={tab}
      primary={<TabContent tab={tab} />}
      reference={<TabContent tab={referenceTab} referenceMode />}
    />
  );
}

/**
 * Tab types that keep their component mounted even when not active (hidden behind CSS).
 * These tabs have expensive stateful UI (chat streams, live feeds) that must survive
 * switching away. All other tabs ("content tabs") are unmounted when inactive and
 * remounted fresh on activation — exactly like DenchClaw's workspace model.
 */
const PERSISTENT_TAB_TYPES = new Set([
  'home',
  'projects',
  'chat',
  'learn',
  'studio',
  'flashcards',
  'tags',
  'marketplace',
  'agents',
  'workflows',
  'automations',
  'runs',
  'settings',
  'calendar',
  'transcriptions',
]);

export default function ContentRouter() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) return <Loading />;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ background: 'var(--dome-surface)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isPersistent = PERSISTENT_TAB_TYPES.has(tab.type);
        return (
          <div
            key={tab.id}
            className={isActive ? 'flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden' : 'hidden'}
            aria-hidden={!isActive}
          >
            {/* Content tabs (notes, files, folders) unmount when inactive so every
                activation gets a fresh load from the DB — the DenchClaw pattern.
                Persistent tabs (chat, home, …) stay mounted to preserve streaming state. */}
            {(isActive || isPersistent) && (
              isActive ? <TabContentWithSplit tab={tab} /> : <TabContent tab={tab} />
            )}
          </div>
        );
      })}
    </div>
  );
}
