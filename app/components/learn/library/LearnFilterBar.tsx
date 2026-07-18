import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  const {
    activeSection,
    setActiveSection,
    searchQuery,
    setSearchQuery,
    decks,
    studioOutputs,
    deckStats,
  } = useLearnStore();
  const counts = useMemo(
    () => countBySection(buildLearnDeckItems(decks, studioOutputs, deckStats)),
    [decks, studioOutputs, deckStats],
  );

  return (
    <div className="flex flex-col gap-3 @[36rem]/learn:flex-row @[36rem]/learn:flex-wrap @[36rem]/learn:items-center @[36rem]/learn:justify-between">
      <ToggleGroup
        value={[activeSection]}
        onValueChange={(value) => value[0] && setActiveSection(value[0] as LearnSection)}
        variant="outline"
        size="sm"
        className="max-w-full flex-wrap justify-start"
      >
        {SECTIONS.map((section) => (
          <ToggleGroupItem
            key={section.id}
            value={section.id}
            aria-label={t(section.labelKey, section.fallback)}
          >
            {t(section.labelKey, section.fallback)} · {counts[section.id]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <InputGroup className="w-full min-w-0 @[36rem]/learn:max-w-xs @[36rem]/learn:flex-1">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('learn.search_placeholder', 'Search learn…')}
          aria-label={t('learn.search_placeholder', 'Search learn…')}
        />
      </InputGroup>
    </div>
  );
}
