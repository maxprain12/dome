import { StrictMode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThemeProvider from '@/components/ui/ThemeProvider';
import { useAppStore } from '@/lib/store/useAppStore';
import type { StudioOutput } from '@/types';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';
import { showToast } from '@/lib/store/useToastStore';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';
import AppShell from '@/components/shell/AppShell';
import { useTabStore } from '@/lib/store/useTabStore';
import { reconcileLanguageWithOsIfNeeded } from '@/lib/i18n';
import PptCapturePage from './pages/PptCapturePage';
import TranscriptionOverlayPage from './pages/TranscriptionOverlayPage';
import NoteFocusPage from './pages/NoteFocusPage';

const NOTE_FOCUS_PREFIX = '/focus/note/';
function MainApp() {
  const { t } = useTranslation();
  useEffect(() => {
    void reconcileLanguageWithOsIfNeeded();
  }, []);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

  // Handle dome://studio/ID deep links
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubscribe = window.electron.on('dome:open-studio-output', async (data: { outputId?: string }) => {
      const outputId = data?.outputId;
      if (!outputId || !window.electron?.db?.studio?.getById) return;
      try {
        const result = await window.electron.db.studio.getById(outputId);
        if (result?.success && result.data) {
          const output = result.data as StudioOutput;
          addStudioOutput(output);
          setActiveStudioOutput(output);
          setHomeSidebarSection('studio');
          const projResult = await window.electron.db.projects.getById(output.project_id);
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
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on('dome:open-resource-in-tab', (data: { resourceId: string; resourceType: string; title: string }) => {
      useTabStore.getState().openResourceTab(data.resourceId, data.resourceType, data.title || t('app.resource'));
    });
    return () => unsub?.();
  }, [t]);

  // Main process: open built-in singleton tabs
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on('dome:open-singleton-tab', (data: { tab?: string }) => {
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
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubCreated = window.electron.on(
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
      <ToastContainer />
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();

  // Hidden capture route — render only the bare slide container, no app UI.
  if (pathname === '/ppt-capture') {
    return <PptCapturePage />;
  }

  if (pathname === '/transcription-overlay') {
    return (
      <ThemeProvider>
        <TranscriptionOverlayPage />
      </ThemeProvider>
    );
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

  // StrictMode only for the main shell — overlay / capture windows must not double-remount in dev
  // (resets voice HUD state and closes the floating window right after toggle).
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
