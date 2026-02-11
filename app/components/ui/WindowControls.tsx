
import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

/**
 * Controles de ventana (minimizar, maximizar, cerrar) para Linux.
 * En macOS se usan los traffic lights nativos.
 * En Windows se usa titleBarOverlay para controles nativos.
 * Solo se renderiza tras el montaje en cliente para evitar hydration mismatch.
 */
export default function WindowControls() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hide on macOS (traffic lights), Windows (titleBarOverlay), and non-electron
  if (
    !mounted ||
    typeof window === 'undefined' ||
    !window.electron ||
    window.electron.isMac ||
    window.electron.isWindows
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
        className="h-11 w-12 flex items-center justify-center transition-colors window-control-btn"
        style={{ color: 'var(--dome-text)' }}
        aria-label="Minimizar"
      >
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={handleMaximizeToggle}
        className="h-11 w-12 flex items-center justify-center transition-colors window-control-btn"
        style={{ color: 'var(--dome-text)' }}
        aria-label="Maximizar"
      >
        <Square className="w-3.5 h-3.5" strokeWidth={2} fill="none" />
      </button>
      <button
        type="button"
        onClick={handleClose}
        className="h-11 w-12 flex items-center justify-center transition-colors window-control-close"
        style={{ color: 'var(--dome-text)' }}
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
