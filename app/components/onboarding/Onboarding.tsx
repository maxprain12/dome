import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import WelcomeScreen from './WelcomeScreen';

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const wasInert = root.inert;
    root.inert = true;
    return () => { root.inert = wasInert; };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <WelcomeScreen onComplete={() => onComplete?.()} />
    </div>,
    document.body,
  );
}
