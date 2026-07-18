import { StrictMode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThemeProvider from '@/components/shared/ThemeProvider';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import type { StudioOutput } from '@/types';
import PromptModal from '@/components/shared/PromptModal';
import { showToast } from '@/lib/store/useToastStore';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';
import AppShell from '@/components/shell/AppShell';
import { useTabStore } from '@/lib/store/useTabStore';
import { reconcileLanguageWithOsIfNeeded } from '@/lib/i18n';
import { ensureHubEventsBridge } from '@/lib/hub/hubEventsBridge';
import { subscribeSettingsCloudUpdates } from '@/lib/settings';
import PptCapturePage from './pages/PptCapturePage';
import NoteFocusPage from './pages/NoteFocusPage';
import ManyPopoutPage from './pages/ManyPopoutPage';
import { lazy, Suspense } from 'react';
import StandaloneFrame from '@/components/shell/StandaloneFrame';

const StandaloneGitHubView = lazy(() => import('@/components/github/GitHubView'));
const StandaloneCalendarPage = lazy(() => import('@/pages/CalendarPage'));

function StandaloneGitHubPopout() {
  const { t } = useTranslation();
  return (
    <StandaloneFrame title={t('github.tab_title')}>
      <Suspense fallback={null}>
        <StandaloneGitHubView />
      </Suspense>
    </StandaloneFrame>
  );
}

function StandaloneCalendarPopout() {
  const { t } = useTranslation();
  return (
    <StandaloneFrame title={t('tabs.calendar')}>
      <Suspense fallback={null}>
        <div className="h-full w-full overflow-auto">
          <StandaloneCalendarPage />
        </div>
      </Suspense>
    </StandaloneFrame>
  );
}

const NOTE_FOCUS_PREFIX = '/focus/note/';
function MainApp() {
  const { t } = useTranslation();
  useEffect(() => {
    void reconcileLanguageWithOsIfNeeded();
    ensureHubEventsBridge();
  }, []);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);
  const loadPreferences = useAppStore((s) => s.loadPreferences);
  const loadUserProfile = useUserStore((s) => s.loadUserProfile);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

  // Theme + prefs must load at shell boot — not only when Home/Settings tabs mount
  // (hub tabs unmount when inactive to save RAM).
  useEffect(() => {
    void loadPreferences();
    void loadUserProfile();
  }, [loadPreferences, loadUserProfile]);

  useEffect(() => {
    const unsub = subscribeSettingsCloudUpdates((payload) => {
      const keys = payload?.keys ?? [];
      if (keys.some((k) => k.startsWith('ai_') || k.startsWith('ollama_') || k.startsWith('embeddings_'))) {
        globalThis.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
      }
    });
    return unsub;
  }, []);

  // Handle dome://studio/ID deep links
  useEffect(() => {
    const win = globalThis.window;
    if (!win?.electron?.on) return;
    const unsubscribe = win.electron.on('dome:open-studio-output', async (data: { outputId?: string }) => {
      const outputId = data?.outputId;
      if (!outputId || !win.electron?.db?.studio?.getById) return;
      try {
        const result = await win.electron.db.studio.getById(outputId);
        if (result?.success && result.data) {
          const output = result.data as StudioOutput;
          addStudioOutput(output);
          setActiveStudioOutput(output);
          setHomeSidebarSection('studio');
          const projResult = await win.electron.db.projects.getById(output.project_id);
          if (projResult?.success && projResult.data) {
            setCurrentProject(projResult.data);
          }
          // Navigate home tab and set section
          useTabStore.getState().activateTab('home');
        }
      } catch (err) {
        console.error('[App] Failed to open studio output from deep link:', err);
      }
    });
    return () => unsubscribe?.();
  }, [addStudioOutput, setActiveStudioOutput, setHomeSidebarSection, setCurrentProject]);

  // Handle dome://resource/ID deep links
  useEffect(() => {
    const win = globalThis.window;
    if (!win?.electron?.on) return;
    const unsub = win.electron.on('dome:open-resource-in-tab', (data: { resourceId: string; resourceType: string; title: string }) => {
      useTabStore.getState().openResourceTab(data.resourceId, data.resourceType, data.title || t('app.resource'));
    });
    return () => unsub?.();
  }, [t]);

  // Main process: open built-in singleton tabs
  useEffect(() => {
    const win = globalThis.window;
    if (!win?.electron?.on) return;
    const unsub = win.electron.on('dome:open-singleton-tab', (data: { tab?: string }) => {
      const tab = String(data?.tab || '').toLowerCase();
      const ts = useTabStore.getState();
      switch (tab) {
        case 'home':
          ts.activateTab('home');
          break;
        case 'settings':
          ts.openSettingsTab();
          break;
        case 'calendar':
          ts.openCalendarTab();
          break;
        case 'agents':
          ts.openAgentsTab();
          break;
        case 'studio':
          ts.openStudioTab();
          break;
        case 'flashcards':
          ts.openFlashcardsTab();
          break;
        case 'learn':
          ts.openLearnTab();
          break;
        case 'tags':
          ts.openTagsTab();
          break;
        case 'marketplace':
          ts.openMarketplaceTab();
          break;
        default:
          break;
      }
    });
    return () => unsub?.();
  }, []);

  // PPT background generation notifications
  useEffect(() => {
    const win = globalThis.window;
    if (!win?.electron?.on) return;
    const unsubCreated = win.electron.on(
      'ppt:created',
      (data: { resource: { id: string; title: string }; title: string }) => {
        const name = data?.resource?.title || data?.title || 'Presentación';
        showToast('success', t('app.ppt_created', { name }));
      }
    );
    const unsubFailed = window.electron.on(
      'ppt:creation-failed',
      (data: { title: string; error?: string }) => {
        const name = data?.title || 'Presentación';
        showToast('error', t('app.ppt_failed', { name, error: data?.error || t('common.unknown_error') }));
      }
    );
    return () => {
      unsubCreated?.();
      unsubFailed?.();
    };
  }, [t]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.calendar?.onUpcoming) return;
    const unsub = window.electron.calendar.onUpcoming((data: { events?: Array<{ title?: string }>; inApp?: boolean }) => {
      if (!data?.events?.length) return;
      const ev = data.events[0];
      const title = ev?.title || t('calendarPage.title');
      showToast('info', t('app.calendar_upcoming', { title }));
    });
    return () => unsub?.();
  }, [t]);

  return (
    <>
      <AppShell />
      <PromptModal />
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();

  // Hidden capture route — render only the bare slide container, no app UI.
  if (pathname === '/ppt-capture') {
    return <PptCapturePage />;
  }

  // Bare popout window: /focus/note/<id> renders only the note editor, no shell.
  if (pathname.startsWith(NOTE_FOCUS_PREFIX)) {
    const resourceId = decodeURIComponent(pathname.slice(NOTE_FOCUS_PREFIX.length)).split('/')[0];
    if (resourceId) {
      return (
        <ThemeProvider>
          <NoteFocusPage resourceId={resourceId} />
        </ThemeProvider>
      );
    }
  }

  // Bare popout windows for "Seguimiento" (GitHub) and the calendar — no shell,
  // just a draggable safe-zone frame so traffic lights / overlay controls don't
  // overlap content.
  if (pathname === '/standalone/github') {
    return (
      <ThemeProvider>
        <StandaloneGitHubPopout />
      </ThemeProvider>
    );
  }
  if (pathname === '/standalone/calendar') {
    return (
      <ThemeProvider>
        <StandaloneCalendarPopout />
      </ThemeProvider>
    );
  }
  if (pathname === '/standalone/many' || pathname.startsWith('/standalone/many')) {
    return (
      <ThemeProvider>
        <ManyPopoutPage />
      </ThemeProvider>
    );
  }

  // StrictMode for main shell — /ppt-capture avoids StrictMode above so slide capture isn’t doubled.
  return (
    <ThemeProvider>
      <StrictMode>
        <AnalyticsProvider>
          <MainApp />
        </AnalyticsProvider>
      </StrictMode>
    </ThemeProvider>
  );
}
