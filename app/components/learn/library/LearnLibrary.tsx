import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLearnStore, type LearnSection as LearnSectionId } from '@/lib/store/useLearnStore';
import {
  buildLearnDeckItems,
  continueStudyingItems,
  filterLearnItems,
  recentlyCreatedItems,
  titleGlyph,
} from '@/lib/learn/deckItems';
import LearnHeader from './LearnHeader';
import LearnKpiStrip from './LearnKpiStrip';
import LearnStreakStrip from './LearnStreakStrip';
import LearnFilterBar from './LearnFilterBar';
import LearnSection from './LearnSection';
import LearnDeckCard from './LearnDeckCard';
import LearnEmptyState from './LearnEmptyState';

export default function LearnLibrary() {
  const { t } = useTranslation();
  const {
    activeSection,
    searchQuery,
    decks,
    studioOutputs,
    deckStats,
    loadDecks,
    loadStudioOutputs,
    loadAllDeckStats,
    openDeck,
    startStudy,
    setDeckEditorOpen,
    deleteDeck,
    deleteStudioOutput,
  } = useLearnStore();

  useEffect(() => {
    void loadDecks();
    void loadStudioOutputs();
  }, [loadDecks, loadStudioOutputs]);

  useEffect(() => {
    const missing = decks.filter((d) => !deckStats[d.id]).map((d) => d.id);
    if (missing.length > 0) void loadAllDeckStats(missing);
  }, [decks, deckStats, loadAllDeckStats]);

  const allItems = useMemo(
    () => buildLearnDeckItems(decks, studioOutputs, deckStats),
    [decks, studioOutputs, deckStats],
  );

  const filtered = useMemo(
    () => filterLearnItems(allItems, activeSection, searchQuery),
    [allItems, activeSection, searchQuery],
  );

  const continueItems = useMemo(() => continueStudyingItems(filtered), [filtered]);
  const continueIds = useMemo(() => new Set(continueItems.map((i) => i.id)), [continueItems]);
  const recentItems = useMemo(
    () => recentlyCreatedItems(filtered, continueIds),
    [filtered, continueIds],
  );

  const openItem = (item: (typeof filtered)[number]) => {
    if (item.kind === 'flashcard_deck') {
      openDeck(item.id, 'flashcard_deck');
    } else {
      openDeck(item.id, item.type);
    }
  };

  const handleDelete = (item: (typeof filtered)[number]) => {
    const msg =
      item.kind === 'flashcard_deck'
        ? t('flashcard.confirm_delete_deck', 'Delete this deck?')
        : t('content.confirm_delete_content', 'Delete this content?');
    if (!confirm(msg)) return;
    if (item.kind === 'flashcard_deck') void deleteDeck(item.id);
    else void deleteStudioOutput(item.id);
  };

  if (allItems.length === 0) {
    return (
      <div className="lr-frame">
        <LearnHeader />
        <LearnKpiStrip />
        <LearnStreakStrip />
        <LearnFilterBar />
        <LearnEmptyState />
      </div>
    );
  }

  if (filtered.length === 0) {
    const sectionLabels: Record<LearnSectionId, string> = {
      all: t('learn.tab_all', 'All'),
      decks: t('learn.tab_decks', 'Flashcards'),
      mindmaps: t('learn.tab_mindmaps', 'Mind maps'),
      quizzes: t('learn.tab_quizzes', 'Quizzes'),
      guides: t('learn.tab_guides', 'Guides'),
      faqs: t('learn.tab_faqs', 'FAQs'),
      timelines: t('learn.tab_timelines', 'Timelines'),
      tables: t('learn.tab_tables', 'Tables'),
    };
    const filterLabel = activeSection !== 'all' ? sectionLabels[activeSection] : null;

    return (
      <div className="lr-frame">
        <LearnHeader />
        <LearnKpiStrip />
        <LearnStreakStrip />
        <LearnFilterBar />
        <div className="lr-empty lr-empty-filtered">
          <h2>
            {searchQuery.trim()
              ? t('learn.filter_no_search', 'No results for your search')
              : t('learn.filter_no_section', 'No {{section}} yet', {
                  section: filterLabel ?? t('learn.content', 'content'),
                })}
          </h2>
          <p>
            {searchQuery.trim()
              ? t('learn.filter_no_search_sub', 'Try another term or clear the search filter.')
              : t('learn.filter_no_section_sub', 'Generate content or switch to another category.')}
          </p>
        </div>
      </div>
    );
  }

  const sectionLabels: Record<LearnSectionId, string> = {
    all: t('learn.tab_all', 'All'),
    decks: t('learn.tab_decks', 'Flashcards'),
    mindmaps: t('learn.tab_mindmaps', 'Mind maps'),
    quizzes: t('learn.tab_quizzes', 'Quizzes'),
    guides: t('learn.tab_guides', 'Guides'),
    faqs: t('learn.tab_faqs', 'FAQs'),
    timelines: t('learn.tab_timelines', 'Timelines'),
    tables: t('learn.tab_tables', 'Tables'),
  };

  const sectionTitle = activeSection !== 'all' ? sectionLabels[activeSection] : null;
  const filteredItemCount = filtered.reduce((sum, item) => sum + item.count, 0);

  const renderCard = (item: (typeof filtered)[number]) => (
    <LearnDeckCard
      key={`${item.kind}-${item.id}`}
      item={{ ...item, glyph: titleGlyph(item.title) }}
      onOpen={() => openItem(item)}
      onEdit={
        item.kind === 'flashcard_deck'
          ? () => setDeckEditorOpen(true, item.id)
          : undefined
      }
      onDelete={() => handleDelete(item)}
    />
  );

  return (
    <div className="lr-frame">
      <LearnHeader />
      <LearnKpiStrip />
      <LearnStreakStrip />
      <LearnFilterBar />
      <div className="lr-body">
        {activeSection !== 'all' ? (
          <LearnSection
            title={sectionTitle ?? activeSection}
            count={`${filtered.length} · ${filteredItemCount} ${t('learn.items', 'items')}`}
          >
            {filtered.map(renderCard)}
          </LearnSection>
        ) : (
          <>
            {continueItems.length > 0 ? (
              <LearnSection
                title={t('learn.section_continue', 'Continue studying')}
                count={continueItems.length}
              >
                {continueItems.slice(0, 6).map(renderCard)}
              </LearnSection>
            ) : null}

            <LearnSection
              title={t('learn.section_recent', 'Recently created')}
              count={recentItems.length}
              seeAll={
                continueItems.length > 0 && recentItems.length > 6
                  ? () => {
                      const firstDue = continueItems.find(
                        (i) => i.kind === 'flashcard_deck' && (i.dueCount ?? 0) > 0,
                      );
                      if (firstDue) void startStudy(firstDue.id);
                    }
                  : undefined
              }
            >
              {recentItems.map(renderCard)}
            </LearnSection>
          </>
        )}
      </div>
    </div>
  );
}
