import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../app/components/ui/button';
import { Input } from '../../../../app/components/ui/input';
import {
  actOnPage,
  emptyContext,
  readActivePage,
  type PageContext,
  type PageAction,
} from '../lib/browser-context';
import PanelApp from './PanelApp';
import DesktopSelect from './DesktopSelect';

export default function Sidebar() {
  const { t } = useTranslation();
  const [page, setPage] = useState<PageContext>(emptyContext);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const next = await readActivePage();
      if (id === generation.current) {
        setPage(next);
        setStatus('');
      }
    } catch {
      if (id === generation.current)
        setPage({ ...emptyContext, error: 'pageAccess' });
    }
  }, []);
  useEffect(() => {
    refresh();
    const changed = (msg: { type?: string }) => {
      if (msg.type === 'DOME_PAGE_CHANGED') refresh();
    };
    browser.runtime.onMessage.addListener(changed);
    const focus = () => {
      refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      browser.runtime.onMessage.removeListener(changed);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  const act = async (action: PageAction) => {
    if (page.tabId === undefined) return false;
    const result = await actOnPage(page.tabId, page.url, action);
    setStatus(t(result.ok ? 'actionDone' : 'actionNotFound'));
    return result.ok;
  };
  return (
    <PanelApp
      snapshot={page}
      onClose={async () => {
        if (
          (import.meta.env.BROWSER === 'chrome' ||
            import.meta.env.BROWSER === 'edge') &&
          browser.sidePanel.close
        ) {
          const current = await browser.windows.getCurrent();
          await browser.sidePanel.close({ windowId: current.id! });
        } else if (import.meta.env.BROWSER === 'firefox') {
          await (
            browser as typeof browser & {
              sidebarAction: { close: () => Promise<void> };
            }
          ).sidebarAction.close();
        } else window.close();
      }}
      browserTools={
        <div className="browser-tools">
          <div className="context-line">
            <span title={page.url}>{page.title || t('currentPage')}</span>
            <Button variant="ghost" size="sm" onClick={refresh}>
              {t('refreshPage')}
            </Button>
          </div>
          {page.error ? (
            <div className="page-access" role="status">
              <p>{t(page.error)}</p>
              {/^https?:/.test(page.url) && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const granted = await browser.permissions.request({
                      origins: [`${new URL(page.url).origin}/*`],
                    });
                    if (granted) refresh();
                  }}
                >
                  {t('allowPage')}
                </Button>
              )}
            </div>
          ) : (
            <details>
              <summary>{t('browserActions')}</summary>
              <div className="browser-actions">
                <form
                  className="dome-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    act({ kind: 'find', text: search });
                  }}
                >
                  <Input
                    aria-label={t('findOnPage')}
                    value={search}
                    placeholder={t('findOnPage')}
                    onChange={(event) => setSearch(event.target.value)}
                    maxLength={200}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!search.trim()}
                  >
                    {t('find')}
                  </Button>
                </form>
                {page.headings.length > 0 && (
                  <DesktopSelect
                    label={t('jumpSection')}
                    value=""
                    items={[
                      { value: '', label: t('jumpSection') },
                      ...page.headings.map((h) => ({
                        value: String(h.index),
                        label: h.text,
                      })),
                    ]}
                    onChange={(value) => {
                      if (value) act({ kind: 'heading', index: Number(value) });
                    }}
                  />
                )}
                <div className="dome-row">
                  {(['up', 'down', 'top'] as const).map((direction) => (
                    <Button
                      key={direction}
                      variant="outline"
                      size="sm"
                      onClick={() => act({ kind: 'scroll', direction })}
                    >
                      {t(`scroll_${direction}`)}
                    </Button>
                  ))}
                </div>
                {status && <p role="status">{status}</p>}
              </div>
            </details>
          )}
        </div>
      }
    />
  );
}
