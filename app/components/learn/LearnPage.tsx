import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Wand2, Plus, Layers } from 'lucide-react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';
import type { LearnSection } from '@/lib/store/useLearnStore';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { EditorialShell } from '@/components/home/editorial/EditorialShell';
import { EditorialPageHero } from '@/components/home/editorial/EditorialPageHero';
import ContentGrid from './ContentGrid';
import GenerateModal from './GenerateModal';
import DeckModal from './DeckModal';
import DeckEditor from './DeckEditor';
import StudyView from './StudyView';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';

export default function LearnPage() {
  const { t } = useTranslation();
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabs = useMemo(
    () =>
      [
        { id: 'all' as const, label: t('learn.tab_all'), icon: <Layers className="size-4" strokeWidth={1.5} /> },
        { id: 'decks' as const, label: t('learn.tab_decks'), icon: <Brain className="size-4" strokeWidth={1.5} /> },
        { id: 'mindmaps' as const, label: t('learn.tab_mindmaps'), icon: <Map className="size-4" strokeWidth={1.5} /> },
        { id: 'quizzes' as const, label: t('learn.tab_quizzes'), icon: <HelpCircle className="size-4" strokeWidth={1.5} /> },
        { id: 'guides' as const, label: t('learn.tab_guides'), icon: <BookOpen className="size-4" strokeWidth={1.5} /> },
        { id: 'faqs' as const, label: t('learn.tab_faqs'), icon: <MessageCircleQuestion className="size-4" strokeWidth={1.5} /> },
        { id: 'timelines' as const, label: t('learn.tab_timelines'), icon: <CalendarRange className="size-4" strokeWidth={1.5} /> },
        { id: 'tables' as const, label: t('learn.tab_tables'), icon: <Table2 className="size-4" strokeWidth={1.5} /> },
      ] satisfies { id: LearnSection; label: string; icon: React.ReactNode }[],
    [t]
  );
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
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  useHorizontalScroll(tabsRef);

  useEffect(() => {
    loadDecks();
    loadStudioOutputs();
  }, [loadDecks, loadStudioOutputs]);

  if (isStudying) {
    return <StudyView />;
  }

  if (activeStudioOutput) {
    return (
      <div className="flex flex-1 h-full overflow-hidden relative" style={{ background: 'var(--dome-bg)' }}>
        <StudioOutputViewer
          output={activeStudioOutput}
          onClose={() => setActiveStudioOutput(null)}
          overlayContext="home"
        />
      </div>
    );
  }

  return (
    <EditorialShell shellClassName="hub-learn-shell">
      <EditorialPageHero
        title={t('learn.page_title')}
        subtitle={t('learn.page_subtitle')}
        stat={
          decks.length > 0
            ? {
                label: t('learn.tab_decks'),
                value: decks.length,
                sub: t('learn.study_space'),
              }
            : undefined
        }
        actions={
          <>
            <button type="button" className="h-pill-btn" onClick={() => setDeckModalOpen(true)}>
              <Plus size={12} strokeWidth={2} aria-hidden />
              {t('learn.new_deck')}
            </button>
            <button type="button" className="h-pill-btn primary" onClick={() => setGenerateModalOpen(true)}>
              <Wand2 size={12} strokeWidth={2} aria-hidden />
              {t('learn.generate')}
            </button>
          </>
        }
      />

      <div ref={tabsRef} className="hub-section-tabs">
        {tabs.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`hub-section-tab${isActive ? ' active' : ''}`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'decks' && decks.length > 0 ? (
                <span className="hub-section-tab-badge">{decks.length}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <ContentGrid />

      {isGenerateModalOpen ? (
        <GenerateModal onClose={() => setGenerateModalOpen(false)} />
      ) : null}

      {isDeckModalOpen ? (
        <DeckModal onClose={() => setDeckModalOpen(false)} />
      ) : null}

      {isDeckEditorOpen ? (
        <DeckEditor onClose={() => setDeckEditorOpen(false)} />
      ) : null}
    </EditorialShell>
  );
}
