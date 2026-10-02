import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Globe02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { openDomeBrowser } from '@/lib/browser/openDomeBrowser';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useBrowserWorkspaceStore } from '@/lib/store/useBrowserWorkspaceStore';
import { showToast } from '@/lib/store/useToastStore';

export function OpenBrowserButton() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const open = async () => {
    setPending(true);
    try {
      const many = useManyStore.getState();
      if (!many.currentSessionId) many.startNewChat();
      const id = useManyStore.getState().currentSessionId;
      if (!id) return;
      useTabStore.getState().openChatTab(id, many.sessions.find(session => session.id === id)?.title || t('many.many'));
      const existing = useBrowserWorkspaceStore.getState().panels[id];
      if (!existing) await openDomeBrowser('https://www.google.com/');
    } catch (error) { showToast('error', error instanceof Error ? error.message : t('native_browser.closed')); }
    finally { setPending(false); }
  };
  return <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={t('native_browser.open_browser')} title={t('native_browser.open_browser')} onClick={() => { void open(); }}><HugeiconsIcon icon={Globe02Icon} data-icon="inline-start" /></Button>;
}
