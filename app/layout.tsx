import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import type { Metadata } from 'next';
import ThemeProvider from '@/components/ui/ThemeProvider';
import MartinFloatingButton from '@/components/martin/MartinFloatingButton';
import PromptModal from '@/components/ui/PromptModal';
import ToastContainer from '@/components/ui/Toast';
import WindowControls from '@/components/ui/WindowControls';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

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
    <html lang="es" data-theme="light" className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
            {/* Controles de ventana para Windows/Linux */}
            <WindowControls />
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
