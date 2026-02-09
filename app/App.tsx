import { Routes, Route } from 'react-router-dom';
import ThemeProvider from '@/components/ui/ThemeProvider';
import MartinFloatingButton from '@/components/martin/MartinFloatingButton';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';
import WindowControls from '@/components/ui/WindowControls';

// Pages
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import NoteWorkspacePage from './pages/NoteWorkspacePage';
import URLWorkspacePage from './pages/URLWorkspacePage';

export default function App() {
  return (
    <ThemeProvider>
      {/* Drag region para mover la ventana (macOS traffic lights) */}
      <div
        className="drag-region fixed top-0 left-0 right-0 h-11 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Espacio para los traffic lights de macOS */}
        <div className="absolute top-0 left-0 w-20 h-11" />
        {/* Controles de ventana para Windows/Linux */}
        <WindowControls />
      </div>

      {/* Contenido principal con padding-top para evitar la drag region */}
      <div className="pt-11">
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
