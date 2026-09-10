import { createRoot, type Root } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { extensionI18n, initializeI18n } from '../src/lib/i18n';
import PanelApp from '../src/ui/PanelApp';
import { highlightCurrentSelection } from '../src/lib/page-content';
import { setPendingSelection } from '../src/lib/pending-selection';

const BOOT = '__domePanelBooted';
const FLAG = '__domePanelOpen';

type Host = typeof globalThis & {
  [BOOT]?: boolean;
  [FLAG]?: boolean;
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const g = globalThis as Host;
    if (g[BOOT]) return;
    g[BOOT] = true;

    await initializeI18n();
    let panelContainer: HTMLElement | null = null;
    const close = () => {
      if (panelContainer) panelContainer.hidden = true;
      g[FLAG] = false;
    };

    const ui = await createShadowRootUi(ctx, {
      name: 'dome-capture-panel',
      position: 'overlay',
      alignment: 'top-right',
      zIndex: 2147483646,
      onMount(container) {
        panelContainer = container;
        const root = createRoot(container);
        root.render(
          <I18nextProvider i18n={extensionI18n}>
            <PanelApp onClose={close} />
          </I18nextProvider>,
        );
        g[FLAG] = true;
        return root;
      },
      onRemove(root) {
        (root as Root | undefined)?.unmount();
        g[FLAG] = false;
      },
    });

    const ensure = () => {
      if (!panelContainer) ui.mount();
      else panelContainer.hidden = false;
      g[FLAG] = true;
    };
    const toggle = () => {
      if (g[FLAG]) close();
      else ensure();
    };

    toggle();

    browser.runtime.onMessage.addListener(
      (message: { type?: string; text?: string }) => {
        if (message?.type === 'DOME_PING')
          return { ok: true, open: Boolean(g[FLAG]) };
        if (message?.type === 'DOME_TOGGLE') {
          toggle();
          return;
        }
        if (message?.type === 'DOME_ENSURE') {
          ensure();
          return;
        }
        if (message?.type === 'DOME_ADD_SELECTION' && message.text) {
          ensure();
          highlightCurrentSelection();
          setPendingSelection(message.text);
        }
      },
    );
  },
});
