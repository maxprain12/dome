import { createPageAgent, type ElementAction } from '../src/lib/page-agent';
import { extractContact } from '../src/lib/extractors';
import { pageRoots, rendered } from '../src/lib/page-dom';
import { getPageSnapshot } from '../src/lib/page-content';
import type { PageAction } from '../src/lib/browser-context';
import {
  CONTENT_PING_MESSAGE,
  CONTENT_PROTOCOL_VERSION,
} from '../src/lib/content-protocol';

function settle(ms = 700) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

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
      pageRoots(document).roots.flatMap(({ root }) => Array.from(root.querySelectorAll('h1, h2, h3, [role=heading]')))
        .filter(rendered).slice(0, 80);
    const scrollToHeading = (text: string) => {
      const needle = text.replace(/\s+/g, ' ').trim().toLowerCase();
      const heading = headings().find((el) =>
        (el.textContent || '')
          .replace(/\s+/g, ' ')
          .toLowerCase()
          .includes(needle),
      );
      heading?.scrollIntoView({ behavior: 'auto', block: 'start' });
      return Boolean(heading);
    };
    browser.runtime.onMessage.addListener(
      (message: {
        type?: string;
        url?: string;
        action?:
          | PageAction
          | ElementAction;
      }) => {
        if (host.__domeReaderProtocol !== CONTENT_PROTOCOL_VERSION) return;
        if (
          message.type === 'DOME_PING' ||
          message.type === CONTENT_PING_MESSAGE
        )
          return Promise.resolve({
            ok: true,
            protocolVersion: CONTENT_PROTOCOL_VERSION,
          });
        if (message.type === 'DOME_AGENT_READ_V4')
          return Promise.resolve(agent.read());
        if (message.type === 'DOME_SNAPSHOT_V4')
          return Promise.resolve({
            ...getPageSnapshot(),
            contact: extractContact(document, location.href),
            headings: headings().map((el, index) => ({
              index,
              text: (el.textContent || '').trim().slice(0, 160),
            })),
          });
        if (message.type !== 'DOME_ACT_V4' || message.url !== location.href)
          return;
        const action = message.action;
        if (action && ('elementId' in action)) {
          const result = agent.act(action);
          if (action.kind !== 'fill') {
            return settle(400).then(() => result);
          }
          return Promise.resolve(result);
        }
        if (action?.kind === 'scroll') {
          if (action.headingText?.trim()) {
            const ok = scrollToHeading(action.headingText);
            return settle().then(() => ({ ok }));
          }
          if (action.direction === 'top' || action.direction === 'bottom')
            globalThis.scrollTo({ top: action.direction === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'auto' });
          else
            globalThis.scrollBy({
              top:
                globalThis.innerHeight *
                0.75 *
                (action.direction === 'up' ? -1 : 1),
              behavior: 'auto',
            });
          return settle().then(() => ({ ok: true }));
        }
        if (action?.kind === 'heading') {
          const heading = headings()[action.index];
          heading?.scrollIntoView({ behavior: 'auto', block: 'center' });
          return settle().then(() => ({ ok: Boolean(heading) }));
        }
        if (action?.kind === 'find') {
          const finder = globalThis as typeof globalThis & {
            find?: (
              text: string,
              caseSensitive: boolean,
              backwards: boolean,
              wrap: boolean,
            ) => boolean;
          };
          const ok = Boolean(
            action.text.trim() &&
              finder.find?.(action.text.slice(0, 200), false, false, true),
          );
          return settle(400).then(() => ({ ok }));
        }
      },
    );
  },
});
