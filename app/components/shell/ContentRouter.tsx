import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTabStore, type DomeTab } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';

// Lazy-load heavy workspace components
const WorkspaceClient = lazy(() => import('@/workspace/[[...params]]/client'));
const NoteWorkspaceClient = lazy(() => import('@/workspace/note/[[...params]]/client'));
const NotebookWorkspaceClient = lazy(() => import('@/workspace/notebook/[[...params]]/client'));
const URLWorkspaceClient = lazy(() => import('@/workspace/url/client'));
const YouTubeWorkspaceClient = lazy(() => import('@/workspace/youtube/client'));
const DocxWorkspaceClient = lazy(() => import('@/workspace/docx/[[...params]]/client'));
const PptWorkspaceClient = lazy(() => import('@/workspace/ppt/client'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const ManyPanel = lazy(() => import('@/components/many/ManyPanel'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const LearnPage = lazy(() => import('@/components/learn/LearnPage'));
const TagsPage = lazy(() => import('@/components/home/TagBrowser'));
const MarketplacePage = lazy(() => import('@/components/marketplace/MarketplaceView'));
const AgentsPage = lazy(() => import('@/components/automations/AutomationsHubView'));
const FolderTabView = lazy(() => import('@/components/shell/FolderTabView'));

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}

function NoResource() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
      <p className="text-sm">{t('common.noResourceSelected')}</p>
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

function TabContent({ tab }: { tab: DomeTab }) {
  const { closeTab } = useTabStore();

  switch (tab.type) {
    case 'home':
      return (
        <Suspense fallback={<Loading />}>
          <HomePage />
        </Suspense>
      );

    case 'note':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <NoteWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'notebook':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <NotebookWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'resource':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <WorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'url':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <URLWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'youtube':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <YouTubeWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'docx':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <DocxWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'ppt':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-hidden">
            <PptWorkspaceClient resourceId={tab.resourceId} />
          </div>
        </Suspense>
      );

    case 'settings':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <SettingsPage />
          </div>
        </Suspense>
      );

    case 'calendar':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <CalendarPage />
          </div>
        </Suspense>
      );

    case 'chat':
      return <ChatTabView sessionId={tab.resourceId ?? ''} onClose={() => closeTab(tab.id)} />;

    case 'learn':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <LearnPage />
          </div>
        </Suspense>
      );

    case 'tags':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <TagsPage />
          </div>
        </Suspense>
      );

    case 'marketplace':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <MarketplacePage />
          </div>
        </Suspense>
      );

    case 'agents':
      return (
        <Suspense fallback={<Loading />}>
          <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
            <AgentsPage />
          </div>
        </Suspense>
      );

    case 'folder':
      if (!tab.resourceId) return <NoResource />;
      return (
        <Suspense fallback={<Loading />}>
          <FolderTabView folderId={tab.resourceId} folderTitle={tab.title} />
        </Suspense>
      );

    default:
      return <NoResource />;
  }
}

export default function ContentRouter() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) return <Loading />;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ background: 'var(--dome-surface)' }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={
            tab.id === activeTabId
              ? 'flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden'
              : 'hidden'
          }
          aria-hidden={tab.id !== activeTabId}
        >
          <TabContent tab={tab} />
        </div>
      ))}
    </div>
  );
}
