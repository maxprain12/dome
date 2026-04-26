import { useEffect } from 'react';
import { useAppStore } from '@/lib/store/useAppStore';

/**
 * ThemeProvider - Applies theme (light/dark/auto) to <html> element
 * Reads from Zustand store and listens for OS-level changes in auto mode.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function applyTheme(resolved: 'light' | 'dark') {
      document.documentElement.setAttribute('data-theme', resolved);
      // Mirror onto a class so libraries that gate dark-mode CSS via `.dark`
      // (e.g., the bundled tiptap-ui pack) cascade correctly.
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    }

    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // Listen for Electron nativeTheme updates (relevant in auto mode)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.onThemeChanged) return;

    const cleanup = window.electron.onThemeChanged((resolved: string) => {
      if (useAppStore.getState().theme === 'auto') {
        const next = resolved === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.classList.toggle('dark', next === 'dark');
      }
    });

    return cleanup;
  }, []);

  return <>{children}</>;
}

/**
 * Hook for theme management
 */
export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  const setTheme = (t: 'light' | 'dark' | 'auto') => {
    updateTheme(t);
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
    updateTheme(next);
  };

  const getTheme = () => theme;

  return { toggleTheme, setTheme, getTheme };
}
