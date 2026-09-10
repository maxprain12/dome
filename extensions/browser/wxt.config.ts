import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const LOOPBACK = 'http://127.0.0.1:37215/*';

function isPageHostPermission(value: string) {
  return value === '<all_urls>' || /^https?:\/\/\*\//.test(value);
}

export default defineConfig({
  alias: {
    '@/lib/utils': fileURLToPath(
      new URL('../../app/lib/cn.ts', import.meta.url),
    ),
    '@/components': fileURLToPath(
      new URL('../../app/components', import.meta.url),
    ),
  },
  vite: () => ({ plugins: [tailwindcss()] }),
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: '.output',
  webExt: {
    disabled: true,
  },
  hooks: {
    'build:manifestGenerated'(_wxt, manifest) {
      if (Array.isArray(manifest.host_permissions)) {
        manifest.host_permissions = manifest.host_permissions.filter(
          (item) => !isPageHostPermission(item),
        );
        if (!manifest.host_permissions.includes(LOOPBACK))
          manifest.host_permissions.push(LOOPBACK);
      }
      if (Array.isArray(manifest.permissions)) {
        manifest.permissions = manifest.permissions.filter(
          (item) => !isPageHostPermission(item),
        );
      }
      if (
        Array.isArray(manifest.content_scripts) &&
        manifest.content_scripts.length === 0
      ) {
        delete manifest.content_scripts;
      }
    },
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'es',
    version: '0.2.0',
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'contextMenus',
      'tabs',
      ...(['chrome', 'edge'].includes(browser) ? ['sidePanel'] : []),
    ],
    ...(browser === 'safari'
      ? { optional_permissions: ['http://*/*', 'https://*/*'] }
      : { optional_host_permissions: ['http://*/*', 'https://*/*'] }),
    ...(['chrome', 'edge'].includes(browser)
      ? { side_panel: { default_path: 'sidebar.html' } }
      : {}),
    ...(browser === 'firefox'
      ? {
          sidebar_action: {
            default_panel: 'sidebar.html',
            default_title: 'Dome · Many',
          },
        }
      : {}),
    host_permissions: [LOOPBACK],
    action: {
      default_title: '__MSG_actionTitle__',
    },
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'browser-extension@dome.app',
              strict_min_version: '121.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
