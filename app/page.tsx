'use client';

import { useEffect, useState } from 'react';
import Home from '@/components/Home';
import Onboarding from '@/components/onboarding/Onboarding';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { initializeApp } from '@/lib/init';

export default function Page() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { loadUserProfile, isOnboardingCompleted } = useUserStore();
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    async function init() {
      // Wait a bit to ensure Electron preload script has loaded
      if (typeof window !== 'undefined' && !window.electron) {
        // Wait for Electron API to be available
        let retries = 0;
        while (!window.electron && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
      }

      // Initialize the app
      const result = await initializeApp();

      if (result.success) {
        // Load user profile and preferences from DB
        // These functions now handle the case when DB is not available
        await loadUserProfile();
        await loadPreferences();

        // Check if onboarding is needed
        if (result.needsOnboarding) {
          setShowOnboarding(true);
        }

        setIsInitialized(true);
      } else {
        console.error('Failed to initialize app');
        setIsInitialized(true);
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
      <Home />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    </>
  );
}
