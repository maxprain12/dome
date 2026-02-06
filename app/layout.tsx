import './globals.css';
import type { Metadata } from 'next';
import ThemeProvider from '@/components/ui/ThemeProvider';
import MartinFloatingButton from '@/components/martin/MartinFloatingButton';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';

// Using system fonts to avoid network issues during build
// Original fonts: Source_Sans_3, Fraunces
// System font fallbacks are configured in globals.css

export const metadata: Metadata = {
  title: 'Dome - Gestión Inteligente de Conocimiento',
  description: 'Aplicación de escritorio para investigadores y académicos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="light">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {/* Drag region para mover la ventana (macOS traffic lights) */}
          <div
            className="drag-region fixed top-0 left-0 right-0 h-11 z-50"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            {/* Espacio para los traffic lights de macOS */}
            <div className="absolute top-0 left-0 w-20 h-11" />
          </div>

          {/* Contenido principal con padding-top para evitar la drag region */}
          <div className="pt-11">
            {children}
          </div>

          {/* Many - Asistente flotante global */}
          <MartinFloatingButton />

          {/* Modal global para prompts (reemplazo de window.prompt para Electron) */}
          <PromptModal />

          {/* Sistema de notificaciones toast */}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
