import * as api from './client';
import type { PageContext } from './browser-context';
import type { BrowserElement } from './page-agent';
import type { ExtractedSocialCard } from './extractors';
export interface ToolRequest {
  type: 'browser_tool';
  callId: string;
  streamId: string;
  name: string;
  args: Record<string, unknown>;
}
export interface ToolReview {
  name: string;
  detail: string;
  origin?: string;
  pageUrl?: string;
}
export type AgentSnapshot = PageContext & {
  snapshotId: string;
  elements: BrowserElement[];
  screenshot?: string;
  screenshotError?: string;
  social?: ExtractedSocialCard | null;
};

export function createToolRunner({
  token,
  projectId,
  tabId,
  review,
  signal,
}: {
  token: string;
  projectId: string;
  tabId?: number;
  review: (value: ToolReview) => Promise<boolean>;
  signal: AbortSignal;
}) {
  let snapshot: AgentSnapshot | null = null;
  const requestSnapshot = async () =>
    (await browser.runtime.sendMessage({
      type: 'DOME_AGENT_READ',
      tabId,
    })) as AgentSnapshot;
  const captureTab = async () =>
    (await browser.runtime.sendMessage({
      type: 'DOME_CAPTURE_TAB',
      tabId,
    })) as { dataUrl?: string; error?: string };
  const withScreenshot = async (
    page: AgentSnapshot,
    includeScreenshot: boolean,
  ): Promise<AgentSnapshot> => {
    if (!includeScreenshot) return page;
    const shot = await captureTab();
    if (!shot?.dataUrl) {
      return { ...page, screenshotError: shot?.error || 'Screenshot unavailable' };
    }
    return { ...page, screenshot: shot.dataUrl };
  };
  const read = async (includeScreenshot = false) => {
    if (signal.aborted) throw new Error('Cancelled');
    if (tabId === undefined)
      throw new Error('No browser tab selected. Open a website first.');
    snapshot = await requestSnapshot();
    if (snapshot.error === 'pageAccess' && /^https?:\/\//.test(snapshot.url)) {
      const origin = new URL(snapshot.url).origin;
      const approved = await review({
        name: 'browser_read_page',
        detail: snapshot.url,
        origin,
      });
      if (!approved)
        throw new Error('User declined access to the current page.');
      if (signal.aborted) throw new Error('Cancelled');
      snapshot = await requestSnapshot();
    }
    if (snapshot.error === 'unsupportedPage')
      throw new Error('Open an HTTP(S) website first.');
    if (snapshot.error)
      throw new Error(
        'This site needs access. Use Allow this site in the sidebar, then try again.',
      );
    snapshot = await withScreenshot(snapshot, includeScreenshot);
    return snapshot;
  };
  const pageAction = async (action: unknown) => {
    if (signal.aborted) throw new Error('Cancelled');
    if (!snapshot) throw new Error('Read browser_read_page first.');
    const cancel = () => { browser.runtime.sendMessage({ type: 'DOME_CANCEL_PAGE_ACTION', tabId }).catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      return await browser.runtime.sendMessage({ type: 'DOME_PAGE_ACTION', tabId, url: snapshot.url, action });
    } finally { signal.removeEventListener('abort', cancel); }
  };
  const getProjectNote = async (id: unknown) => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(id))
      throw new Error('Invalid note id');
    const note = await api.getNote(token, id);
    if (!note.success) throw new Error(note.error);
    if (note.data.projectId !== projectId)
      throw new Error('Note belongs to another project.');
    return note.data;
  };
  const rereadAfter = async (actionResult: {
    ok?: boolean;
    success?: boolean;
    error?: string;
  }) => {
    const failed = actionResult?.ok !== true && actionResult?.success !== true;
    snapshot = await read(false);
    return {
      success: !failed,
      ...(failed ? { error: actionResult?.error || 'Action was not confirmed. Inspect the fresh page before retrying.' } : {}),
      data: snapshot,
    };
  };
  return async ({
    name,
    args,
  }: ToolRequest): Promise<Record<string, unknown>> => {
    try {
      if (signal.aborted) return { success: false, error: 'Cancelled' };
      if (name === 'browser_read_page')
        return {
          success: true,
          data: await read(args.includeScreenshot === true),
        };
      if (name === 'browser_screenshot') {
        const page = await read(false);
        const shot = await captureTab();
        if (!shot?.dataUrl) {
          return {
            success: false,
            error: shot?.error || 'Could not capture the visible tab.',
            data: { url: page.url, title: page.title },
          };
        }
        return {
          success: true,
          data: {
            ...page,
            screenshot: shot.dataUrl,
          },
        };
      }
      if (name === 'browser_extract_contact')
        return { success: true, data: (await read(false)).contact };
      if (name === 'browser_extract_social') {
        const page = await read(false);
        if (!page.social) {
          return {
            success: false,
            error: 'This tab is not a supported Instagram, LinkedIn or X profile/post.',
            data: { url: page.url, title: page.title },
          };
        }
        return { success: true, source: 'social_public', card: page.social };
      }
      if (name === 'browser_navigate') {
        const url = new URL(String(args.url));
        if (!['http:', 'https:'].includes(url.protocol))
          throw new Error('Only web URLs are supported.');
        if (
          !(await browser.permissions.contains({
            origins: [`${url.origin}/*`],
          }))
        ) {
          if (!(await review({ name, detail: url.href, origin: url.origin })))
            return { success: false, error: 'User declined site access' };
        }
        if (signal.aborted) return { success: false, error: 'Cancelled' };
        snapshot = null;
        const nav = (await browser.runtime.sendMessage({
          type: 'DOME_NAVIGATE',
          tabId,
          url: url.href,
        })) as { success?: boolean; url?: string; error?: string };
        if (nav?.success === false) return { ...nav };
        snapshot = await read(false);
        return { success: true, url: nav?.url || url.href, data: snapshot };
      }
      if (name === 'browser_go_back') {
        snapshot = null;
        const back = (await browser.runtime.sendMessage({
          type: 'DOME_GO_BACK',
          tabId,
        })) as { success?: boolean; error?: string };
        if (back?.success === false) return { ...back };
        snapshot = await read(false);
        return { success: true, data: snapshot };
      }
      if (name === 'browser_click' || name === 'browser_fill' || name === 'browser_select') {
        const element = snapshot?.elements.find(
          (item) => item.id === args.elementId,
        );
        if (!element || snapshot?.snapshotId !== args.snapshotId)
          return { success: false, error: 'This reference is from an earlier read or turn. Choose the target from this fresh snapshot and retry.', data: await read(false) };
        if (
          !(await review({
            name,
            pageUrl: snapshot?.url,
            detail: `${element.label}${name === 'browser_fill' || name === 'browser_select' ? `\n${String(args.value)}` : element.href ? `\n${element.href}` : ''}`,
          }))
        )
          return { success: false, error: 'User declined action' };
        if (signal.aborted) return { success: false, error: 'Cancelled' };
        const acted = (await pageAction({
          ...args,
          kind: name === 'browser_click' ? 'click' : name === 'browser_select' ? 'select' : 'fill',
        })) as { success?: boolean; ok?: boolean; error?: string };
        return rereadAfter(acted);
      }
      if (name === 'browser_scroll' || name === 'browser_find') {
        if (!snapshot) await read(false);
        const headingText =
          typeof args.headingText === 'string' ? args.headingText.trim() : '';
        if ((args.elementId || args.snapshotId) && (!args.elementId || args.snapshotId !== snapshot?.snapshotId)) throw new Error('Read a fresh snapshot and supply both target IDs.');
        const result = (await pageAction(
          args.elementId ? { kind: 'scroll', elementId: args.elementId, snapshotId: args.snapshotId, direction: args.direction || 'down' } : name === 'browser_find'
            ? { kind: 'find', text: args.text }
            : headingText
              ? { kind: 'scroll', headingText }
              : { kind: 'scroll', direction: args.direction || 'down' },
        )) as { ok?: boolean; success?: boolean; error?: string };
        return rereadAfter(result);
      }
      if (name === 'browser_wait') {
        const text = String(args.text || '').trim();
        if (!text) throw new Error('Text is required.');
        const deadline = Date.now() + Math.min(10000, Math.max(250, Number(args.timeoutMs) || 5000));
        do {
          if (signal.aborted) throw new Error('Cancelled');
          const page = await read(false);
          if (page.readableText.includes(text) || page.viewportText?.includes(text)) return { success: true, data: page };
          await new Promise<void>((resolve) => {
            const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, 250);
            signal.addEventListener('abort', finish, { once: true });
          });
        } while (Date.now() < deadline);
        return { success: false, error: 'Timed out waiting for page text.', data: snapshot };
      }
      if (!projectId) throw new Error('Select a Dome project first.');
      if (name === 'dome_list_notes') return api.listNotes(token, projectId);
      if (name === 'dome_read_note')
        return { success: true, data: await getProjectNote(args.noteId) };
      if (name === 'dome_create_note')
        return api.createNote(token, {
          projectId,
          title: String(args.title),
          markdown: String(args.markdown),
        });
      if (name === 'dome_append_note') {
        const note = await getProjectNote(args.noteId);
        return api.updateNote(token, note.id, {
          markdown: `${note.markdown}\n\n${String(args.markdown)}`,
          expectedUpdatedAt: note.updatedAt,
          expectedRevision: note.revision,
        });
      }
      if (name === 'dome_capture_page') {
        const page = await read(false);
        return api.captureUrl(token, {
          projectId,
          url: page.url,
          title: page.title.slice(0, 300),
          readableText: page.readableText,
        });
      }
      if (name === 'dome_save_contact') {
        const contact = (await read(false)).contact;
        if (!contact) throw new Error('No person detected on this page.');
        return api.saveContact(token, {
          ...contact,
          projectId,
          notes: [contact.notes, args.notes]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 4000),
        });
      }
      throw new Error('Unknown browser tool');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Browser tool failed',
      };
    }
  };
}
