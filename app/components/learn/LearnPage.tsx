import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Wand2, Plus, Layers } from 'lucide-react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';
import type { LearnSection } from '@/lib/store/useLearnStore';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
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
        { id: 'all' as const, label: t('learn.tab_all'), icon: <Layers className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'decks' as const, label: t('learn.tab_decks'), icon: <Brain className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'mindmaps' as const, label: t('learn.tab_mindmaps'), icon: <Map className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'quizzes' as const, label: t('learn.tab_quizzes'), icon: <HelpCircle className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'guides' as const, label: t('learn.tab_guides'), icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'faqs' as const, label: t('learn.tab_faqs'), icon: <MessageCircleQuestion className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'timelines' as const, label: t('learn.tab_timelines'), icon: <CalendarRange className="w-4 h-4" strokeWidth={1.5} /> },
        { id: 'tables' as const, label: t('learn.tab_tables'), icon: <Table2 className="w-4 h-4" strokeWidth={1.5} /> },
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      {/* Actions toolbar */}
      <div
        className="flex items-center justify-between shrink-0 px-4"
        style={{ borderBottom: '1px solid var(--dome-border)', height: 42 }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
          {t('learn.study_space')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDeckModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: 'var(--dome-surface)',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('learn.new_deck')}
          </button>
          <button
            type="button"
            onClick={() => setGenerateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
          >
            <Wand2 className="w-3.5 h-3.5" />
            {t('learn.generate')}
          </button>
        </div>
      </div>

      {/* Tab bar — full width, no competition with buttons */}
      <div
        ref={tabsRef}
        className="flex items-center shrink-0 overflow-x-auto scrollbar-none"
        style={{ borderBottom: '1px solid var(--dome-border)', height: 38 }}
      >
        {tabs.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className="flex items-center gap-1.5 px-4 h-full text-xs font-medium transition-colors shrink-0 relative"
              style={{
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                background: 'transparent',
                borderBottom: isActive ? '2px solid var(--dome-accent)' : '2px solid transparent',
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'decks' && decks.length > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
                >
                  {decks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <ContentGrid />
      </div>

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
