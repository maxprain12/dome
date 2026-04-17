import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Home from '@/components/home/Home';
import Onboarding from '@/components/onboarding/Onboarding';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { initializeApp } from '@/lib/init';

// Timeout for initialization (10 seconds)
const INIT_TIMEOUT_MS = 10000;

export default function HomePage() {
  const { t } = useTranslation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('Starting...');
  const { loadUserProfile } = useUserStore();
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    async function init() {
      setDebugInfo('Init effect starting...');

      try {
        // Wait a bit to ensure Electron preload script has loaded
        setDebugInfo('Checking for window.electron...');

        if (typeof window !== 'undefined' && !window.electron) {
          // Wait for Electron API to be available (max 2 seconds)
          setDebugInfo('Waiting for Electron API...');
          let retries = 0;
          while (!window.electron && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
          }
          setDebugInfo(`Waited ${retries * 100}ms for Electron API`);
        }

        // Log electron availability
        const hasElectron = typeof window !== 'undefined' && !!window.electron;
        if (hasElectron) {
          console.info('[Page] Electron APIs:', Object.keys(window.electron || {}));
        }
        setDebugInfo(`Electron available: ${hasElectron}`);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT_MS);
        });

        setDebugInfo('Calling initializeApp...');

        // Race initialization against timeout
        const result = await Promise.race([
          initializeApp(),
          timeoutPromise,
        ]);

        setDebugInfo(`Init result: ${JSON.stringify(result)}`);

        if (result.success) {
          // Load user profile and preferences from DB
          // These functions now handle the case when DB is not available
          // Also add timeout for these operations
          setDebugInfo('Loading profile and preferences...');

          await Promise.race([
            Promise.all([loadUserProfile(), loadPreferences()]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile load timeout')), 5000)),
          ]).catch(err => {
            console.warn('[Page] Failed to load profile/preferences:', err);
            // Continue anyway - defaults will be used
          });

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
        console.error('[Page] Initialization failed or timed out:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        setDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsInitialized(true);
        setShowOnboarding(true);
      }
    }

    init();
  }, [loadUserProfile, loadPreferences]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  if (!isInitialized) {
    return (
      <div
        className="min-h-full flex items-center justify-center animate-in"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-center animate-slide-up">
          <div className="text-lg font-medium mb-2 font-display" style={{ color: 'var(--primary-text)' }}>
            {t('app.loading')}
          </div>
          <div className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            {t('app.initializing')}
          </div>
          {/* Debug info - shows what step we're on */}
          <div className="text-xs mt-4 opacity-50" style={{ color: 'var(--secondary-text)' }}>
            {debugInfo}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Show warning banner if there was an init error */}
      {initError && (
        <div
          className="fixed top-0 left-0 right-0 px-4 py-2 text-center text-sm"
          style={{ background: 'var(--warning)', color: 'var(--bg)', zIndex: 'var(--z-fixed)' }}
        >
          {t('app.limited_functionality')} ({initError})
        </div>
      )}
      <Home />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    </>
  );
}
