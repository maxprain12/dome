/**
 * ManyPopoutPage — dedicated Electron window for Many chat (no AppShell).
 *
 * Loaded via `window:create({ id: 'many-popout', route: '/standalone/many?...' })`.
 * Shares session state through JSONL threads + localStorage (same userData).
 */
import { useEffect, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { loadManyPanelModule, type ManyPanelComponent } from '@/components/many/manyPanelModule';
import ApprovalProvider from '@/components/approval/ApprovalProvider';
import ToastContainer from '@/components/ui/Toast';

export default function ManyPopoutPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);
  const switchSession = useManyStore((s) => s.switchSession);
  const [ManyPanelComp, setManyPanelComp] = useState<ManyPanelComponent | null>(null);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

  useEffect(() => {
    void loadManyPanelModule().then((m) => {
      setManyPanelComp(() => m.default);
    });
  }, []);

  useEffect(() => {
    if (sessionId) switchSession(sessionId);
  }, [sessionId, switchSession]);

  useEffect(() => {
    document.title = `${t('many.many')} — Dome`;
  }, [t]);

  const handleClose = useCallback(() => {
    void window.electron?.invoke('window:close-current');
  }, []);

  if (!ManyPanelComp) {
    return (
      <div className="many-popout-root flex h-screen w-screen items-center justify-center">
        <span className="text-xs text-[var(--dome-text-muted)]">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="many-popout-root h-screen w-screen overflow-hidden">
        <ManyPanelComp
          width={0}
          onClose={handleClose}
          isVisible
          isFullscreen
          isPopout
        />
      </div>
      <ApprovalProvider />
      <ToastContainer />
    </>
  );
}
