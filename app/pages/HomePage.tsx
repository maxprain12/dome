import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Home from '@/components/home/Home';
import Onboarding from '@/components/onboarding/Onboarding';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { initializeApp } from '@/lib/init';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

// Timeout for initialization (10 seconds)
const INIT_TIMEOUT_MS = 10000;

export default function HomePage() {
  const { t } = useTranslation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [, setDebugInfo] = useState<string>('Starting...');
  const { loadUserProfile } = useUserStore();
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const scheduleTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeoutIds.push(id);
      return id;
    };

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        scheduleTimeout(() => resolve(), ms);
      });

    async function init() {
      setDebugInfo('Init effect starting...');

      try {
        // Wait a bit to ensure Electron preload script has loaded
        setDebugInfo('Checking for window.electron...');

        if (typeof window !== 'undefined' && !window.electron) {
          // Wait for Electron API to be available (max 2 seconds)
          setDebugInfo('Waiting for Electron API...');
          let retries = 0;
          while (typeof window !== 'undefined' && !window.electron && retries < 20) {
            if (cancelled) return;
            await delay(100);
            retries++;
          }
          if (cancelled) return;
          setDebugInfo(`Waited ${retries * 100}ms for Electron API`);
        }

        // Log electron availability
        const hasElectron = typeof window !== 'undefined' && !!window.electron;
        if (hasElectron) {
          console.info('[Page] Electron APIs:', Object.keys(window.electron || {}));
        }
        setDebugInfo(`Electron available: ${hasElectron}`);

        let initRaceTimer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          initRaceTimer = scheduleTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT_MS);
        });

        setDebugInfo('Calling initializeApp...');

        let result: Awaited<ReturnType<typeof initializeApp>>;
        try {
          result = await Promise.race([initializeApp(), timeoutPromise]);
        } finally {
          if (initRaceTimer != null) clearTimeout(initRaceTimer);
        }

        if (cancelled) return;

        setDebugInfo(`Init result: ${JSON.stringify(result)}`);

        if (result.success) {
          // Load user profile and preferences from DB
          // These functions now handle the case when DB is not available
          // Also add timeout for these operations
          setDebugInfo('Loading profile and preferences...');

          let profileRaceTimer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.all([loadUserProfile(), loadPreferences()]),
              new Promise<never>((_, reject) => {
                profileRaceTimer = scheduleTimeout(() => reject(new Error('Profile load timeout')), 5000);
              }),
            ]);
          } catch (err) {
            console.warn('[Page] Failed to load profile/preferences:', err);
            // Continue anyway - defaults will be used
          } finally {
            if (profileRaceTimer != null) clearTimeout(profileRaceTimer);
          }

          if (cancelled) return;

          setDebugInfo('Checking onboarding...');

          // Check if onboarding is needed
          if (result.needsOnboarding) {
            setShowOnboarding(true);
          }

          setIsInitialized(true);
        } else {
          console.error('[Page] Failed to initialize app');
          setIsInitialized(true);
          setShowOnboarding(true);
        }
      } catch (error) {
        // Handle timeout or any other initialization error
        if (cancelled) return;
        console.error('[Page] Initialization failed or timed out:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        setDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsInitialized(true);
        setShowOnboarding(true);
      }
    }

    void init();

    return () => {
      cancelled = true;
      for (const id of timeoutIds) clearTimeout(id);
    };
  }, [loadUserProfile, loadPreferences]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  if (!isInitialized) {
    return (
      <div
        data-tab-loading
        className="min-h-full flex items-center justify-center bg-background"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          <span>{t('app.initializing')}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Show warning banner if there was an init error */}
      {initError && (
        <Alert variant="destructive" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
          <AlertTitle>{t('app.limited_functionality')}</AlertTitle>
          <AlertDescription>{initError}</AlertDescription>
        </Alert>
      )}
      <Home />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    </>
  );
}
