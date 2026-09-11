import * as api from './client';
import type { PageContext } from './browser-context';
import type { BrowserElement } from './page-agent';
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
}
export type AgentSnapshot = PageContext & {
  snapshotId: string;
  elements: BrowserElement[];
  screenshot?: string;
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
      return page;
    }
    return { ...page, screenshot: shot.dataUrl };
  };
  const read = async (includeScreenshot = false) => {
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
    if (!snapshot) throw new Error('Read browser_read_page first.');
    return browser.runtime.sendMessage({
      type: 'DOME_PAGE_ACTION',
      tabId,
      url: snapshot.url,
      action,
    });
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
    const failed =
      actionResult?.ok === false ||
      actionResult?.success === false ||
      Boolean(actionResult?.error && actionResult.ok !== true && actionResult.success !== true);
    snapshot = await requestSnapshot();
    return {
      success: !failed,
      ...(actionResult?.error ? { error: actionResult.error } : {}),
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
        const page = snapshot || (await read(false));
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
            url: page.url,
            title: page.title,
            screenshot: shot.dataUrl,
          },
        };
      }
      if (name === 'browser_extract_contact')
        return { success: true, data: (await read(false)).contact };
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
        snapshot = await requestSnapshot();
        return { success: true, url: nav?.url || url.href, data: snapshot };
      }
      if (name === 'browser_go_back') {
        snapshot = null;
        const back = (await browser.runtime.sendMessage({
          type: 'DOME_GO_BACK',
          tabId,
        })) as { success?: boolean; error?: string };
        if (back?.success === false) return { ...back };
        snapshot = await requestSnapshot();
        return { success: true, data: snapshot };
      }
      if (name === 'browser_click' || name === 'browser_fill') {
        const element = snapshot?.elements.find(
          (item) => item.id === args.elementId,
        );
        if (!element || snapshot?.snapshotId !== args.snapshotId)
          throw new Error('Read a fresh page snapshot first.');
        if (
          !(await review({
            name,
            detail: `${element.label}${name === 'browser_fill' ? `\n${String(args.value).slice(0, 1000)}` : element.href ? `\n${element.href}` : ''}`,
          }))
        )
          return { success: false, error: 'User declined action' };
        if (signal.aborted) return { success: false, error: 'Cancelled' };
        const acted = (await pageAction({
          kind: name === 'browser_click' ? 'click' : 'fill',
          ...args,
        })) as { success?: boolean; ok?: boolean; error?: string };
        if (name === 'browser_fill') return { ...acted };
        return rereadAfter(acted);
      }
      if (name === 'browser_scroll' || name === 'browser_find') {
        if (!snapshot) await read(false);
        const headingText =
          typeof args.headingText === 'string' ? args.headingText.trim() : '';
        const result = (await pageAction(
          name === 'browser_find'
            ? { kind: 'find', text: args.text }
            : headingText
              ? { kind: 'scroll', headingText }
              : { kind: 'scroll', direction: args.direction || 'down' },
        )) as { ok?: boolean; success?: boolean; error?: string };
        return rereadAfter(result);
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
