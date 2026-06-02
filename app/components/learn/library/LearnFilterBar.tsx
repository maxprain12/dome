import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLearnStore, type LearnSection } from '@/lib/store/useLearnStore';
import { buildLearnDeckItems, countBySection } from '@/lib/learn/deckItems';

const SECTIONS: { id: LearnSection; labelKey: string; fallback: string }[] = [
  { id: 'all', labelKey: 'learn.tab_all', fallback: 'All' },
  { id: 'decks', labelKey: 'learn.tab_decks', fallback: 'Flashcards' },
  { id: 'mindmaps', labelKey: 'learn.tab_mindmaps', fallback: 'Mind maps' },
  { id: 'quizzes', labelKey: 'learn.tab_quizzes', fallback: 'Quizzes' },
  { id: 'guides', labelKey: 'learn.tab_guides', fallback: 'Guides' },
  { id: 'faqs', labelKey: 'learn.tab_faqs', fallback: 'FAQs' },
  { id: 'timelines', labelKey: 'learn.tab_timelines', fallback: 'Timelines' },
  { id: 'tables', labelKey: 'learn.tab_tables', fallback: 'Tables' },
];

export default function LearnFilterBar() {
  const { t } = useTranslation();
  const activeSection = useLearnStore((s) => s.activeSection);
  const setActiveSection = useLearnStore((s) => s.setActiveSection);
  const searchQuery = useLearnStore((s) => s.searchQuery);
  const setSearchQuery = useLearnStore((s) => s.setSearchQuery);
  const decks = useLearnStore((s) => s.decks);
  const studioOutputs = useLearnStore((s) => s.studioOutputs);
  const deckStats = useLearnStore((s) => s.deckStats);

  const counts = useMemo(
    () => countBySection(buildLearnDeckItems(decks, studioOutputs, deckStats)),
    [decks, studioOutputs, deckStats],
  );

  return (
    <div className="lr-filters">
      <div className="lr-filter-chips">
        {SECTIONS.map((section) => {
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              className={`lr-chip${active ? ' active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {t(section.labelKey, section.fallback)}
              <span className="count">{counts[section.id]}</span>
            </button>
          );
        })}
      </div>
      <label className="lr-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('learn.search_placeholder', 'Search learn…')}
          aria-label={t('learn.search_placeholder', 'Search learn…')}
        />
      </label>
    </div>
  );
}
