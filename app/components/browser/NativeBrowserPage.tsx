import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon, ArrowExpand01Icon, RefreshIcon, Globe02Icon, Cancel01Icon, Add01Icon, LinkSquare01Icon } from '@hugeicons/core-free-icons';
import { useTabStore } from '@/lib/store/useTabStore';
import { useBrowserWorkspaceStore } from '@/lib/store/useBrowserWorkspaceStore';
import { continueBrowserWithMany } from '@/lib/browser/openDomeBrowser';
import type { BrowserState } from '@/lib/browser/openDomeBrowser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';

export default function NativeBrowserPage({ sessionId, conversationId, embedded = false }: { sessionId: string; conversationId?: string; embedded?: boolean }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const addressFocused = useRef(false);
  const overlayVisible = useRef(false);
  const active = useTabStore(state => state.activeTabId === (embedded ? `chat:${conversationId}` : `browser:${sessionId}`));
  const originConversationId = useTabStore(state => state.tabs.find(tab => tab.id === `browser:${sessionId}`)?.browserConversationId);
  const chatId = conversationId || originConversationId;
  const [page, setPage] = useState<BrowserState | null>(null);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const attach = useCallback(async () => {
    if (overlayVisible.current) return;
    const box = container.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    const response = await window.electron.invoke('native-browser:attach', {
      sessionId, bounds: { x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)), width: Math.floor(box.width), height: Math.floor(box.height) },
    });
    if (!response.success) setError(response.error || t('native_browser.closed'));
  }, [sessionId, t]);

  useEffect(() => {
    if (!active || !container.current) return;
    let alive = true;
    const refresh = async () => {
      try {
        const response = await window.electron.invoke('native-browser:state', { sessionId, ...(chatId ? { conversationId: chatId } : {}) });
        if (!alive) return;
        if (!response.success) { setError(response.error || t('native_browser.closed')); return; }
        const state = response.data as BrowserState;
        setPage(state);
        if (!addressFocused.current) setAddress(state.url === 'about:blank' ? '' : state.url);
      } catch (reason) { if (alive) setError(String(reason)); }
    };
    const observer = new ResizeObserver(() => { void attach(); });
    const updateOverlay = () => {
      const visible = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(element => element.getAttribute('aria-hidden') !== 'true' && element.getBoundingClientRect().height > 0);
      if (visible === overlayVisible.current) return;
      overlayVisible.current = visible;
      if (visible) void window.electron.invoke('native-browser:detach', { sessionId });
      else void attach();
    };
    const overlays = new MutationObserver(updateOverlay);
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-hidden', 'data-state'] });
    updateOverlay();
    observer.observe(container.current);
    const interval = setInterval(() => { void refresh(); }, 1000);
    window.addEventListener('resize', attach);
    void refresh(); void attach();
    return () => {
      alive = false; observer.disconnect(); clearInterval(interval);
      overlays.disconnect();
      window.removeEventListener('resize', attach);
      void window.electron.invoke('native-browser:detach', { sessionId });
    };
  }, [active, sessionId, t, attach, chatId]);

  const perform = async (action: string, extra: Record<string, string> = {}) => {
    setPending(true); setError('');
    try {
      const response = await window.electron.invoke('native-browser:control', { sessionId, action, ...extra });
      if (!response.success) throw new Error(response.error || t('native_browser.closed'));
      setPage(response.data as BrowserState);
      if (!addressFocused.current) setAddress(response.data.url === 'about:blank' ? '' : response.data.url);
      await attach();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(false); }
  };
  const navigate = () => {
    const input = address.trim();
    if (!input) return;
    const url = /^https?:\/\//i.test(input) ? input : /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(input) ? `https://${input}` : `https://duckduckgo.com/?q=${encodeURIComponent(input)}`;
    addressFocused.current = false;
    void perform('navigate', { url });
  };
  const close = () => {
    if (embedded && conversationId) useBrowserWorkspaceStore.getState().closePanel(conversationId);
    else useTabStore.getState().closeTab(`browser:${sessionId}`);
  };
  const expand = () => {
    if (conversationId) useBrowserWorkspaceStore.getState().closePanel(conversationId);
    useTabStore.getState().openTab({ id: `browser:${sessionId}`, type: 'browser', browserSessionId: sessionId, browserConversationId: conversationId, title: page?.title || t('native_browser.title') });
  };
  const share = async () => {
    if (!page) return;
    setPending(true); setError('');
    try { await continueBrowserWithMany(page, conversationId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(false); }
  };
  const unshare = async () => {
    if (!chatId) return;
    const response = await window.electron.invoke('native-browser:unshare', { conversationId: chatId });
    if (response.success) setPage(current => current && { ...current, shared: false });
    else setError(response.error || t('native_browser.closed'));
  };
  const busy = pending || page?.busy;
  return (
    <section aria-label={t('native_browser.title')} className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={Globe02Icon} className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{page?.title || t('native_browser.title')}</span>
            {page?.persistent ? <Badge variant="secondary">{t('native_browser.saved_profile')}</Badge> : null}
            {page?.shared ? <Badge variant="outline">{t('native_browser.shared')}</Badge> : null}
            {page?.busy ? <Badge variant="outline">{t('native_browser.agent_working')}</Badge> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {embedded ? <Button variant="ghost" size="icon-sm" aria-label={t('native_browser.expand')} title={t('native_browser.expand')} onClick={expand}><HugeiconsIcon icon={ArrowExpand01Icon} data-icon="inline-start" /></Button> : null}
            <Button variant="ghost" size="icon-sm" aria-label={t('common.close')} title={t('common.close')} onClick={close}><HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" /></Button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={!page?.canGoBack || busy} aria-label={t('native_browser.back')} onClick={() => { void perform('back'); }}><HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" /></Button>
          <Button variant="ghost" size="icon-sm" disabled={!page?.canGoForward || busy} aria-label={t('native_browser.forward')} onClick={() => { void perform('forward'); }}><HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-start" /></Button>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={t(page?.loading ? 'native_browser.stop' : 'native_browser.reload')} onClick={() => { void perform(page?.loading ? 'stop' : 'reload'); }}><HugeiconsIcon icon={page?.loading ? Cancel01Icon : RefreshIcon} data-icon="inline-start" /></Button>
          <form className="min-w-0 flex-1" onSubmit={event => { event.preventDefault(); navigate(); }}>
            <FieldGroup><Field><InputGroup>
              <InputGroupInput aria-label={t('native_browser.address')} placeholder={t('native_browser.address')} value={address} onChange={event => setAddress(event.target.value)} onFocus={() => { addressFocused.current = true; }} onBlur={() => { addressFocused.current = false; }} disabled={!!busy} />
              <InputGroupAddon align="inline-end"><InputGroupButton type="submit" disabled={!!busy || !address.trim()} aria-label={t('native_browser.go')}><HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-start" /></InputGroupButton></InputGroupAddon>
            </InputGroup></Field></FieldGroup>
          </form>
          <Button variant="ghost" size="icon-sm" disabled={!page?.url || page.url === 'about:blank'} aria-label={t('native_browser.external')} title={t('native_browser.external')} onClick={() => { if (page) void window.electron.invoke('open-external-url', page.url); }}><HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" /></Button>
        </div>
        <nav aria-label={t('native_browser.pages')} className="flex items-center gap-1 overflow-x-auto">
          {page?.tabs.map(tab => <div key={tab.id} className="flex shrink-0 items-center">
            <Button size="sm" variant={page.tabId === tab.id ? 'secondary' : 'ghost'} disabled={!!busy} aria-current={page.tabId === tab.id ? 'page' : undefined} onClick={() => { void perform('switch', { tabId: tab.id }); }}><span className="max-w-40 truncate">{tab.title || t('native_browser.new_page')}</span></Button>
            {page.tabs.length > 1 ? <Button size="icon-sm" variant="ghost" disabled={!!busy} aria-label={t('native_browser.close_page', { title: tab.title || t('native_browser.new_page') })} onClick={() => { void perform('close', { tabId: tab.id }); }}><HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" /></Button> : null}
          </div>)}
          <Button size="icon-sm" variant="ghost" disabled={!!busy} aria-label={t('native_browser.new_page')} onClick={() => { void perform('new'); }}><HugeiconsIcon icon={Add01Icon} data-icon="inline-start" /></Button>
        </nav>
      </header>
      {error ? <Alert variant="destructive" className="shrink-0"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div ref={container} aria-label={t('native_browser.page_content')} className="min-h-0 flex-1" />
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t(page?.shared ? 'native_browser.shared_help' : page?.persistent ? 'native_browser.session_help' : 'native_browser.recovery_help')}</p>
        {page?.shared ? <Button size="sm" variant="ghost" onClick={() => { void unshare(); }}>{t('native_browser.unshare')}</Button> : null}
        <Button size="sm" disabled={!page?.persistent || !page.url.startsWith('http') || page.loading || !!busy} onClick={() => { void share(); }}>{t('native_browser.continue_many')}</Button>
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{page?.loading ? t('native_browser.loading') : page?.busy ? t('native_browser.agent_working') : page?.title}</p>
    </section>
  );
}
