import { Routes, Route } from 'react-router-dom';
import ThemeProvider from '@/components/ui/ThemeProvider';
import MartinFloatingButton from '@/components/martin/MartinFloatingButton';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';
import AppHeader from '@/components/layout/AppHeader';

// Pages
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import NoteWorkspacePage from './pages/NoteWorkspacePage';
import URLWorkspacePage from './pages/URLWorkspacePage';

export default function App() {
  return (
    <ThemeProvider>
      <AppHeader />

      {/* Contenido principal con padding-top para evitar solapamiento con el header */}
      <div style={{ paddingTop: 'var(--app-header-total)' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/workspace/note" element={<NoteWorkspacePage />} />
          <Route path="/workspace/url" element={<URLWorkspacePage />} />
        </Routes>
      </div>

      {/* Many - Asistente flotante global */}
      <MartinFloatingButton />

      {/* Modal global para prompts (reemplazo de window.prompt para Electron) */}
      <PromptModal />

      {/* Sistema de notificaciones toast */}
      <ToastContainer />
    </ThemeProvider>
  );
}
