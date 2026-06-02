import { useEffect } from 'react';
import { useLearnStore } from '@/lib/store/useLearnStore';

export function useLearnKpis() {
  const kpis = useLearnStore((s) => s.kpis);
  const loadKpis = useLearnStore((s) => s.loadKpis);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    const onInvalidate = () => {
      void loadKpis();
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
  }, [loadKpis]);

  return { kpis, reload: loadKpis };
}
