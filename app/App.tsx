import { useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ThemeProvider from '@/components/ui/ThemeProvider';
import ManyFloatingButton from '@/components/many/ManyFloatingButton';
import { useAppStore } from '@/lib/store/useAppStore';
import type { StudioOutput } from '@/types';
import ManyPanel from '@/components/many/ManyPanel';
import ResizeHandle from '@/components/many/ResizeHandle';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';
import AppHeader from '@/components/layout/AppHeader';
import { useManyStore } from '@/lib/store/useManyStore';

// Pages
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import NoteWorkspacePage from './pages/NoteWorkspacePage';
import NotebookWorkspacePage from './pages/NotebookWorkspacePage';
import URLWorkspacePage from './pages/URLWorkspacePage';
import YouTubeWorkspacePage from './pages/YouTubeWorkspacePage';
import DocxWorkspacePage from './pages/DocxWorkspacePage';
import PptWorkspacePage from './pages/PptWorkspacePage';

const HIDDEN_ROUTES = ['/settings', '/onboarding'];
const MANY_PANEL_MIN = 320;
const MANY_PANEL_MAX = 600;
const MANY_PANEL_DEFAULT = 400;
const STORAGE_KEY = 'dome-many-panel-width';

function getStoredWidth(): number {
  if (typeof window === 'undefined') return MANY_PANEL_DEFAULT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (!Number.isNaN(w) && w >= MANY_PANEL_MIN && w <= MANY_PANEL_MAX) return w;
    }
  } catch {
    // ignore
  }
  return MANY_PANEL_DEFAULT;
}

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isOpen, toggleOpen } = useManyStore();
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);

  // Handle dome://studio/ID deep links (from setWindowOpenHandler, will-navigate, cold start)
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
          navigate('/');
        }
      } catch (err) {
        console.error('[App] Failed to open studio output from deep link:', err);
      }
    });
    return () => unsubscribe?.();
  }, [addStudioOutput, setActiveStudioOutput, setHomeSidebarSection, setCurrentProject, navigate]);
  const shouldHide = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));
  const showPanel = isOpen && !shouldHide;

  const [panelWidth, setPanelWidth] = useState(getStoredWidth);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  useEffect(() => {
    setPanelWidth(getStoredWidth());
  }, []);

  const handleResize = useCallback((deltaX: number) => {
    setPanelWidth((prev) => Math.min(MANY_PANEL_MAX, Math.max(MANY_PANEL_MIN, prev + deltaX)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, String(panelWidthRef.current));
    } catch {
      // ignore
    }
  }, []);

  return (
    <ThemeProvider>
      <div
        className="flex flex-col"
        style={{ height: '100vh', minHeight: 0 }}
      >
        <AppHeader />

        <div
          className="flex flex-1 min-h-0 overflow-hidden"
          style={{ paddingTop: 'var(--app-header-total)' }}
        >
          <div
            className="flex-1 min-w-0 overflow-auto"
            style={{ paddingTop: 0 }}
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/workspace/note" element={<NoteWorkspacePage />} />
              <Route path="/workspace/notebook" element={<NotebookWorkspacePage />} />
              <Route path="/workspace/url" element={<URLWorkspacePage />} />
              <Route path="/workspace/youtube" element={<YouTubeWorkspacePage />} />
              <Route path="/workspace/docx" element={<DocxWorkspacePage />} />
              <Route path="/workspace/ppt" element={<PptWorkspacePage />} />
            </Routes>
          </div>

          {showPanel && (
            <>
              <ResizeHandle
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
              />
              <ManyPanel
                width={panelWidth}
                onClose={toggleOpen}
              />
            </>
          )}
        </div>
      </div>

      {/* Many - Asistente flotante global (bubble) */}
      <ManyFloatingButton />

      {/* Modal global para prompts (reemplazo de window.prompt para Electron) */}
      <PromptModal />

      {/* Sistema de notificaciones toast */}
      <ToastContainer />
    </ThemeProvider>
  );
}
