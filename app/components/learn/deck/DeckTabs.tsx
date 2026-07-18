import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
export type DeckTabId = 'questions' | 'history' | 'sources' | 'settings';
interface DeckTabsProps { active: DeckTabId; onChange: (tab: DeckTabId) => void; isFlash?: boolean; }
const TABS: { id: DeckTabId; labelKey: string; fallback: string }[] = [{ id: 'questions', labelKey: 'learn.deck_tab_questions', fallback: 'Questions' }, { id: 'history', labelKey: 'learn.deck_tab_history', fallback: 'History' }, { id: 'sources', labelKey: 'learn.deck_tab_sources', fallback: 'Sources' }, { id: 'settings', labelKey: 'learn.deck_tab_settings', fallback: 'Settings' }];
export default function DeckTabs({ active, onChange, isFlash }: DeckTabsProps) { const { t } = useTranslation(); return <Tabs value={active} onValueChange={(value) => onChange(value as DeckTabId)}><TabsList>{TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id}>{tab.id === 'questions' && isFlash ? t('learn.deck_tab_cards', 'Cards') : t(tab.labelKey, tab.fallback)}</TabsTrigger>)}</TabsList></Tabs>; }
