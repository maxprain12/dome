import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/store/useLearnStore';
import type { Flashcard, FlashcardStudySession, QuizData } from '@/types';
import type { QuizRunRecord } from '@/lib/learn/types';
import { normalizeQuizData } from '@/lib/studio/normalizeQuizContent';
import DeckHeader from './DeckHeader';
import DeckTabs, { type DeckTabId } from './DeckTabs';
import DeckKpis from './DeckKpis';
import DeckQuestionsTab from './DeckQuestionsTab';
import DeckHistoryTab from './DeckHistoryTab';
import DeckSourcesTab from './DeckSourcesTab';
import DeckSettingsTab from './DeckSettingsTab';
import QuizPlayer from '../quiz/QuizPlayer';
import MindMapView from '../mindmap/MindMapView';
import GuideReader from '../guide/GuideReader';
import FaqReader from '../faq/FaqReader';
import TimelineView from '../timeline/TimelineView';
import TableView from '../table/TableView';
import type { DeckSettings } from './DeckSettingsTab';
import { computeQuizDeckStats } from '@/lib/learn/quizStats';
import { flashcardStudyableCount, resolveFlashDeckId } from '@/lib/learn/deckItems';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function DeckOverview() {
  const { t } = useTranslation();
  const {
    activeDeckId,
    activeDeckKind,
    decks,
    studioOutputs,
    deckStats,
    closeDeck,
    loadDeckStats,
    startStudy,
    setStudyMode,
    setDeckEditorOpen,
    deleteDeck,
    deleteStudioOutput,
    openGenerateWizard,
  } = useLearnStore();

  const [tab, setTab] = useState<DeckTabId>('questions');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<FlashcardStudySession[]>([]);
  const [quizRuns, setQuizRuns] = useState<QuizRunRecord[]>([]);
  const [sourceTitles, setSourceTitles] = useState<Record<string, string>>({});
  const [playingQuiz, setPlayingQuiz] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const output = studioOutputs.find((o) => o.id === activeDeckId);
  const deck =
    decks.find((d) => d.id === activeDeckId) ??
    (output?.deck_id ? decks.find((d) => d.id === output.deck_id) : undefined);
  const isFlashDeck = activeDeckKind === 'flashcard_deck' || output?.type === 'flashcards';
  const flashDeckId = resolveFlashDeckId(activeDeckId, deck, output);

  const deckSettings = useMemo((): DeckSettings => {
    if (!deck?.settings) return {};
    try {
      return JSON.parse(deck.settings) as DeckSettings;
    } catch {
      return {};
    }
  }, [deck?.settings]);

  const reloadFlashCards = async () => {
    if (!flashDeckId || !isFlashDeck) return;
    const cardsResult = await window.electron.db.flashcards.getCards(flashDeckId);
    if (cardsResult.success && cardsResult.data) setCards(cardsResult.data as Flashcard[]);
  };

  const title = deck?.title ?? output?.title ?? t('learn.untitled', 'Untitled');
  const description = deck?.description;
  const stats = flashDeckId ? deckStats[flashDeckId] : undefined;

  const sourceIds = useMemo(() => {
    if (output?.source_ids) {
      try {
        const parsed = JSON.parse(output.source_ids) as unknown;
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        /* ignore */
      }
    }
    if (deck?.resource_id) return [deck.resource_id];
    return [];
  }, [deck, output]);

  const quizData = useMemo(() => {
    if (output?.type !== 'quiz' || !output.content) return null;
    try {
      return normalizeQuizData(JSON.parse(output.content) as QuizData);
    } catch {
      return null;
    }
  }, [output]);

  const quizStats = useMemo(
    () => (output?.type === 'quiz' ? computeQuizDeckStats(quizRuns, quizData) : null),
    [output?.type, quizRuns, quizData],
  );

  useEffect(() => {
    if (!flashDeckId || !isFlashDeck) return;
    let cancelled = false;
    void loadDeckStats(flashDeckId);
    void (async () => {
      const cardsResult = await window.electron.db.flashcards.getCards(flashDeckId);
      if (!cancelled && cardsResult.success && cardsResult.data) setCards(cardsResult.data as Flashcard[]);
      const sessResult = await window.electron.db.flashcards.getSessions(flashDeckId, 20);
      if (!cancelled && sessResult.success && sessResult.data) setSessions(sessResult.data as FlashcardStudySession[]);
    })();
    return () => { cancelled = true; };
  }, [flashDeckId, isFlashDeck, loadDeckStats]);

  useEffect(() => {
    if (!activeDeckId || output?.type !== 'quiz') return;
    let cancelled = false;
    void (async () => {
      const result = await window.electron.db.quiz.listRuns(activeDeckId);
      if (!cancelled && result.success && result.data) setQuizRuns(result.data as QuizRunRecord[]);
    })();
    return () => { cancelled = true; };
  }, [activeDeckId, output?.type]);

  useEffect(() => {
    if (sourceIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const titles: Record<string, string> = {};
      for (const id of sourceIds.slice(0, 8)) {
        const res = await window.electron.db.resources.getById(id);
        if (res.success && res.data?.title) titles[id] = res.data.title as string;
      }
      if (!cancelled) setSourceTitles(titles);
    })();
    return () => { cancelled = true; };
  }, [sourceIds]);

  if (!activeDeckId) return null;

  const typeLabel =
    isFlashDeck
      ? t('learn.tab_decks', 'Flashcards')
      : output?.type === 'quiz'
        ? t('learn.tab_quizzes', 'Quizzes')
        : output?.type === 'mindmap'
          ? t('learn.tab_mindmaps', 'Mind maps')
          : output?.type === 'guide'
            ? t('learn.tab_guides', 'Guides')
            : (output?.type ?? t('learn.content', 'Content'));

  const total = stats?.total ?? cards.length ?? output?.deck_card_count ?? 0;
  const due = flashcardStudyableCount(stats);
  const mastered = stats?.mastered_cards ?? 0;
  // Continuous maturity climbs with each review; fall back to the mature-card ratio.
  const masteryPct = stats?.maturity ?? (total > 0 ? Math.round((mastered / total) * 100) : 0);

  const handleStudy = () => {
    if (isFlashDeck && flashDeckId) {
      void startStudy(flashDeckId);
      return;
    }
    if (output?.type === 'quiz') {
      setStudyMode('quiz');
      setPlayingQuiz(true);
    }
  };

  if (playingQuiz && output?.type === 'quiz' && quizData) {
    return (
      <QuizPlayer
        data={quizData}
        title={title}
        studioOutputId={output.id}
        onClose={() => {
          setPlayingQuiz(false);
          setStudyMode(null);
          void (async () => {
            const result = await window.electron.db.quiz.listRuns(output.id);
            if (result.success && result.data) setQuizRuns(result.data as QuizRunRecord[]);
          })();
        }}
      />
    );
  }

  if (output?.type === 'mindmap' && output.content) {
    return (
      <div className="h-full">
        <MindMapView output={output} onBack={closeDeck} />
      </div>
    );
  }

  if (output?.type === 'guide' && output.content) {
    return (
      <div className="h-full">
        <GuideReader output={output} onBack={closeDeck} />
      </div>
    );
  }

  if (output?.type === 'faq' && output.content) {
    return (
      <div className="h-full">
        <FaqReader output={output} onBack={closeDeck} />
      </div>
    );
  }

  if (output?.type === 'timeline' && output.content) {
    return (
      <div className="h-full">
        <TimelineView output={output} onBack={closeDeck} />
      </div>
    );
  }

  if (output?.type === 'table' && output.content) {
    return (
      <div className="h-full">
        <TableView output={output} onBack={closeDeck} />
      </div>
    );
  }

  const handlePrefillGenerate = () => {
    openGenerateWizard({
      type: output?.type ?? (isFlashDeck ? 'flashcards' : null),
      sourceIds,
      step: 2,
    });
  };

  const handleDelete = () => setDeleteOpen(true);
  const confirmDelete = () => {
    if (isFlashDeck && deck) void deleteDeck(deck.id);
    else if (output) void deleteStudioOutput(output.id);
    setDeleteOpen(false);
    closeDeck();
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <DeckHeader
        title={title}
        typeLabel={typeLabel}
        description={description}
        sourceTitles={sourceIds.map((id) => sourceTitles[id] ?? id)}
        onBack={closeDeck}
        onStudy={isFlashDeck || output?.type === 'quiz' ? handleStudy : undefined}
        onAddMore={sourceIds.length > 0 || output?.type ? handlePrefillGenerate : undefined}
        onGenerate={() => openGenerateWizard()}
      />
      {isFlashDeck ? (
        <DeckKpis total={total} due={due} mastered={mastered} masteryPct={masteryPct} />
      ) : output?.type === 'quiz' && quizStats ? (
        <DeckKpis
          variant="quiz"
          total={quizStats.total}
          lastScorePct={quizStats.lastScorePct}
          masteryPct={quizStats.masteryPct}
          hardestLabel={quizStats.hardestLabel}
          avgTimeSec={quizStats.avgTimeSec}
        />
      ) : null}
      <DeckTabs active={tab} onChange={setTab} isFlash={isFlashDeck} />
      {tab === 'questions' ? (
        <DeckQuestionsTab
          cards={cards}
          studioOutputId={output?.type === 'quiz' ? output.id : undefined}
          onRefresh={() => {
            void reloadFlashCards();
            if (output?.type === 'quiz') {
              void window.electron.db.quiz.listRuns(output.id).then((result) => {
                if (result.success && result.data) setQuizRuns(result.data as QuizRunRecord[]);
              });
            }
          }}
          quizQuestions={quizData?.questions.map((q) => ({
            id: q.id,
            question: q.question,
            difficulty: q.type,
          }))}
        />
      ) : null}
      {tab === 'history' ? <DeckHistoryTab sessions={sessions} quizRuns={quizRuns} /> : null}
      {tab === 'sources' ? (
        <DeckSourcesTab sourceIds={sourceIds} sourceTitles={sourceTitles} />
      ) : null}
      {tab === 'settings' ? (
        <DeckSettingsTab
          title={title}
          deckId={isFlashDeck ? flashDeckId ?? undefined : undefined}
          settings={deckSettings}
          onEdit={isFlashDeck && flashDeckId ? () => setDeckEditorOpen(true, flashDeckId) : undefined}
          onDelete={handleDelete}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{isFlashDeck ? t('flashcard.confirm_delete_deck', 'Delete this deck?') : t('content.confirm_delete_content', 'Delete this content?')}</AlertDialogTitle><AlertDialogDescription>{title}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDelete}>{t('ui.delete', 'Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
