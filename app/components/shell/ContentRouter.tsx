import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import HubListState from '@/components/ui/HubListState';
import DomeButton from '@/components/ui/DomeButton';
import { useTabStore, HOME_TAB_ID, type DomeTab } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
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
const SocialHubView = lazy(() => import('@/components/social/SocialHubView'));
import { loadManyPanelModule, type ManyPanelComponent } from '@/components/many/manyPanelModule';
const HomePage = lazy(() => import('@/pages/HomePage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const LearnPage = lazy(() => import('@/components/learn/LearnPage'));
const LearnTabShell = lazy(() => import('@/components/learn/LearnTabShell'));
const MarketplacePage = lazy(() => import('@/components/marketplace/MarketplaceView'));
const PipelinesBoard = lazy(() => import('@/components/pipelines/PipelinesBoard'));
const AgentsStudioView = lazy(() => import('@/components/orchestration/AgentsStudioView'));
const WorkflowsStudioView = lazy(() => import('@/components/orchestration/WorkflowsStudioView'));
const AutomationsStudioView = lazy(() => import('@/components/orchestration/AutomationsStudioView'));
const RunsStudioView = lazy(() => import('@/components/orchestration/RunsStudioView'));
const FolderTabView = lazy(() => import('@/components/shell/FolderTabView'));
const TranscriptionsListPage = lazy(() => import('@/components/transcription/TranscriptionsListPage'));
const TranscriptionDetailPage = lazy(() => import('@/components/transcription/TranscriptionDetailPage'));
const SemanticGraphView = lazy(() => import('@/components/semantic-graph/SemanticGraphView'));
const ArtifactWorkspaceClient = lazy(() => import('@/components/artifacts/ArtifactWorkspaceClient'));

function LegacyTagsWorkspace() {
  const project = useAppStore((s) => s.currentProject);
  const id = project?.id ?? 'default';
  const title = project?.name ?? 'Library';
  return <FolderTabView folderId={id} folderTitle={title} />;
}

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

function TabErrorHomeAction({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  return (
    <DomeButton
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        const store = useTabStore.getState();
        store.activateTab(HOME_TAB_ID);
        if (tabId !== HOME_TAB_ID) store.closeTab(tabId);
      }}
    >
      {t('common.go_home')}
    </DomeButton>
  );
}

/**
 * Per-tab error boundary: tags the Sentry report with the crashing tab
 * (type/id/title/resource) and offers a "go home" escape hatch so a broken
 * tab never leaves the user stuck on a retry loop (Sentry issue 132319823).
 */
function TabBoundary({ tab, children }: { tab: DomeTab; children: ReactNode }) {
  return (
    <ErrorBoundary
      context={{
        tabType: tab.type,
        tabId: tab.id,
        tabTitle: tab.title,
        tabResourceId: tab.resourceId,
      }}
      action={<TabErrorHomeAction tabId={tab.id} />}
    >
      {children}
    </ErrorBoundary>
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

  const prevSessionIdRef = useRef<string | null>(null);
  if (sessionId && prevSessionIdRef.current !== sessionId) {
    prevSessionIdRef.current = sessionId;
    useManyStore.getState().switchSession(sessionId);
  }

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

/**
 * Renders a tab body that requires a `resourceId`, falling back to
 * `<NoResource />` when none is set. Extracted so the per-tab dispatch
 * below stays free of nested `if (!tab.resourceId)` guards, which
 * previously pushed its cognitive complexity over the Sonar limit.
 */
function renderWithResource(
  tab: DomeTab,
  render: (resourceId: string) => ReactNode,
): ReactNode {
  if (!tab.resourceId) return <NoResource />;
  return render(tab.resourceId);
}

function TabContent({ tab, referenceMode = false }: { tab: DomeTab; referenceMode?: boolean }) {
  const closeTab = useTabStore((s) => s.closeTab);

  switch (tab.type) {
    case 'home':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <HomePage />
          </Suspense>
        </TabBoundary>
      );

    case 'projects':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <ProjectsPage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'note':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <NoteWorkspaceClient resourceId={resourceId} readOnly={referenceMode} compact={referenceMode} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'notebook':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <NotebookWorkspaceClient key={resourceId} resourceId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'resource':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <WorkspaceClient key={resourceId} resourceId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'url':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <URLWorkspaceClient key={resourceId} resourceId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'youtube':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <YouTubeWorkspaceClient key={resourceId} resourceId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'ppt':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden">
              <PptWorkspaceClient key={resourceId} resourceId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'settings':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-w-0 w-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <SettingsPage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'calendar':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <CalendarPage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'github':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <GitHubView />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'email':
      return (
        <TabBoundary tab={tab}>
          <SuspenseWithTimeout>
            <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <EmailView />
            </div>
          </SuspenseWithTimeout>
        </TabBoundary>
      );

    case 'social':
      return (
        <TabBoundary tab={tab}>
          <SuspenseWithTimeout>
            <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <SocialHubView />
            </div>
          </SuspenseWithTimeout>
        </TabBoundary>
      );

    case 'chat':
      return (
        <TabBoundary tab={tab}>
          <ChatTabView sessionId={tab.resourceId ?? ''} onClose={() => closeTab(tab.id)} />
        </TabBoundary>
      );

    case 'learn':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnPage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'studio':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnTabShell initialSection="all" />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'flashcards':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <LearnTabShell initialSection="decks" />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'tags':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <LegacyTagsWorkspace />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'marketplace':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
              <MarketplacePage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'pipelines':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <PipelinesBoard />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'agents':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AgentsStudioView />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'workflows':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <WorkflowsStudioView />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'automations':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <AutomationsStudioView />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'runs':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <RunsStudioView />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'folder':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <FolderTabView folderId={resourceId} folderTitle={tab.title} />
          </Suspense>
        </TabBoundary>
      ));

    case 'transcriptions':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <TranscriptionsListPage />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'transcription-detail':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <TranscriptionDetailPage noteId={resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      ));

    case 'semantic-graph':
      return (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
              <SemanticGraphView focusResourceId={tab.resourceId} />
            </div>
          </Suspense>
        </TabBoundary>
      );

    case 'artifact':
      return renderWithResource(tab, (resourceId) => (
        <TabBoundary tab={tab}>
          <Suspense fallback={<Loading />}>
            <ArtifactWorkspaceClient resourceId={resourceId} />
          </Suspense>
        </TabBoundary>
      ));

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
      <WorkspaceSplitView tab={tab}>
        <WorkspaceSplitView.Primary>
          <TabContent tab={tab} />
        </WorkspaceSplitView.Primary>
        <WorkspaceSplitView.Reference>
          <TabContent tab={referenceTab} referenceMode />
        </WorkspaceSplitView.Reference>
      </WorkspaceSplitView>
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
            <TabBoundary tab={tab}>
              <TabContentWithSplit tab={tab} />
            </TabBoundary>
          </TabPaneShell>
        );
      })}
    </div>
  );
}
