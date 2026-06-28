import LearnPage from '@/components/learn/LearnPage';
import { useLearnStore, type LearnSection } from '@/lib/store/useLearnStore';
import { useEffect, useRef } from 'react';

export interface LearnTabShellProps {
  /** Sección inicial de Learn al montar (p. ej. decks para Flashcards). */
  initialSection?: LearnSection;
}

/**
 * Envuelve LearnPage y fija la sección activa una vez al abrir pestañas dedicadas (Studio / Flashcards).
 */
export default function LearnTabShell({ initialSection }: LearnTabShellProps) {
  const setActiveSection = useLearnStore((s) => s.setActiveSection);
  const subscribeToLearnEvents = useLearnStore((s) => s.subscribeToLearnEvents);

  const prevInitialSectionRef = useRef(initialSection);
  if (initialSection && initialSection !== prevInitialSectionRef.current) {
    prevInitialSectionRef.current = initialSection;
    setActiveSection(initialSection);
  }

  // Keep the Learn views in sync with main-process mutations (multi-window safe).
  useEffect(() => subscribeToLearnEvents(), [subscribeToLearnEvents]);

  return <LearnPage />;
}
