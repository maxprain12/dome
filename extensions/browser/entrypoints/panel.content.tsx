import { createPageAgent } from '../src/lib/page-agent';
import { extractContact } from '../src/lib/extractors';
import { getPageSnapshot } from '../src/lib/page-content';
import type { PageAction } from '../src/lib/browser-context';
import {
  CONTENT_PING_MESSAGE,
  CONTENT_PROTOCOL_VERSION,
} from '../src/lib/content-protocol';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    const host = globalThis as typeof globalThis & {
      __domeReaderProtocol?: number;
    };
    if (host.__domeReaderProtocol === CONTENT_PROTOCOL_VERSION) return;
    host.__domeReaderProtocol = CONTENT_PROTOCOL_VERSION;
    document.querySelector('dome-capture-panel')?.remove();
    const agent = createPageAgent();
    const headings = () =>
      Array.from(
        document.querySelectorAll(
          'main h1, main h2, main h3, article h1, article h2, article h3',
        ),
      )
        .filter((el) => (el as HTMLElement).offsetHeight > 0)
        .slice(0, 80);
    browser.runtime.onMessage.addListener(
      (message: {
        type?: string;
        url?: string;
        action?:
          | PageAction
          | {
              kind: 'click' | 'fill';
              snapshotId: string;
              elementId: string;
              value?: string;
            };
      }) => {
        if (
          message.type === 'DOME_PING' ||
          message.type === CONTENT_PING_MESSAGE
        )
          return Promise.resolve({
            ok: true,
            protocolVersion: CONTENT_PROTOCOL_VERSION,
          });
        if (message.type === 'DOME_AGENT_READ')
          return Promise.resolve(agent.read());
        if (message.type === 'DOME_SNAPSHOT')
          return Promise.resolve({
            ...getPageSnapshot(),
            contact: extractContact(document, location.href),
            headings: headings().map((el, index) => ({
              index,
              text: (el.textContent || '').trim().slice(0, 160),
            })),
          });
        if (message.type !== 'DOME_ACT' || message.url !== location.href)
          return;
        const action = message.action;
        if (action?.kind === 'click' || action?.kind === 'fill')
          return Promise.resolve(agent.act(action));
        if (action?.kind === 'scroll') {
          if (action.direction === 'top')
            window.scrollTo({ top: 0, behavior: 'smooth' });
          else
            window.scrollBy({
              top: innerHeight * 0.75 * (action.direction === 'up' ? -1 : 1),
              behavior: 'smooth',
            });
          return Promise.resolve({ ok: true });
        }
        if (action?.kind === 'heading') {
          const heading = headings()[action.index];
          heading?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return Promise.resolve({ ok: Boolean(heading) });
        }
        if (action?.kind === 'find') {
          const finder = window as Window & {
            find?: (
              text: string,
              caseSensitive: boolean,
              backwards: boolean,
              wrap: boolean,
            ) => boolean;
          };
          return Promise.resolve({
            ok: Boolean(
              action.text.trim() &&
                finder.find?.(action.text.slice(0, 200), false, false, true),
            ),
          });
        }
      },
    );
  },
});
