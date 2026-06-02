import { useTranslation } from 'react-i18next';

export type DeckTabId = 'questions' | 'history' | 'sources' | 'settings';

interface DeckTabsProps {
  active: DeckTabId;
  onChange: (tab: DeckTabId) => void;
}

const TABS: { id: DeckTabId; labelKey: string; fallback: string }[] = [
  { id: 'questions', labelKey: 'learn.deck_tab_questions', fallback: 'Questions' },
  { id: 'history', labelKey: 'learn.deck_tab_history', fallback: 'History' },
  { id: 'sources', labelKey: 'learn.deck_tab_sources', fallback: 'Sources' },
  { id: 'settings', labelKey: 'learn.deck_tab_settings', fallback: 'Settings' },
];

export default function DeckTabs({ active, onChange }: DeckTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="lr-deck-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`lr-deck-tab${active === tab.id ? ' on' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {t(tab.labelKey, tab.fallback)}
        </button>
      ))}
    </div>
  );
}
