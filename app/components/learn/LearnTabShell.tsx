import { useEffect } from 'react';
import LearnPage from '@/components/learn/LearnPage';
import { useLearnStore, type LearnSection } from '@/lib/store/useLearnStore';

export interface LearnTabShellProps {
  /** Sección inicial de Learn al montar (p. ej. decks para Flashcards). */
  initialSection?: LearnSection;
}

/**
 * Wraps LearnPage for legacy `studio` / `flashcards` tabs — same hub as Learn.
 */
export default function LearnTabShell({ initialSection }: LearnTabShellProps) {
  const setActiveSection = useLearnStore((s) => s.setActiveSection);
  const subscribeToLearnEvents = useLearnStore((s) => s.subscribeToLearnEvents);

  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection, setActiveSection]);

  useEffect(() => subscribeToLearnEvents(), [subscribeToLearnEvents]);

  return <LearnPage />;
}
