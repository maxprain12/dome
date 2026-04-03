/**
 * macOS: expose frontmost browser tab (Safari / Chrome family) to Many tools.
 */
import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

const BrowserActiveTabSchema = Type.Object({});

export function createBrowserActiveTabTool(): AnyAgentTool {
  return {
    label: 'Pestaña del navegador (macOS)',
    name: 'browser_get_active_tab',
    description:
      'macOS only. Returns the URL and title of the active tab when Safari, Google Chrome, Chromium, Brave, or Microsoft Edge is the frontmost app. ' +
      'Use when the user asks to save the current web page, bookmark what they are viewing in the browser, or refer to "this page" while a browser is focused. ' +
      'After getting the URL, create a url resource with resource_create (metadata.url) and optionally call web processing tools if needed.',
    parameters: BrowserActiveTabSchema,
    execute: async () => {
      try {
        if (typeof window === 'undefined' || !window.electron?.invoke) {
          return jsonResult({ status: 'error', error: 'Electron requerido.' });
        }
        if (!window.electron.isMac) {
          return jsonResult({
            status: 'error',
            error: 'browser_get_active_tab solo está disponible en macOS.',
          });
        }
        const res = (await window.electron.invoke('browser:get-active-tab-macos')) as {
          success: boolean;
          url?: string;
          title?: string;
          browser?: string;
          error?: string;
        };
        if (!res?.success) {
          return jsonResult({ status: 'error', error: res?.error || 'No se pudo leer el navegador' });
        }
        return jsonResult({
          status: 'success',
          url: res.url,
          title: res.title || '',
          browser: res.browser || '',
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}
