
import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

/**
 * Controles de ventana (minimizar, maximizar, cerrar) para Windows y Linux.
 * En macOS no se muestran: se usan los traffic lights nativos.
 * Solo se renderiza tras el montaje en cliente para evitar hydration mismatch (server no tiene window).
 */
export default function WindowControls() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (
    !mounted ||
    typeof window === 'undefined' ||
    !window.electron ||
    window.electron.isMac
  ) {
    return null;
  }

  const handleMinimize = () => {
    window.electron.invoke('window:minimize-current');
  };

  const handleMaximizeToggle = () => {
    window.electron.invoke('window:maximize-toggle');
  };

  const handleClose = () => {
    window.electron.invoke('window:close-current');
  };

  return (
    <div
      className="absolute top-0 right-0 h-11 flex items-center no-drag"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={handleMinimize}
        className="h-11 w-12 flex items-center justify-center text-primary-text hover:bg-bg-hover transition-colors"
        aria-label="Minimizar"
      >
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={handleMaximizeToggle}
        className="h-11 w-12 flex items-center justify-center text-primary-text hover:bg-bg-hover transition-colors"
        aria-label="Maximizar"
      >
        <Square className="w-3.5 h-3.5" strokeWidth={2} fill="none" />
      </button>
      <button
        type="button"
        onClick={handleClose}
        className="h-11 w-12 flex items-center justify-center text-primary-text hover:bg-error hover:text-white transition-colors"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
