import { useEffect } from 'react';
import { useLearnStore } from '@/lib/store/useLearnStore';

export function useLearnStreak() {
  const streak = useLearnStore((s) => s.streak);
  const loadStreak = useLearnStore((s) => s.loadStreak);

  useEffect(() => {
    void loadStreak();
  }, [loadStreak]);

  useEffect(() => {
    const onInvalidate = () => {
      void loadStreak();
    };
    const unsubSession = window.electron.on('flashcard:sessionEnded', onInvalidate);
    const unsubOutput = window.electron.on('studio:outputCreated', onInvalidate);
    const unsubDeckCreated = window.electron.on('flashcard:deckCreated', onInvalidate);
    const unsubDeckUpdated = window.electron.on('flashcard:deckUpdated', onInvalidate);
    const unsubDeckDeleted = window.electron.on('flashcard:deckDeleted', onInvalidate);
    return () => {
      unsubSession();
      unsubOutput();
      unsubDeckCreated();
      unsubDeckUpdated();
      unsubDeckDeleted();
    };
  }, [loadStreak]);

  return { streak, reload: loadStreak };
}
