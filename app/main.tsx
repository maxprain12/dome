import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/_variables.scss';
import './styles/_keyframe-animations.scss';
import App from './App';
import { installBrowserIpcShim } from './lib/dev/browserIpcShim';
import './globals.css';
import './styles/notes-editor.css';
import './styles/mention-textarea.css';
import './styles/shell-header.css';
import './styles/home-dashboard.css';
import './styles/calendar-dashboard.css';
import './styles/hub-dashboard.css';
import './styles/learn.css';
import './lib/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

if (import.meta.env.DEV) {
  installBrowserIpcShim();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <Toaster position="top-right" richColors closeButton />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </TooltipProvider>,
);
