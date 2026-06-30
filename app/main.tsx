import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/_variables.scss';
import './styles/_keyframe-animations.scss';
import App from './App';
import { installBrowserIpcShim } from './lib/dev/browserIpcShim';
import './globals.css';
import './styles/notes-editor.css';
import './styles/mention-textarea.css';
import './styles/shell-header.css';
import './styles/shell-tab-bar.css';
import './styles/home-dashboard.css';
import './styles/projects-dashboard.css';
import './styles/calendar-dashboard.css';
import './styles/hub-dashboard.css';
import './styles/learn.css';
import './lib/i18n';

/**
 * Observes data-theme on <html> and keeps MantineProvider in sync.
 * This ensures Mantine modals, tooltips, and notifications follow the app theme.
 */
function DomeMantineProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    return attr === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const attr = document.documentElement.getAttribute('data-theme');
      setColorScheme(attr === 'dark' ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <MantineProvider forceColorScheme={colorScheme}>
      {children}
    </MantineProvider>
  );
}

// Dev-only: when running in a plain browser tab (no Electron preload), back
// window.electron with the HTTP IPC bridge so design tooling gets real data.
// No-op in Electron and in production builds.
if (import.meta.env.DEV) {
  installBrowserIpcShim();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <DomeMantineProvider>
    <Notifications />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </DomeMantineProvider>
);
