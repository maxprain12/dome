import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { continueBrowserWithMany, reopenDomeBrowser, showDomeBrowser } from './openDomeBrowser';
import type { BrowserState } from './openDomeBrowser';
import { useTabStore } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { useBrowserWorkspaceStore } from '@/lib/store/useBrowserWorkspaceStore';

const state: BrowserState = { sessionId: 'desktop:research', tabId: 'fixture-page', title: 'Fixture', url: 'https://example.org/profile', persistent: true, busy: false, loading: false, canGoBack: false, canGoForward: false, tabs: [] };
beforeEach(() => {
  useTabStore.setState({ tabs: [{ id: 'chat:research-chat', type: 'chat', resourceId: 'research-chat', title: 'Research' }], activeTabId: 'chat:research-chat' });
  useManyStore.setState({ currentSessionId: 'research-chat', sessions: [{ id: 'research-chat', title: 'Research', messages: [], createdAt: 1 }], pendingManyHandoff: null });
  useBrowserWorkspaceStore.setState({ panels: {} });
  useManyStore.setState({ isOpen: false });
});
describe('Dome browser handoff', () => {
  it('reopens the retained page without creating a new search page', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true, data: state });
    await reopenDomeBrowser();
    expect(window.electron.invoke).toHaveBeenCalledWith('native-browser:state', { sessionId: state.sessionId });
    expect(window.electron.invoke).not.toHaveBeenCalledWith('native-browser:open', expect.anything());
    expect(useBrowserWorkspaceStore.getState().panels['research-chat']).toBe(state.sessionId);
  });
  it('starts the browser when no retained session exists', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValueOnce({ success: false, error: 'Closed' }).mockResolvedValueOnce({ success: true, data: state });
    await reopenDomeBrowser();
    expect(window.electron.invoke).toHaveBeenCalledWith('native-browser:open', { url: 'https://www.google.com/' });
  });
  it('keeps a sidebar Many link beside the same conversation', () => {
    useTabStore.setState({ activeTabId: 'home' });
    useManyStore.setState({ isOpen: true });
    showDomeBrowser(state.sessionId);
    expect(useTabStore.getState().activeTabId).toBe('chat:research-chat');
    expect(useBrowserWorkspaceStore.getState().panels['research-chat']).toBe(state.sessionId);
  });
  it('opens a web hyperlink beside its conversation without using the system browser', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true, data: state });
    await openDomeHref(state.url);
    expect(window.electron.invoke).toHaveBeenCalledWith('native-browser:open', { url: state.url });
    expect(window.electron.invoke).not.toHaveBeenCalledWith('open-external-url', expect.anything());
    expect(useBrowserWorkspaceStore.getState().panels['research-chat']).toBe(state.sessionId);
    expect(useTabStore.getState().activeTabId).toBe('chat:research-chat');
  });
  it('shares only the selected page with the originating chat and prepares continuation', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true });
    await continueBrowserWithMany(state, 'research-chat');
    expect(window.electron.invoke).toHaveBeenCalledWith('native-browser:share', { sessionId: state.sessionId, tabId: state.tabId, conversationId: 'research-chat' });
    expect(useManyStore.getState().pendingManyHandoff).toContain(state.url);
    expect(useBrowserWorkspaceStore.getState().panels['research-chat']).toBe(state.sessionId);
  });
  it('does not claim sharing succeeded when main rejects it', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: false, error: 'Closed page' });
    await expect(continueBrowserWithMany(state, 'research-chat')).rejects.toThrow('Closed page');
    expect(useManyStore.getState().pendingManyHandoff).toBeNull();
  });
  it('keeps mail links external and opens non-chat browsing in a Dome tab', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true });
    await openDomeHref('mailto:fixture@example.org');
    expect(window.electron.invoke).toHaveBeenCalledWith('open-external-url', 'mailto:fixture@example.org');
    useTabStore.setState({ activeTabId: 'home' });
    showDomeBrowser(state.sessionId);
    expect(useTabStore.getState().activeTabId).toBe(`browser:${state.sessionId}`);
  });
});
