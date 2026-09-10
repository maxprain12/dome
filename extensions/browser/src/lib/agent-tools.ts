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
  const read = async () => {
    if (tabId === undefined)
      throw new Error('No browser tab selected. Open a website first.');
    snapshot = (await browser.runtime.sendMessage({
      type: 'DOME_AGENT_READ',
      tabId,
    })) as AgentSnapshot;
    if (snapshot.error)
      throw new Error(
        'This site needs access. Use Allow this site in the sidebar, then try again.',
      );
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
  return async ({
    name,
    args,
  }: ToolRequest): Promise<Record<string, unknown>> => {
    try {
      if (signal.aborted) return { success: false, error: 'Cancelled' };
      if (name === 'browser_read_page')
        return { success: true, data: await read() };
      if (name === 'browser_extract_contact')
        return { success: true, data: (await read()).contact };
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
        return browser.runtime.sendMessage({
          type: 'DOME_NAVIGATE',
          tabId,
          url: url.href,
        });
      }
      if (name === 'browser_go_back') {
        snapshot = null;
        return browser.runtime.sendMessage({ type: 'DOME_GO_BACK', tabId });
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
        return pageAction({
          kind: name === 'browser_click' ? 'click' : 'fill',
          ...args,
        });
      }
      if (name === 'browser_scroll' || name === 'browser_find') {
        if (!snapshot) await read();
        const result = await pageAction(
          name === 'browser_find'
            ? { kind: 'find', text: args.text }
            : { kind: 'scroll', direction: args.direction },
        );
        return { success: result.ok === true };
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
        const page = await read();
        return api.captureUrl(token, {
          projectId,
          url: page.url,
          title: page.title.slice(0, 300),
          readableText: page.readableText,
        });
      }
      if (name === 'dome_save_contact') {
        const contact = (await read()).contact;
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
