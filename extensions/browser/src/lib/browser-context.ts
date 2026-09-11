import type { ContactDraft } from './protocol';

export interface PageContext {
  tabId?: number;
  url: string;
  title: string;
  selection: string;
  readableText: string;
  contact: ContactDraft | null;
  headings: Array<{ index: number; text: string }>;
  sections?: Array<{ heading: string; text: string }>;
  error?: string;
}
export type PageAction =
  | { kind: 'find'; text: string }
  | { kind: 'heading'; index: number }
  | {
      kind: 'scroll';
      direction?: 'up' | 'down' | 'top';
      headingText?: string;
    };
export const emptyContext: PageContext = {
  url: '',
  title: '',
  selection: '',
  readableText: '',
  contact: null,
  headings: [],
  sections: [],
};
export async function readActivePage(): Promise<PageContext> {
  return browser.runtime.sendMessage({ type: 'DOME_READ_PAGE' });
}
export async function actOnPage(
  tabId: number,
  url: string,
  action: PageAction,
) {
  return browser.runtime.sendMessage({
    type: 'DOME_PAGE_ACTION',
    tabId,
    url,
    action,
  }) as Promise<{ ok: boolean }>;
}
