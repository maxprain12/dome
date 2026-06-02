import DeckEditor from './DeckEditor';
import GenerateWizard from './generate/GenerateWizard';
import LearnLibrary from './library/LearnLibrary';
import DeckOverview from './deck/DeckOverview';
import FlashPlayer from './flash/FlashPlayer';
import { useLearnStore } from '@/lib/store/useLearnStore';

export default function LearnPage() {
  const view = useLearnStore((s) => s.view);
  const isStudying = useLearnStore((s) => s.isStudying);
  const studyMode = useLearnStore((s) => s.studyMode);
  const isGenerateModalOpen = useLearnStore((s) => s.isGenerateModalOpen);
  const isDeckEditorOpen = useLearnStore((s) => s.isDeckEditorOpen);
  const setGenerateModalOpen = useLearnStore((s) => s.setGenerateModalOpen);
  const setDeckEditorOpen = useLearnStore((s) => s.setDeckEditorOpen);

  if (isStudying && studyMode === 'flashcards') {
    return <FlashPlayer />;
  }

  if (view === 'deck') {
    return (
      <>
        <DeckOverview />
        {isGenerateModalOpen ? (
          <GenerateWizard onClose={() => setGenerateModalOpen(false)} />
        ) : null}
        {isDeckEditorOpen ? <DeckEditor onClose={() => setDeckEditorOpen(false)} /> : null}
      </>
    );
  }

  return (
    <>
      <LearnLibrary />
      {isGenerateModalOpen ? (
        <GenerateWizard onClose={() => setGenerateModalOpen(false)} />
      ) : null}
      {isDeckEditorOpen ? <DeckEditor onClose={() => setDeckEditorOpen(false)} /> : null}
    </>
  );
}
