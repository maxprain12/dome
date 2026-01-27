'use client';

import { useEffect, useState } from 'react';
import Home from '@/components/Home';
import Onboarding from '@/components/onboarding/Onboarding';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { initializeApp } from '@/lib/init';

// Timeout for initialization (10 seconds)
const INIT_TIMEOUT_MS = 10000;

export default function Page() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { loadUserProfile, isOnboardingCompleted } = useUserStore();
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    async function init() {
      try {
        // Wait a bit to ensure Electron preload script has loaded
        if (typeof window !== 'undefined' && !window.electron) {
          // Wait for Electron API to be available (max 2 seconds)
          let retries = 0;
          while (!window.electron && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
          }
        }

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT_MS);
        });

        // Race initialization against timeout
        const result = await Promise.race([
          initializeApp(),
          timeoutPromise,
        ]);

        if (result.success) {
          // Load user profile and preferences from DB
          // These functions now handle the case when DB is not available
          // Also add timeout for these operations
          await Promise.race([
            Promise.all([loadUserProfile(), loadPreferences()]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile load timeout')), 5000)),
          ]).catch(err => {
            console.warn('Failed to load profile/preferences:', err);
            // Continue anyway - defaults will be used
          });

          // Check if onboarding is needed
          if (result.needsOnboarding) {
            setShowOnboarding(true);
          }

          setIsInitialized(true);
        } else {
          console.error('Failed to initialize app');
          setIsInitialized(true);
          setShowOnboarding(true);
        }
      } catch (error) {
        // Handle timeout or any other initialization error
        console.error('Initialization failed or timed out:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
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
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-center">
          <div className="text-lg font-medium mb-2" style={{ color: 'var(--primary)' }}>
            Loading Dome...
          </div>
          <div className="text-sm" style={{ color: 'var(--secondary)' }}>
            Initializing your workspace
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
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm"
          style={{ background: 'var(--warning)', color: 'var(--bg)' }}
        >
          Dome started with limited functionality. Some features may not work. ({initError})
        </div>
      )}
      <Home />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    </>
  );
}
