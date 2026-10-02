import i18n from '@/lib/i18n';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useBrowserWorkspaceStore } from '@/lib/store/useBrowserWorkspaceStore';

export interface BrowserState {
  sessionId: string;
  tabId: string;
  url: string;
  title: string;
  loading: boolean;
  busy: boolean;
  persistent: boolean;
  shared?: boolean;
  error?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  tabs: Array<{ id: string; title: string; url: string }>;
}

export function showDomeBrowser(sessionId: string, originConversationId?: string): void {
  const { activeTabId, tabs } = useTabStore.getState();
  const existing = tabs.find(tab => tab.id === `browser:${sessionId}`);
  const many = useManyStore.getState();
  const sidebarConversation = many.isOpen ? many.currentSessionId : undefined;
  const conversationId = originConversationId || (activeTabId.startsWith('chat:') ? activeTabId.slice(5) : sidebarConversation || existing?.browserConversationId || undefined);
  if (conversationId && (originConversationId || activeTabId.startsWith('chat:') || sidebarConversation)) {
    if (sidebarConversation && !activeTabId.startsWith('chat:')) useTabStore.getState().openChatTab(conversationId, many.sessions.find(session => session.id === conversationId)?.title || i18n.t('many.many'));
    useBrowserWorkspaceStore.getState().openPanel(conversationId, sessionId);
    return;
  }
  useTabStore.getState().openTab({ id: `browser:${sessionId}`, type: 'browser', browserSessionId: sessionId,
    browserConversationId: conversationId, title: i18n.t('native_browser.title') });
}

export async function openDomeBrowser(url: string): Promise<void> {
  const activeTabId = useTabStore.getState().activeTabId;
  const many = useManyStore.getState();
  const origin = activeTabId.startsWith('chat:') ? activeTabId.slice(5) : many.isOpen ? many.currentSessionId : undefined;
  const response = await window.electron.invoke('native-browser:open', { url });
  if (!response.success || !response.data?.sessionId) throw new Error(response.error || i18n.t('native_browser.closed'));
  showDomeBrowser(response.data.sessionId, origin || undefined);
}

export async function reopenDomeBrowser(): Promise<void> {
  const response = await window.electron.invoke('native-browser:state', { sessionId: 'desktop:research' });
  if (response.success && response.data?.sessionId) showDomeBrowser(response.data.sessionId);
  else await openDomeBrowser('https://www.google.com/');
}

export async function continueBrowserWithMany(state: BrowserState, originConversationId?: string): Promise<void> {
  const origin = originConversationId || useTabStore.getState().tabs.find(tab => tab.id === `browser:${state.sessionId}`)?.browserConversationId;
  const many = useManyStore.getState();
  if (origin) many.switchSession(origin);
  if (!useManyStore.getState().currentSessionId) many.startNewChat();
  const conversationId = useManyStore.getState().currentSessionId;
  if (!conversationId) throw new Error(i18n.t('native_browser.closed'));
  const response = await window.electron.invoke('native-browser:share', { sessionId: state.sessionId, tabId: state.tabId, conversationId });
  if (!response.success) throw new Error(response.error || i18n.t('native_browser.closed'));
  const session = useManyStore.getState().sessions.find(item => item.id === conversationId);
  useManyStore.getState().setPendingManyHandoff(i18n.t('native_browser.continue_prompt', { url: state.url }));
  useBrowserWorkspaceStore.getState().openPanel(conversationId, state.sessionId);
  useTabStore.getState().openChatTab(conversationId, session?.title || i18n.t('native_browser.title'));
}
