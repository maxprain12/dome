import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import HubListState from '@/components/ui/HubListState';
import DomeButton from '@/components/ui/DomeButton';
import { useTabStore, HOME_TAB_ID, type DomeTab } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceSplitView from '@/components/workspace/WorkspaceSplitView';
import TabPaneShell, { TabContentReadyNotifier } from '@/components/shell/TabPaneShell';

// Lazy-load heavy workspace components
const WorkspaceClient = lazy(() => import('@/workspace/[[...params]]/client'));
const NotebookWorkspaceClient = lazy(() => import('@/workspace/notebook/[[...params]]/client'));
const URLWorkspaceClient = lazy(() => import('@/workspace/url/client'));
const YouTubeWorkspaceClient = lazy(() => import('@/workspace/youtube/client'));
const NoteWorkspaceClient = lazy(() => import('@/workspace/note/[[...params]]/client'));
const PptWorkspaceClient = lazy(() => import('@/workspace/ppt/client'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const GitHubView = lazy(() => import('@/components/github/GitHubView'));
const EmailView = lazy(() => import('@/components/email/EmailView'));
import { loadManyPanelModule, type ManyPanelComponent } from '@/components/many/manyPanelModule';
const HomePage = lazy(() => import('@/pages/HomePage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const LearnPage = lazy(() => import('@/components/learn/LearnPage'));
const LearnTabShell = lazy(() => import('@/components/learn/LearnTabShell'));
const TagsPage = lazy(() => import('@/components/home/TagBrowser'));
const MarketplacePage = lazy(() => import('@/components/marketplace/MarketplaceView'));
const PipelinesBoard = lazy(() => import('@/components/pipelines/PipelinesBoard'));
const FolderTabView = lazy(() => import('@/components/shell/FolderTabView'));
const TranscriptionsListPage = lazy(() => import('@/components/transcription/TranscriptionsListPage'));
const TranscriptionDetailPage = lazy(() => import('@/components/transcription/TranscriptionDetailPage'));
const SemanticGraphView = lazy(() => import('@/components/semantic-graph/SemanticGraphView'));
const ArtifactTabView = lazy(() => import('@/components/shell/ArtifactTabView'));
const ArtifactWorkspaceClient = lazy(() => import('@/components/artifacts/ArtifactWorkspaceClient'));

function Loading() {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-1 items-center justify-center h-full min-h-[120px]"
      style={{ background: 'var(--dome-bg)' }}
      data-tab-loading
    >
      <HubListState variant="loading" loadingLabel={t('common.loading')} compact />
    </div>
  );
}

const SUSPENSE_TIMEOUT_MS = 15_000;

function LoadingWithTimeout() {
  const { t } = useTranslation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), SUSPENSE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  if (timedOut) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 h-full min-h-[120px] px-6 text-center" style={{ background: 'var(--dome-bg)' }}>
        <HubListState
          variant="empty"
          title={t('common.loading_timeout_title')}
          description={t('common.loading_timeout_message')}
          compact
        />
        <DomeButton
          variant="secondary"
          size="sm"
          onClick={() => useTabStore.getState().activateTab(HOME_TAB_ID)}
        >
          {t('common.go_home')}
        </DomeButton>
      </div>
    );
  }

  return <Loading />;
}

function SuspenseWithTimeout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingWithTimeout />}>
      {children}
    </Suspense>
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
  const [ManyPanelComp, setManyPanelComp] = useState<ManyPanelComponent | null>(null);

  useEffect(() => {
    if (sessionId) useManyStore.getState().switchSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void loadManyPanelModule().then((m) => {
      if (!cancelled) setManyPanelComp(() => m.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ManyPanelComp) {
    return <Loading />;
  }

  return <ManyPanelComp width={0} onClose={onClose} isVisible isFullscreen />;
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
  const closeTab = useTabStore((s) => s.closeTab);

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
            <div className="flex flex-col h-full min-w-0 w-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
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

    case 'github':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <GitHubView />
            </div>
          </Suspense>
        </ErrorBoundary>
      );

    case 'email':
      return (
        <ErrorBoundary>
          <SuspenseWithTimeout>
            <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <EmailView />
            </div>
          </SuspenseWithTimeout>
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

    // Pipelines unifies the former agents/workflows/automations/runs tabs.
    // The deprecated tab types fall through to the same board so any persisted
    // tabs from before the migration keep rendering.
    case 'pipelines':
    case 'agents':
    case 'workflows':
    case 'automations':
    case 'runs':
      return (
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <PipelinesBoard />
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
      // Persisted artifact opened from the sidebar
      if (tab.resourceId) {
        return (
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <ArtifactWorkspaceClient resourceId={tab.resourceId} />
            </Suspense>
          </ErrorBoundary>
        );
      }
      // Transient chat artifact (existing behaviour — no resourceId)
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
  if (!splitResource) {
    return (
      <>
        <TabContent tab={tab} />
        <TabContentReadyNotifier />
      </>
    );
  }

  const referenceTab: DomeTab = {
    id: `${tab.id}:split`,
    type: getResourceTabType(splitResource.resourceType),
    title: splitResource.title,
    resourceId: splitResource.resourceId,
  };

  return (
    <>
      <WorkspaceSplitView
        tab={tab}
        primary={<TabContent tab={tab} />}
        reference={<TabContent tab={referenceTab} referenceMode />}
      />
      <TabContentReadyNotifier />
    </>
  );
}

/**
 * Tab types that keep mounted when inactive (hidden via CSS).
 * Only chat needs keep-alive (active agent run / streaming). Other hub tabs remount on
 * activation — same pattern as resource tabs — to avoid N heavy trees in memory.
 */
const PERSISTENT_TAB_TYPES = new Set(['chat']);

export default function ContentRouter() {
  const { tabs, activeTabId } = useTabStore(
    useShallow((s) => ({ tabs: s.tabs, activeTabId: s.activeTabId })),
  );
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Defensive: activeTabId is orphaned (e.g. stale localStorage after a tab was removed).
  useLayoutEffect(() => {
    if (!activeTab) {
      const state = useTabStore.getState();
      if (state.tabs.length === 0) {
        state.closeAllTabsToHome();
        return;
      }
      const fallback = state.tabs.find((t) => t.id === HOME_TAB_ID) ?? state.tabs[0];
      if (fallback) state.activateTab(fallback.id);
    }
  }, [activeTab]);

  if (!activeTab) return <Loading />;

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ background: 'var(--dome-surface)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isPersistent = PERSISTENT_TAB_TYPES.has(tab.type);
        if (!isActive && !isPersistent) return null;

        return (
          <TabPaneShell
            key={tab.id}
            tabId={tab.id}
            isActive={isActive}
            isPersistent={isPersistent}
          >
            <ErrorBoundary>
              <TabContentWithSplit tab={tab} />
            </ErrorBoundary>
          </TabPaneShell>
        );
      })}
    </div>
  );
}
