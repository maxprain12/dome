'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import HubListState from '@/components/ui/HubListState';
import { useTranslation } from 'react-i18next';

const LOADER_DELAY_MS = 150;
const REVEAL_MS = 150;
const BLUR_PX = 10;

type TabPaneReadyContextValue = {
  tabId: string;
  activationKey: number;
  signalReady: () => void;
};

const TabPaneReadyContext = createContext<TabPaneReadyContextValue | null>(null);

export function useTabPaneReadySignal() {
  return useContext(TabPaneReadyContext);
}

/** Mount inside tab content tree; signals ready once loading markers disappear. */
export function TabContentReadyNotifier() {
  const ctx = useContext(TabPaneReadyContext);
  const signaledRef = useRef(false);

  useEffect(() => {
    signaledRef.current = false;
  }, [ctx?.tabId, ctx?.activationKey]);

  useEffect(() => {
    if (!ctx || signaledRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 600;

    const poll = () => {
      if (cancelled || signaledRef.current) return;
      attempts += 1;
      const pane = document.querySelector(`[data-tab-pane="${CSS.escape(ctx.tabId)}"]`);
      const loading = pane?.querySelector('[data-tab-loading]');
      if (!loading || attempts >= maxAttempts) {
        signaledRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) ctx.signalReady();
          });
        });
        return;
      }
      requestAnimationFrame(poll);
    };

    requestAnimationFrame(poll);
    return () => {
      cancelled = true;
    };
  }, [ctx?.tabId, ctx?.activationKey, ctx?.signalReady]);

  return null;
}

type TabPaneShellProps = {
  tabId: string;
  isActive: boolean;
  isPersistent: boolean;
  children: ReactNode;
};

type RevealPhase = 'hidden' | 'animating' | 'shown';

export default function TabPaneShell({
  tabId,
  isActive,
  isPersistent,
  children,
}: TabPaneShellProps) {
  const { t } = useTranslation();
  const [activationKey, setActivationKey] = useState(0);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('hidden');
  const [showLoader, setShowLoader] = useState(false);
  const loaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activationGenRef = useRef(0);

  const clearLoaderTimer = useCallback(() => {
    if (loaderTimerRef.current) {
      clearTimeout(loaderTimerRef.current);
      loaderTimerRef.current = null;
    }
  }, []);

  const beginActivation = useCallback(() => {
    activationGenRef.current += 1;
    const gen = activationGenRef.current;
    clearLoaderTimer();
    setRevealPhase('hidden');
    setShowLoader(false);
    loaderTimerRef.current = setTimeout(() => {
      if (activationGenRef.current !== gen) return;
      setShowLoader(true);
    }, LOADER_DELAY_MS);
  }, [clearLoaderTimer]);

  useLayoutEffect(() => {
    if (isActive) {
      setActivationKey((k) => k + 1);
      beginActivation();
    }
  }, [isActive, tabId, beginActivation]);

  useEffect(() => () => clearLoaderTimer(), [clearLoaderTimer]);

  useLayoutEffect(() => {
    if (revealPhase !== 'animating') return;
    const id = requestAnimationFrame(() => setRevealPhase('shown'));
    return () => cancelAnimationFrame(id);
  }, [revealPhase]);

  const signalReady = useCallback(() => {
    clearLoaderTimer();
    setShowLoader(false);
    setRevealPhase('animating');
  }, [clearLoaderTimer]);

  const ctxValue = useMemo<TabPaneReadyContextValue>(
    () => ({ tabId, activationKey, signalReady }),
    [tabId, activationKey, signalReady],
  );

  if (!isActive && !isPersistent) return null;

  const stackClass = isActive
    ? 'absolute inset-0 flex flex-col min-h-0 min-w-0 overflow-hidden z-[1]'
    : 'hidden';

  return (
    <TabPaneReadyContext.Provider value={ctxValue}>
      <div
        data-tab-pane={tabId}
        className={stackClass}
        style={{ background: 'var(--dome-bg)' }}
        aria-hidden={!isActive}
      >
        <div
          className="relative flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden"
          style={{
            opacity: revealPhase === 'shown' ? 1 : 0,
            filter: revealPhase === 'shown' ? 'none' : `blur(${BLUR_PX}px)`,
            transition:
              revealPhase === 'animating' || revealPhase === 'shown'
                ? `opacity ${REVEAL_MS}ms ease-out, filter ${REVEAL_MS}ms ease-out`
                : 'none',
          }}
        >
          {children}
        </div>

        {showLoader ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            aria-busy
            aria-live="polite"
          >
            <HubListState variant="loading" loadingLabel={t('common.loading')} compact />
          </div>
        ) : null}
      </div>
    </TabPaneReadyContext.Provider>
  );
}
