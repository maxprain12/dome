'use client';

import { useEffect } from 'react';

/**
 * ThemeProvider - Manages theme initialization and persistence
 * Applies theme to <html> element to ensure CSS variables work correctly
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') return;

    // Get saved theme from localStorage or default to 'light'
    const savedTheme = localStorage.getItem('dome-theme') || 'light';

    // Apply theme to html element
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Optional: Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a theme
      if (!localStorage.getItem('dome-theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return <>{children}</>;
}

/**
 * Hook to toggle theme
 * Usage: const toggleTheme = useTheme();
 */
export function useTheme() {
  const toggleTheme = () => {
    if (typeof window === 'undefined') return;

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('dome-theme', newTheme);
  };

  const setTheme = (theme: 'light' | 'dark') => {
    if (typeof window === 'undefined') return;

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dome-theme', theme);
  };

  const getTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  };

  return { toggleTheme, setTheme, getTheme };
}
