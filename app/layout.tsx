import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MartinFloatingButton from '@/components/common/MartinFloatingButton';
import PromptModal from '@/components/PromptModal';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={inter.className}>
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

        {/* Martin - Asistente flotante global */}
        <MartinFloatingButton />

        {/* Modal global para prompts (reemplazo de window.prompt para Electron) */}
        <PromptModal />
      </body>
    </html>
  );
}
