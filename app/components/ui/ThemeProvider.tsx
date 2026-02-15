import { useEffect } from 'react';

/**
 * ThemeProvider - Applies light theme to <html> element
 * Only light mode is supported; dark and system modes are disabled
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  return <>{children}</>;
}

/**
 * Hook for theme - always returns light (kept for compatibility)
 */
export function useTheme() {
  const toggleTheme = () => {
    // No-op: only light mode is supported
  };

  const setTheme = (_theme?: 'light' | 'dark') => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('data-theme', 'light');
  };

  const getTheme = (): 'light' => {
    return 'light';
  };

  return { toggleTheme, setTheme, getTheme };
}
