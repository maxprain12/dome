import { useEffect } from 'react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import LearnNav from './LearnNav';
import ContentGrid from './ContentGrid';
import GenerateModal from './GenerateModal';
import DeckModal from './DeckModal';
import DeckEditor from './DeckEditor';
import StudyView from './StudyView';

export default function LearnPage() {
  const {
    activeSection,
    setActiveSection,
    decks,
    loadDecks,
    loadStudioOutputs,
    isGenerateModalOpen,
    isDeckModalOpen,
    isDeckEditorOpen,
    isStudying,
    setGenerateModalOpen,
    setDeckModalOpen,
    setDeckEditorOpen,
  } = useLearnStore();

  useEffect(() => {
    loadDecks();
    loadStudioOutputs();
  }, [loadDecks, loadStudioOutputs]);

  if (isStudying) {
    return <StudyView />;
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <LearnNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        deckCount={decks.length}
        onCreateDeck={() => setDeckModalOpen(true)}
        onGenerate={() => setGenerateModalOpen(true)}
      />

      <main className="flex-1 overflow-auto">
        <ContentGrid />
      </main>

      {isGenerateModalOpen && (
        <GenerateModal onClose={() => setGenerateModalOpen(false)} />
      )}

      {isDeckModalOpen && (
        <DeckModal onClose={() => setDeckModalOpen(false)} />
      )}

      {isDeckEditorOpen && (
        <DeckEditor onClose={() => setDeckEditorOpen(false)} />
      )}
    </div>
  );
}
