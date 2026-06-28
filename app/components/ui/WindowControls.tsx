
import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

function minimizeCurrentWindow() {
  window.electron.invoke('window:minimize-current').catch((err) => {
    console.error('[WindowControls] minimize failed:', err);
  });
}

function toggleMaximizeCurrentWindow() {
  window.electron.invoke('window:maximize-toggle').catch((err) => {
    console.error('[WindowControls] maximize toggle failed:', err);
  });
}

function closeCurrentWindow() {
  window.electron.invoke('window:close-current').catch((err) => {
    console.error('[WindowControls] close failed:', err);
  });
}

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

  return (
    <div
      className="absolute top-0 right-0 flex items-center no-drag"
      style={{ height: 'var(--dome-header-h, 40px)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={minimizeCurrentWindow}
        className="flex items-center justify-center transition-colors window-control-btn"
        style={{ width: 46, height: 'var(--dome-header-h, 40px)', color: 'var(--dome-text)' }}
        aria-label="Minimizar"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={toggleMaximizeCurrentWindow}
        className="flex items-center justify-center transition-colors window-control-btn"
        style={{ width: 46, height: 'var(--dome-header-h, 40px)', color: 'var(--dome-text)' }}
        aria-label="Maximizar"
      >
        <Square className="size-3.5" strokeWidth={2} fill="none" />
      </button>
      <button
        type="button"
        onClick={closeCurrentWindow}
        className="flex items-center justify-center transition-colors window-control-close"
        style={{ width: 46, height: 'var(--dome-header-h, 40px)', color: 'var(--dome-text)' }}
        aria-label="Cerrar"
      >
        <X className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
